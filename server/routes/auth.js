/*
 * ─────────────────────────────────────────────────────────────
 *  AUTH ROUTES
 * ─────────────────────────────────────────────────────────────
 *  Defines the authentication API surface.
 *
 *  PUBLIC routes (no token needed):
 *    POST /api/auth/register
 *    POST /api/auth/login
 *    POST /api/auth/refresh
 *
 *  PROTECTED routes (access token required):
 *    POST /api/auth/logout
 *    GET  /api/auth/profile
 *
 *  CONNECTED TO:
 *    - server/controllers/authController.js → handler functions
 *    - server/middleware/auth.js             → authenticate
 *    - server/index.js                       → mounted at /api/auth
 * ─────────────────────────────────────────────────────────────
 */

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const {
  register,
  login,
  refresh,
  logout,
  getProfile,
} = require('../controllers/authController');

/* Public – no authentication needed */
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);

/* Protected – must be logged in */
router.post('/logout', authenticate, logout);
router.get('/profile', authenticate, getProfile);

module.exports = router;
