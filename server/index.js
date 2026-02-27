/*
 * ─────────────────────────────────────────────────────────────
 *  SERVER ENTRY POINT
 * ─────────────────────────────────────────────────────────────
 *  This is the main file that bootstraps the entire application.
 *
 *  BOOT SEQUENCE:
 *    1. Load environment configuration
 *    2. Connect to MongoDB
 *    3. Verify Redis connection
 *    4. Configure Express middleware stack
 *    5. Mount API routes
 *    6. Register global error handler
 *    7. Start booking expiry jobs (Redis listener + cron)
 *    8. Listen on configured port
 *
 * ═════════════════════════════════════════════════════════════
 *  ARCHITECTURE OVERVIEW
 * ═════════════════════════════════════════════════════════════
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │                      CLIENT                             │
 *  │              (Browser / Mobile App)                     │
 *  └───────────────────────┬─────────────────────────────────┘
 *                          │
 *                     HTTP / REST
 *                          │
 *  ┌───────────────────────▼─────────────────────────────────┐
 *  │                EXPRESS SERVER                            │
 *  │                                                          │
 *  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
 *  │  │   CORS   │→ │  Rate    │→ │   JSON   │→ │ Static │  │
 *  │  │          │  │  Limit   │  │  Parser  │  │ Files  │  │
 *  │  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
 *  │                                                          │
 *  │  ROUTES:                                                 │
 *  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
 *  │  │ /api/auth  │  │/api/search │  │/api/bookings│        │
 *  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘        │
 *  │  ┌─────┴──────┐  ┌─────┴──────┐  ┌─────┴──────┐        │
 *  │  │/api/invent.│  │ /api/tasks │  │  Error     │        │
 *  │  └────────────┘  └────────────┘  │  Handler   │        │
 *  │                                   └────────────┘        │
 *  └────────────────────┬───────────────────┬────────────────┘
 *                       │                   │
 *              ┌────────▼────────┐  ┌───────▼────────┐
 *              │    MongoDB      │  │     Redis      │
 *              │  (Persistent    │  │  (Cache, Locks,│
 *              │   Storage)      │  │   Hold Timers) │
 *              └─────────────────┘  └────────────────┘
 *
 *  CONNECTED TO:
 *    - server/config/*        → DB, Redis, env
 *    - server/routes/*        → all route files
 *    - server/middleware/*    → auth, RBAC, error handler
 *    - server/jobs/*          → booking expiry
 *    - public/*               → static frontend files
 * ─────────────────────────────────────────────────────────────
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const config = require('./config/env');
const connectDB = require('./config/db');
const { redis } = require('./config/redis');

/* Route modules */
const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const bookingRoutes = require('./routes/booking');
const searchRoutes = require('./routes/search');
const taskRoutes = require('./routes/task');
const shareRoutes = require('./routes/share');
const { redirectShareLink } = require('./controllers/shareController');

/* Middleware */
const { errorHandler } = require('./middleware/errorHandler');

/* Background jobs */
const { setupExpiryJob } = require('./jobs/bookingExpiry');

const app = express();

/* ─── Middleware Stack ───────────────────────────────────── */

/* CORS – allow all origins in development */
app.use(cors());

/*
 * Rate limiter – 100 requests per minute per IP.
 * Prevents brute-force attacks and search API abuse.
 */
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests. Please slow down.' },
  })
);

/* JSON body parser – limit payload size to prevent abuse */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

/* Serve static frontend files from /public */
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ─── API Routes ─────────────────────────────────────────── */
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/share', shareRoutes);

/* ─── Short URL Redirect (e.g. /s/Ab3xK9z) ──────────────── */
app.get('/s/:code', redirectShareLink);

/* ─── Health Check ───────────────────────────────────────── */
app.get('/api/health', async (req, res) => {
  const redisOk = redis.status === 'ready';
  res.json({
    success: true,
    uptime: process.uptime(),
    mongodb: 'connected',
    redis: redisOk ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

/* ─── SPA Fallback ───────────────────────────────────────── */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

/* ─── Global Error Handler (must be LAST middleware) ─────── */
app.use(errorHandler);

/* ─── Boot Sequence ──────────────────────────────────────── */
async function startServer() {
  /* 1. Connect to MongoDB */
  await connectDB();

  /* 2. Verify Redis is reachable */
  try {
    await redis.ping();
    console.log('[Redis] PING → PONG');
  } catch (err) {
    console.warn('[Redis] Not reachable – caching/locking disabled:', err.message);
  }

  /* 3. Start booking expiry jobs */
  setupExpiryJob();

  /* 4. Listen */
  app.listen(config.port, () => {
    console.log(`\n══════════════════════════════════════════════`);
    console.log(`  Global Booking Engine`);
    console.log(`  Mode: ${config.nodeEnv}`);
    console.log(`  Port: ${config.port}`);
    console.log(`  URL:  http://localhost:${config.port}`);
    console.log(`══════════════════════════════════════════════\n`);
  });
}

startServer().catch((err) => {
  console.error('[Fatal] Failed to start server:', err);
  process.exit(1);
});
