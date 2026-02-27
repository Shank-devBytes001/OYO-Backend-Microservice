/*
 * ─────────────────────────────────────────────────────────────
 *  AUTH CONTROLLER
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Handles user registration, login, token refresh, and
 *    logout. Issues JWT access + refresh token pairs.
 *
 *  ENDPOINTS HANDLED:
 *    POST /api/auth/register → register()
 *    POST /api/auth/login    → login()
 *    POST /api/auth/refresh  → refresh()
 *    POST /api/auth/logout   → logout()
 *
 *  SECURITY FLOW:
 *    1. User logs in with email + password
 *    2. Server returns { accessToken, refreshToken }
 *    3. Client sends accessToken in Authorization header
 *    4. When accessToken expires (15 min), client calls /refresh
 *       with the refreshToken to get a new pair
 *    5. On logout, refreshToken is wiped from the database
 *
 *  CONNECTED TO:
 *    - server/models/User.js              → Mongoose model
 *    - server/middleware/auth.js           → token generation helpers
 *    - server/middleware/errorHandler.js   → asyncHandler wrapper
 *    - server/routes/auth.js              → route definitions
 * ─────────────────────────────────────────────────────────────
 */

const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('../config/env');
const { generateAccessToken, generateRefreshToken } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');

/*
 * ─── REGISTER ───────────────────────────────────────────────
 *  Creates a new user account.
 *
 *  Body: { name, email, password, role? }
 *  Note: role defaults to "user". To create an admin, pass
 *        role: "admin" (in production this would be restricted
 *        to a super-admin endpoint or seed script).
 *
 *  Returns: { user, accessToken, refreshToken }
 * ────────────────────────────────────────────────────────────
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  /* Check if email already taken */
  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: 'Email already registered.',
    });
  }

  /* Create user – password is hashed by the pre-save hook */
  const user = await User.create({ name, email, password, role });

  /* Generate token pair */
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  /*
   * Store a HASH of the refresh token in the database.
   * We never store the raw token – if the DB leaks, the
   * attacker can't forge refresh requests.
   */
  user.refreshToken = await bcrypt.hash(refreshToken, 10);
  await user.save();

  console.log(`[Auth] REGISTER → ${user.email} (role: ${user.role})`);

  res.status(201).json({
    success: true,
    message: 'Registration successful.',
    data: { user, accessToken, refreshToken },
  });
});

/*
 * ─── LOGIN ──────────────────────────────────────────────────
 *  Authenticates with email + password.
 *
 *  Body: { email, password }
 *  Returns: { user, accessToken, refreshToken }
 * ────────────────────────────────────────────────────────────
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  /*
   * Use +password to explicitly include the password field
   * which is excluded by default (select: false in schema).
   */
  const user = await User.findOne({ email }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password.',
    });
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  /* Update stored refresh token hash */
  user.refreshToken = await bcrypt.hash(refreshToken, 10);
  await user.save();

  console.log(`[Auth] LOGIN  → ${user.email} (role: ${user.role})`);

  res.json({
    success: true,
    message: 'Login successful.',
    data: { user, accessToken, refreshToken },
  });
});

/*
 * ─── REFRESH ────────────────────────────────────────────────
 *  Issues a new access + refresh token pair.
 *
 *  Body: { refreshToken }
 *
 *  Flow:
 *    1. Verify the refresh token's JWT signature
 *    2. Find the user and load their stored hash
 *    3. Compare provided token against stored hash
 *    4. Issue new pair + rotate the stored hash
 *
 *  TOKEN ROTATION:
 *    Every refresh call invalidates the old refresh token
 *    and issues a new one. This limits the damage if a
 *    refresh token is intercepted.
 * ────────────────────────────────────────────────────────────
 */
const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Refresh token is required.',
    });
  }

  /* Verify JWT structure and expiry */
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired refresh token.',
    });
  }

  /* Load user with the stored hash */
  const user = await User.findById(decoded.userId).select('+refreshToken');

  if (!user || !user.refreshToken) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token revoked. Please log in again.',
    });
  }

  /* Compare provided token against stored hash */
  const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      message: 'Refresh token mismatch. Please log in again.',
    });
  }

  /* Issue new pair (rotation) */
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
  await user.save();

  res.json({
    success: true,
    data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
  });
});

/*
 * ─── LOGOUT ─────────────────────────────────────────────────
 *  Invalidates the refresh token by clearing it from the DB.
 *  The access token remains valid until it naturally expires
 *  (max 15 min) – this is an accepted trade-off for stateless
 *  JWT architecture.
 * ────────────────────────────────────────────────────────────
 */
const logout = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user.userId, { refreshToken: null });

  console.log(`[Auth] LOGOUT → ${req.user.email}`);

  res.json({
    success: true,
    message: 'Logged out successfully.',
  });
});

/*
 * ─── GET PROFILE ────────────────────────────────────────────
 *  Returns the authenticated user's profile data.
 * ────────────────────────────────────────────────────────────
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.userId);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  res.json({ success: true, data: { user } });
});

module.exports = { register, login, refresh, logout, getProfile };
