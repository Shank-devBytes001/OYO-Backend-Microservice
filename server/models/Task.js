/*
 * ─────────────────────────────────────────────────────────────
 *  TASK / ITINERARY MODEL
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Tracks travel-related to-do items linked to a booking.
 *    Examples:
 *      - "Check-in online for Flight AX123"
 *      - "Print hotel voucher for Grand Hyatt"
 *      - "Arrange airport transfer"
 *
 *  DESIGN RATIONALE:
 *    Tasks are a lightweight CRUD layer on top of bookings.
 *    Each task MUST reference a valid bookingId so the
 *    frontend can group tasks under itineraries.
 *
 *  CONNECTED TO:
 *    - server/controllers/taskController.js → CRUD endpoints
 *    - server/routes/task.js                → route definitions
 *    - server/models/Booking.js             → bookingId ref
 *    - server/models/User.js                → userId ref (owner)
 *    - server/middleware/auth.js             → only owner can manage
 * ─────────────────────────────────────────────────────────────
 */

const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    /* Owner of the task – must match the booking's userId */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    /*
     * The booking this task belongs to.
     * Enforced at the controller level: we verify the booking
     * exists AND belongs to the requesting user before creation.
     */
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Task must be linked to a booking'],
      index: true,
    },

    /* Short title – e.g. "Online check-in" */
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: 200,
    },

    /* Optional longer description */
    description: {
      type: String,
      default: '',
      maxlength: 1000,
    },

    /* When this task should be done by */
    dueDate: {
      type: Date,
      default: null,
    },

    /* Simple status tracker */
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'done'],
      default: 'pending',
    },

    /* Priority for sorting in the itinerary view */
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
  },
  {
    timestamps: true,
  }
);

/* Compound index for fetching all tasks for a user's booking */
taskSchema.index({ userId: 1, bookingId: 1 }, { name: 'user_booking_tasks' });

module.exports = mongoose.model('Task', taskSchema);
