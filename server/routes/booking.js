/*
 * ─────────────────────────────────────────────────────────────
 *  BOOKING ROUTES
 * ─────────────────────────────────────────────────────────────
 *  All routes require authentication. Both users and admins
 *  can access these endpoints, but users only see their own
 *  bookings (enforced in the controller).
 *
 *  ENDPOINTS:
 *    POST   /api/bookings              → Create booking (PENDING_PAYMENT)
 *    GET    /api/bookings              → List my bookings
 *    GET    /api/bookings/all          → List all bookings (admin only)
 *    GET    /api/bookings/:id          → Get booking details
 *    PATCH  /api/bookings/:id/confirm  → PENDING_PAYMENT → CONFIRMED
 *    PATCH  /api/bookings/:id/cancel   → → CANCELLED
 *    PATCH  /api/bookings/:id/complete → CONFIRMED → COMPLETED
 *
 *  WHY PATCH for state transitions?
 *    We use PATCH (not PUT) because we're modifying a SINGLE
 *    field (status) with side effects, not replacing the
 *    entire resource.
 *
 *  CONNECTED TO:
 *    - server/controllers/bookingController.js → handlers
 *    - server/middleware/auth.js                → authenticate
 *    - server/index.js                          → mounted at /api/bookings
 * ─────────────────────────────────────────────────────────────
 */

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const {
  createBooking,
  getMyBookings,
  getAllBookings,
  getBooking,
  confirmBooking,
  cancelBooking,
  completeBooking,
} = require('../controllers/bookingController');

router.use(authenticate);

router.post('/', createBooking);
router.get('/', getMyBookings);
router.get('/all', authorize('admin'), getAllBookings);
router.get('/:id', getBooking);
router.patch('/:id/confirm', confirmBooking);
router.patch('/:id/cancel', cancelBooking);
router.patch('/:id/complete', completeBooking);

module.exports = router;
