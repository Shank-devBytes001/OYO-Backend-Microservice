/*
 * ─────────────────────────────────────────────────────────────
 *  JWT AUTHENTICATION MIDDLEWARE
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Verifies the JWT Access Token on every protected route.
 *    Extracts the user payload and attaches it to `req.user`
 *    so downstream controllers know WHO is making the request.
 *
 * ═════════════════════════════════════════════════════════════
 *  TOKEN ARCHITECTURE (Access + Refresh)
 * ═════════════════════════════════════════════════════════════
 *
 *  We implement a TWO-TOKEN system for security:
 *
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  ACCESS TOKEN                                            │
 *  │    Lifespan: 15 minutes (short)                          │
 *  │    Sent in:  Authorization: Bearer <token>               │
 *  │    Contains: { userId, role, email }                     │
 *  │    Purpose:  Authenticates every API request             │
 *  │                                                          │
 *  │  WHY SHORT-LIVED?                                        │
 *  │    If stolen, the attacker has a maximum 15-minute        │
 *  │    window before it expires. No revocation needed.       │
 *  └──────────────────────────────────────────────────────────┘
 *
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  REFRESH TOKEN                                           │
 *  │    Lifespan: 7 days (long)                               │
 *  │    Sent in:  HTTP-only cookie or request body            │
 *  │    Contains: { userId }                                  │
 *  │    Stored:   Hashed in User.refreshToken field           │
 *  │    Purpose:  Silently reissues an expired Access Token   │
 *  │                                                          │
 *  │  WHY STORE A HASH?                                       │
 *  │    Even if the database leaks, the attacker can't use    │
 *  │    the hashed refresh token directly.                    │
 *  │                                                          │
 *  │  REVOCATION:                                             │
 *  │    On logout, User.refreshToken is set to null.          │
 *  │    The next /refresh call will fail → user re-logs in.   │
 *  └──────────────────────────────────────────────────────────┘
 *
 *  CONNECTED TO:
 *    - server/config/env.js                → JWT secrets & expiry
 *    - server/controllers/authController.js → issues tokens
 *    - server/middleware/rbac.js            → runs AFTER this
 *    - server/routes/*.js                   → applied to protected routes
 * ─────────────────────────────────────────────────────────────
 */

const jwt = require('jsonwebtoken');
const config = require('../config/env');

/*
 * ─── authenticate ───────────────────────────────────────────
 *  Express middleware that:
 *    1. Reads the Authorization header
 *    2. Verifies the JWT signature & expiry
 *    3. Attaches decoded payload to req.user
 *    4. Passes to next middleware/controller
 *
 *  On failure → 401 Unauthorized
 * ────────────────────────────────────────────────────────────
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.',
    });
  }

  /* Extract the token after "Bearer " */
  const token = authHeader.split(' ')[1];

  try {
    /*
     * jwt.verify() checks:
     *   - Signature matches JWT_ACCESS_SECRET
     *   - Token hasn't expired (exp claim)
     *   - Token structure is valid
     */
    const decoded = jwt.verify(token, config.jwt.accessSecret);

    /*
     * Attach to request so controllers can access:
     *   req.user.userId  → Mongo ObjectId
     *   req.user.role    → "user" | "admin"
     *   req.user.email   → for logging/audit
     */
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired. Please refresh your token.',
        code: 'TOKEN_EXPIRED',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid token.',
    });
  }
}

/*
 * ─── Token Generation Helpers ───────────────────────────────
 *  Used by authController during login/register/refresh.
 *  Separated here so the signing logic is in one place.
 * ────────────────────────────────────────────────────────────
 */

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role, email: user.email },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiry }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user._id },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiry }
  );
}

module.exports = { authenticate, generateAccessToken, generateRefreshToken };
