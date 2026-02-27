/*
 * ─────────────────────────────────────────────────────────────
 *  ROLE-BASED ACCESS CONTROL (RBAC) MIDDLEWARE
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Restricts route access based on the user's role.
 *    Must run AFTER the `authenticate` middleware so that
 *    `req.user.role` is available.
 *
 *  USAGE IN ROUTES:
 *    router.post('/inventory', authenticate, authorize('admin'), handler);
 *    router.get('/bookings',   authenticate, authorize('user', 'admin'), handler);
 *
 *  ROLE HIERARCHY:
 *    - "admin" → Can manage inventory (add/edit/delete)
 *                Can view all bookings (admin dashboard)
 *    - "user"  → Can search, book, manage own bookings & tasks
 *
 *  CONNECTED TO:
 *    - server/middleware/auth.js → authenticate() runs first
 *    - server/routes/inventory.js → authorize('admin') on create/update/delete
 *    - server/routes/booking.js   → authorize('user','admin') on booking
 * ─────────────────────────────────────────────────────────────
 */

/*
 * ─── authorize ──────────────────────────────────────────────
 *  Factory function that returns a middleware.
 *  Accepts one or more role strings.
 *
 *  @param {...string} roles – Allowed roles (e.g. 'admin', 'user')
 *  @returns {Function}      – Express middleware
 *
 *  Example: authorize('admin')
 *    → Only admins pass through
 *  Example: authorize('user', 'admin')
 *    → Both users and admins pass through
 * ────────────────────────────────────────────────────────────
 */
function authorize(...roles) {
  return (req, res, next) => {
    /*
     * req.user is set by authenticate() middleware.
     * If it's missing, something is misconfigured.
     */
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required before authorization.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): [${roles.join(', ')}]. Your role: ${req.user.role}`,
      });
    }

    next();
  };
}

module.exports = { authorize };
