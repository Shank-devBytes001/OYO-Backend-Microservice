/*
 * ─────────────────────────────────────────────────────────────
 *  BOOKING CONTROLLER
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Exposes the booking lifecycle to the API layer:
 *    create a booking, confirm payment, cancel, complete,
 *    and list user bookings.
 *
 *  ENDPOINTS HANDLED:
 *    POST   /api/bookings              → createBooking()
 *    GET    /api/bookings              → getMyBookings()
 *    GET    /api/bookings/all          → getAllBookings()  (admin only)
 *    GET    /api/bookings/:id          → getBooking()
 *    PATCH  /api/bookings/:id/confirm  → confirmBooking()
 *    PATCH  /api/bookings/:id/cancel   → cancelBooking()
 *    PATCH  /api/bookings/:id/complete → completeBooking()
 *
 *  DATA FLOW (booking creation):
 *
 *    Client POST /api/bookings { inventoryId, quantity }
 *         │
 *         ▼
 *    bookingController.createBooking()
 *         │
 *         ▼
 *    bookingService.createBooking()
 *         │
 *         ├─► lockService.acquireAndDecrement()   ← Redis lock + Mongo atomic
 *         ├─► Booking.create()                     ← PENDING_PAYMENT
 *         ├─► redis.set(hold key, 15min TTL)       ← Auto-cancel timer
 *         └─► cacheService.invalidatePattern()     ← Stale search results
 *
 *  CONNECTED TO:
 *    - server/services/bookingService.js   → business logic
 *    - server/models/Booking.js            → Mongoose model
 *    - server/middleware/auth.js           → req.user
 *    - server/middleware/errorHandler.js   → asyncHandler
 *    - server/routes/booking.js           → route definitions
 * ─────────────────────────────────────────────────────────────
 */

const bookingService = require('../services/bookingService');
const Booking = require('../models/Booking');
const { asyncHandler } = require('../middleware/errorHandler');

/*
 * ─── CREATE BOOKING ─────────────────────────────────────────
 *  Initiates a new booking. Status starts as PENDING_PAYMENT.
 *  The user has 15 minutes to confirm payment before the
 *  booking auto-cancels and units return to inventory.
 *
 *  Body: { inventoryId, quantity? }
 * ────────────────────────────────────────────────────────────
 */
const createBooking = asyncHandler(async (req, res) => {
  const { inventoryId, quantity = 1 } = req.body;

  if (!inventoryId) {
    return res.status(400).json({
      success: false,
      message: 'inventoryId is required.',
    });
  }

  const booking = await bookingService.createBooking(
    req.user.userId,
    inventoryId,
    quantity
  );

  res.status(201).json({
    success: true,
    message: 'Booking created. Complete payment within 15 minutes.',
    data: { booking },
  });
});

/*
 * ─── GET MY BOOKINGS ────────────────────────────────────────
 *  Returns all bookings for the authenticated user.
 *  Populates inventory details for the frontend cards.
 * ────────────────────────────────────────────────────────────
 */
const getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await bookingService.getUserBookings(req.user.userId);

  res.json({
    success: true,
    data: { bookings, count: bookings.length },
  });
});

/*
 * ─── GET ALL BOOKINGS (Admin only) ─────────────────────────
 *  Returns all bookings across every user with pagination.
 *  Populates inventory + user details so admin can see
 *  who booked what.
 * ────────────────────────────────────────────────────────────
 */
const getAllBookings = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const validStatuses = Object.values(Booking.STATES);
  const filter = {};
  if (req.query.status && validStatuses.includes(String(req.query.status))) {
    filter.status = String(req.query.status);
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('inventoryId', 'title type category origin destination location price')
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      bookings,
      page,
      pages: Math.ceil(total / limit),
      total,
    },
  });
});

/*
 * ─── GET SINGLE BOOKING ────────────────────────────────────
 *  Returns one booking if it belongs to the requesting user
 *  (or the user is an admin).
 * ────────────────────────────────────────────────────────────
 */
const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id).populate(
    'inventoryId',
    'title type category origin destination location'
  );

  if (!booking) {
    return res.status(404).json({ success: false, message: 'Booking not found.' });
  }

  /* Users can only view their own bookings; admins can view any */
  if (
    booking.userId.toString() !== req.user.userId &&
    req.user.role !== 'admin'
  ) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  res.json({ success: true, data: { booking } });
});

/*
 * ─── CONFIRM BOOKING ────────────────────────────────────────
 *  Transitions: PENDING_PAYMENT → CONFIRMED
 *  Called after the user completes payment.
 *
 *  In a real system, this would be triggered by a payment
 *  gateway webhook (Stripe, PayPal, etc.).
 * ────────────────────────────────────────────────────────────
 */
const confirmBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.transition(
    req.params.id,
    Booking.STATES.CONFIRMED
  );

  res.json({
    success: true,
    message: 'Booking confirmed.',
    data: { booking },
  });
});

/*
 * ─── CANCEL BOOKING ─────────────────────────────────────────
 *  Transitions: PENDING_PAYMENT → CANCELLED
 *              or CONFIRMED → CANCELLED
 *
 *  Restores inventory units and removes the hold timer.
 * ────────────────────────────────────────────────────────────
 */
const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.transition(
    req.params.id,
    Booking.STATES.CANCELLED,
    { reason: req.body.reason || 'User-initiated cancellation' }
  );

  res.json({
    success: true,
    message: 'Booking cancelled. Inventory restored.',
    data: { booking },
  });
});

/*
 * ─── COMPLETE BOOKING ───────────────────────────────────────
 *  Transitions: CONFIRMED → COMPLETED
 *  Called after the travel date passes (could also be
 *  automated by a cron job).
 * ────────────────────────────────────────────────────────────
 */
const completeBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.transition(
    req.params.id,
    Booking.STATES.COMPLETED
  );

  res.json({
    success: true,
    message: 'Booking completed.',
    data: { booking },
  });
});

module.exports = {
  createBooking,
  getMyBookings,
  getAllBookings,
  getBooking,
  confirmBooking,
  cancelBooking,
  completeBooking,
};
