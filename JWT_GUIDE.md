# JWT Authentication — How It Works In This Project

A beginner-friendly guide that maps every step of the JWT flow to the actual files in your codebase.

---

## What is JWT?

JWT (JSON Web Token) is like a **digital ID card** the server gives you after you prove who you are (login).

- You show this ID card with every request
- The server checks if it's valid (not expired, not tampered)
- If valid, the server knows who you are without checking the database

---

## The Complete Flow (Step by Step)

### STEP 1: User Registers or Logs In

**What happens:**
```
User sends: POST /api/auth/login  { email: "john@example.com", password: "user123" }
```

**Where in code:** `server/controllers/authController.js` → `login()` function (line 92)

**What the code does:**
1. Finds the user by email in MongoDB
2. Compares the password with the stored bcrypt hash
3. If correct → generates TWO tokens:
   - **Access Token** (expires in 15 minutes) — used for every API call
   - **Refresh Token** (expires in 7 days) — used to get a new access token when it expires
4. Returns both tokens to the client

**Response the client gets:**
```json
{
  "success": true,
  "data": {
    "user": { "name": "John", "email": "john@example.com", "role": "user" },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

---

### STEP 2: Client Stores the Tokens

**Where in code:** `public/js/app.js` → `setTokens()` function

```javascript
// The frontend saves both tokens in localStorage
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
```

---

### STEP 3: Client Sends Token with Every Request

**Where in code:** `public/js/app.js` → `api()` function

Every API call includes the access token in the `Authorization` header:

```
GET /api/bookings
Headers: {
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..."
                    ^^^^^^^ ^^^^^^^^^^^^^^^^^^^^^^
                    prefix   the actual JWT token
}
```

---

### STEP 4: Server Verifies the Token (MIDDLEWARE)

**Where in code:** `server/middleware/auth.js` → `authenticate()` function (line 67)

This runs BEFORE any protected route handler. Here's the simplified flow:

```
Request arrives with "Authorization: Bearer <token>"
         │
         ▼
    Extract token from header
         │
         ▼
    jwt.verify(token, SECRET_KEY)
         │
    ┌────┴────┐
    │         │
  VALID    INVALID/EXPIRED
    │         │
    ▼         ▼
 Attach     Return 401
 user info  "Access denied"
 to req.user
    │
    ▼
 Continue to
 the actual
 route handler
```

After verification, any controller can access:
- `req.user.userId` — who is making the request
- `req.user.role` — "user" or "admin"
- `req.user.email` — their email

---

### STEP 5: Access Token Expires (15 min) → Auto-Refresh

**Where in code:** `public/js/app.js` → `api()` function (the 401 handler)

```
Client makes a request
         │
         ▼
    Server returns 401 "TOKEN_EXPIRED"
         │
         ▼
    Client automatically calls POST /api/auth/refresh
    with the refresh token
         │
         ▼
    Server verifies refresh token → issues NEW pair
         │
         ▼
    Client retries the original request with new access token
    (User never notices this happened!)
```

---

### STEP 6: Logout

**Where in code:** `server/controllers/authController.js` → `logout()` (line 208)

```
Client calls POST /api/auth/logout
         │
         ▼
    Server sets User.refreshToken = null in database
         │
         ▼
    Next time client tries to refresh → FAILS → must login again
```

---

## Where Each Piece Lives (File Map)

| What | File | Lines |
|------|------|-------|
| Password hashing (bcrypt) | `server/models/User.js` | 89-93 |
| Password comparison | `server/models/User.js` | 99-101 |
| Token CREATION (sign) | `server/middleware/auth.js` | 120-134 |
| Token VERIFICATION (verify) | `server/middleware/auth.js` | 67-111 |
| Register endpoint | `server/controllers/authController.js` | 50-82 |
| Login endpoint | `server/controllers/authController.js` | 92-127 |
| Refresh endpoint | `server/controllers/authController.js` | 147-198 |
| Logout endpoint | `server/controllers/authController.js` | 208-215 |
| Role check (RBAC) | `server/middleware/rbac.js` | 33-52 |
| Routes defined | `server/routes/auth.js` | all |
| Frontend token storage | `public/js/app.js` | setTokens() |
| Frontend auto-refresh | `public/js/app.js` | api() function |
| JWT secrets config | `.env` | JWT_ACCESS_SECRET, JWT_REFRESH_SECRET |

---

## What's Inside a JWT Token?

A JWT has 3 parts separated by dots: `HEADER.PAYLOAD.SIGNATURE`

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.    ← HEADER (algorithm used)
eyJ1c2VySWQiOiI2NWYuLi4iLCJyb2xlIjoiYWRtaW4ifQ.  ← PAYLOAD (your data)
SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c    ← SIGNATURE (proof it's real)
```

**PAYLOAD contains** (set in `server/middleware/auth.js` line 122):
```json
{
  "userId": "65f...",     // MongoDB user ID
  "role": "user",         // For RBAC checks
  "email": "john@ex.com", // For logging
  "iat": 1709000000,      // Issued At (auto-added)
  "exp": 1709000900       // Expires At (auto-added, 15 min later)
}
```

---

## Why TWO Tokens?

| | Access Token | Refresh Token |
|---|---|---|
| **Lifespan** | 15 minutes | 7 days |
| **Sent with** | Every API request | Only to /refresh endpoint |
| **If stolen** | Attacker has 15 min max | Can be revoked by clearing DB |
| **Stored in DB?** | No (stateless) | Yes (hashed) |

**Why not just one long-lived token?**
If someone steals a 7-day token, they have full access for 7 days with no way to stop them. With the two-token system, the access token expires fast, and the refresh token can be revoked on logout.

---

## Test It Yourself

### In DevTools Console (F12 → Console tab):

```javascript
// See your stored tokens
console.log('Access:', localStorage.getItem('accessToken'));
console.log('Refresh:', localStorage.getItem('refreshToken'));

// Decode the access token payload (middle part)
const token = localStorage.getItem('accessToken');
const payload = JSON.parse(atob(token.split('.')[1]));
console.log('Token payload:', payload);
console.log('Expires at:', new Date(payload.exp * 1000));
```

### In Network Tab:
1. Login → watch the `/api/auth/login` response (see both tokens)
2. Click "My Bookings" → watch `/api/bookings` request headers (see `Authorization: Bearer ...`)
3. Wait 15 min → watch the auto-refresh happen (a `/api/auth/refresh` call appears)
