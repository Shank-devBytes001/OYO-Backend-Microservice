# Global Booking Engine

A high-concurrency booking system for flights and hotels built with **Node.js**, **Express**, **MongoDB**, **Redis**, and **JWT authentication**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                     │
│                  Vanilla JS SPA (public/)                   │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP REST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      EXPRESS SERVER                         │
│                                                             │
│  Middleware Pipeline:                                       │
│  CORS → Rate Limit → JSON Parser → Static Files             │
│                                                             │
│  Routes:                                                    │
│  /api/auth      → Register, Login, Refresh, Logout          │
│  /api/search    → Public search (cached)                    │
│  /api/bookings  → Create, Confirm, Cancel, Complete         │
│  /api/inventory → CRUD (admin only)                         │
│  /api/tasks     → CRUD (linked to bookings)                 │
│                                                             │
│  Global Error Handler (last middleware)                     │
└──────────────┬──────────────────────────┬───────────────────┘
               │                          │
    ┌──────────▼──────────┐    ┌──────────▼──────────┐
    │      MongoDB        │    │       Redis          │
    │                     │    │                      │
    │  Collections:       │    │  Purposes:           │
    │  • users            │    │  • Search cache      │
    │  • inventories      │    │  • Distributed locks │
    │  • bookings         │    │  • Booking hold TTLs │
    │  • tasks            │    │  • Keyspace events   │
    └─────────────────────┘    └──────────────────────┘
```

---

## File Structure

```
booking-system/
│
├── .env                          # Environment variables (not committed)
├── .env.example                  # Template for .env
├── package.json                  # Dependencies & scripts
├── README.md                     # This file
│
├── server/
│   ├── index.js                  # Entry point & boot sequence
│   │
│   ├── config/
│   │   ├── env.js                # Centralised config loader
│   │   ├── db.js                 # MongoDB connection
│   │   └── redis.js              # Redis client factory (2 clients)
│   │
│   ├── models/
│   │   ├── User.js               # User schema (bcrypt, RBAC)
│   │   ├── Inventory.js          # Flight/Hotel schema (optimistic concurrency)
│   │   ├── Booking.js            # Booking schema (state machine)
│   │   └── Task.js               # Itinerary task schema
│   │
│   ├── services/
│   │   ├── lockService.js        # Distributed lock (Redis + Mongo atomic)
│   │   ├── cacheService.js       # Cache-aside pattern
│   │   ├── bookingService.js     # State machine + hold timer
│   │   └── searchService.js      # MongoDB aggregation pipeline
│   │
│   ├── middleware/
│   │   ├── auth.js               # JWT verification + token generators
│   │   ├── rbac.js               # Role-based access control
│   │   └── errorHandler.js       # Global error handler + asyncHandler
│   │
│   ├── controllers/
│   │   ├── authController.js     # Register, Login, Refresh, Logout
│   │   ├── inventoryController.js# Admin CRUD for inventory
│   │   ├── bookingController.js  # Booking lifecycle endpoints
│   │   ├── searchController.js   # Cached search endpoint
│   │   └── taskController.js     # Task CRUD
│   │
│   ├── routes/
│   │   ├── auth.js               # /api/auth/*
│   │   ├── inventory.js          # /api/inventory/*
│   │   ├── booking.js            # /api/bookings/*
│   │   ├── search.js             # /api/search
│   │   └── task.js               # /api/tasks/*
│   │
│   ├── jobs/
│   │   └── bookingExpiry.js      # Auto-cancel expired bookings
│   │
│   └── seeds/
│       └── seed.js               # Sample data seeder
│
└── public/
    ├── index.html                # SPA shell
    ├── css/style.css             # Design system
    └── js/app.js                 # Frontend SPA logic
```

---

## How Components Connect

### Request Flow (Booking Creation)

```
1. Client clicks "Book Now"
   └─► POST /api/bookings { inventoryId, quantity }

2. Express routes → booking.js
   └─► authenticate middleware (verifies JWT)
       └─► bookingController.createBooking()

3. Controller calls bookingService.createBooking()
   │
   ├─► Step 1: Inventory.findById() → get current price
   │
   ├─► Step 2: lockService.acquireAndDecrement()
   │   ├─► Redis SET NX (pessimistic lock)
   │   ├─► MongoDB findOneAndUpdate with $gte guard (optimistic check)
   │   └─► Redis DEL (release lock)
   │
   ├─► Step 3: Booking.create() → status: PENDING_PAYMENT
   │
   ├─► Step 4: Redis SET booking_hold:<id> EX 900 (15-min timer)
   │
   └─► Step 5: cacheService.invalidatePattern() → clear stale search cache

4. Response → { booking } with 201 status
```

### Request Flow (Search)

```
1. Client submits search form
   └─► GET /api/search?type=hotel&location=Paris&maxPrice=50000

2. Express routes → search.js (PUBLIC, no auth)
   └─► searchController.search()

3. Controller calls cacheService.getOrSet(params, fetchFn)
   │
   ├─► Cache HIT: Return parsed JSON from Redis immediately
   │
   └─► Cache MISS:
       ├─► Call searchService.search(params)
       │   └─► Build & execute MongoDB aggregation pipeline:
       │       $match (type + active + available)
       │       → $match (price range)
       │       → $match (location regex)
       │       → $sort (price ascending)
       │       → $facet ({ data: [skip, limit], totalCount })
       │
       ├─► Store result in Redis with 60s TTL
       └─► Return fresh results
```

---

## Core Concepts Explained

### 1. The Double-Booking Problem

**Scenario:** 100 users click "Book" on the last available room simultaneously.

**Solution:** Two-layer locking:

| Layer | Type | Mechanism | Purpose |
|-------|------|-----------|---------|
| 1 | Pessimistic | Redis `SET NX EX` | Serialise access – only one request proceeds |
| 2 | Optimistic | MongoDB `$gte` guard | Safety net – even if lock fails, DB prevents negative stock |

**Why not just one?**
- Redis lock alone: If Redis crashes mid-lock, another request could slip through
- MongoDB guard alone: Under extreme concurrency, causes thundering herd of failed retries

### 2. Booking State Machine

```
PENDING_PAYMENT ──► CONFIRMED ──► COMPLETED
       │                │
       └──► CANCELLED ◄─┘
```

- **PENDING_PAYMENT**: Inventory decremented, 15-min timer started
- **CONFIRMED**: Payment received, timer removed
- **CANCELLED**: Inventory restored, timer removed
- **COMPLETED**: Travel completed (terminal state)

Invalid transitions (e.g., COMPLETED → PENDING_PAYMENT) throw 400 errors.

### 3. Cache-Aside Pattern

```
Client ──► Redis GET ──► HIT? Return cached data
                │
                └── MISS ──► MongoDB query ──► SET in Redis (TTL 60s) ──► Return
```

- Cache key = SHA-256 hash of sorted query parameters
- Short TTL (60s) prevents stale availability data
- Invalidated on every inventory mutation (booking, cancel, admin update)

### 4. JWT Token Architecture

| Token | Lifespan | Storage | Purpose |
|-------|----------|---------|---------|
| Access | 15 min | Client memory / localStorage | Authenticates API requests |
| Refresh | 7 days | Client + hashed in MongoDB | Reissues expired access tokens |

**Token Rotation:** Every refresh call issues a NEW refresh token and invalidates the old one.

### 5. Auto-Cancel Mechanism (15-min Hold)

Two redundant mechanisms ensure no booking stays in PENDING_PAYMENT forever:

1. **Redis Keyspace Events** (real-time): When `booking_hold:<id>` expires, a subscriber catches the event and cancels
2. **Cron Job** (safety net): Every 2 minutes, queries for stale PENDING_PAYMENT bookings

---

## Setup & Run

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or cloud)

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env
# Edit .env with your MongoDB URI and Redis details

# 3. Seed the database with sample data
npm run seed

# 4. Start the server
npm run dev

# 5. Open browser
# http://localhost:3000
```

### Test Accounts (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@booking.com | admin123 |
| User | john@example.com | user123 |

---

## API Reference

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/login | No | Get token pair |
| POST | /api/auth/refresh | No | Refresh tokens |
| POST | /api/auth/logout | Yes | Invalidate refresh token |
| GET | /api/auth/profile | Yes | Get current user |

### Search

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/search | No | Search inventory (cached) |

Query params: `type`, `category`, `minPrice`, `maxPrice`, `origin`, `destination`, `location`, `dateFrom`, `dateTo`, `page`, `limit`, `sortBy`

### Bookings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/bookings | Yes | Create booking |
| GET | /api/bookings | Yes | List my bookings |
| GET | /api/bookings/:id | Yes | Get booking details |
| PATCH | /api/bookings/:id/confirm | Yes | Confirm payment |
| PATCH | /api/bookings/:id/cancel | Yes | Cancel booking |
| PATCH | /api/bookings/:id/complete | Yes | Mark completed |

### Inventory (Admin)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/inventory | Admin | Create item |
| GET | /api/inventory | Admin | List all items |
| GET | /api/inventory/:id | Admin | Get item |
| PUT | /api/inventory/:id | Admin | Update item |
| DELETE | /api/inventory/:id | Admin | Deactivate item |

### Tasks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/tasks | Yes | Create task |
| GET | /api/tasks | Yes | List tasks |
| GET | /api/tasks/:id | Yes | Get task |
| PUT | /api/tasks/:id | Yes | Update task |
| DELETE | /api/tasks/:id | Yes | Delete task |

### Health

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/health | No | System health check |

---

## ERD (Entity Relationship Diagram)

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    USER      │       │    BOOKING       │       │  INVENTORY   │
├──────────────┤       ├──────────────────┤       ├──────────────┤
│ _id          │◄──┐   │ _id              │   ┌──►│ _id          │
│ email        │   │   │ userId      ─────┼───┘   │ type         │
│ password     │   └───┼─ userId          │       │ title        │
│ name         │       │ inventoryId ─────┼───────│ category     │
│ role         │       │ quantity         │       │ price        │
│ refreshToken │       │ unitPrice        │       │ totalUnits   │
│ createdAt    │       │ totalPrice       │       │ availableUnits│
│ updatedAt    │       │ status           │       │ origin       │
└──────────────┘       │ confirmedAt      │       │ destination  │
                       │ cancelledAt      │       │ location     │
       ┌───────────┐   │ cancellationReason│      │ ...          │
       │   TASK    │   │ createdAt        │       │ isActive     │
       ├───────────┤   │ updatedAt        │       └──────────────┘
       │ _id       │   └──────────────────┘
       │ userId ───┼──► (User._id)
       │ bookingId ┼──► (Booking._id)
       │ title     │
       │ status    │
       │ priority  │
       │ dueDate   │
       └───────────┘
```
