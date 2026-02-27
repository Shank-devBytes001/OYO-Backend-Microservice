/*
 * ─────────────────────────────────────────────────────────────
 *  TASK / ITINERARY CONTROLLER
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    CRUD operations for travel tasks that are linked to
 *    specific bookings. Each task belongs to a user and
 *    references a bookingId.
 *
 *  ENDPOINTS HANDLED:
 *    POST   /api/tasks              → create()
 *    GET    /api/tasks              → list()     (user's tasks)
 *    GET    /api/tasks/:id          → getById()
 *    PUT    /api/tasks/:id          → update()
 *    DELETE /api/tasks/:id          → remove()
 *
 *  OWNERSHIP ENFORCEMENT:
 *    Every operation verifies that the task (and its parent
 *    booking) belongs to req.user.userId. Admins bypass this.
 *
 *  CONNECTED TO:
 *    - server/models/Task.js              → Mongoose model
 *    - server/models/Booking.js           → validates bookingId
 *    - server/middleware/auth.js           → req.user
 *    - server/middleware/errorHandler.js   → asyncHandler
 *    - server/routes/task.js              → route definitions
 * ─────────────────────────────────────────────────────────────
 */

const Task = require('../models/Task');
const Booking = require('../models/Booking');
const { asyncHandler } = require('../middleware/errorHandler');

/*
 * ─── CREATE TASK ────────────────────────────────────────────
 *  Creates a new task linked to an existing booking.
 *
 *  Body: { bookingId, title, description?, dueDate?, priority? }
 *
 *  Validation:
 *    - Booking must exist
 *    - Booking must belong to the requesting user
 * ────────────────────────────────────────────────────────────
 */
const create = asyncHandler(async (req, res) => {
  const bookingId = String(req.body.bookingId || '').trim();
  const title = String(req.body.title || '').trim();
  const { description, dueDate, priority } = req.body;

  if (!bookingId || !title) {
    return res.status(400).json({
      success: false,
      message: 'bookingId and title are required.',
    });
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return res.status(404).json({
      success: false,
      message: 'Booking not found.',
    });
  }

  if (
    booking.userId.toString() !== req.user.userId &&
    req.user.role !== 'admin'
  ) {
    return res.status(403).json({
      success: false,
      message: 'You can only add tasks to your own bookings.',
    });
  }

  const task = await Task.create({
    userId: req.user.userId,
    bookingId,
    title,
    description,
    dueDate,
    priority,
  });

  res.status(201).json({
    success: true,
    message: 'Task created.',
    data: { task },
  });
});

/*
 * ─── LIST TASKS ─────────────────────────────────────────────
 *  Returns all tasks for the authenticated user.
 *  Optional filter: ?bookingId=xxx to narrow to one booking.
 * ────────────────────────────────────────────────────────────
 */
const list = asyncHandler(async (req, res) => {
  const filter = { userId: req.user.userId };
  if (req.query.bookingId) filter.bookingId = String(req.query.bookingId);

  const tasks = await Task.find(filter)
    .populate('bookingId', 'status inventoryId')
    .sort({ dueDate: 1, priority: -1 });

  res.json({
    success: true,
    data: { tasks, count: tasks.length },
  });
});

/*
 * ─── GET BY ID ──────────────────────────────────────────────
 *  Returns a single task (ownership verified).
 * ────────────────────────────────────────────────────────────
 */
const getById = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id).populate(
    'bookingId',
    'status inventoryId'
  );

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found.' });
  }

  if (
    task.userId.toString() !== req.user.userId &&
    req.user.role !== 'admin'
  ) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  res.json({ success: true, data: { task } });
});

/*
 * ─── UPDATE TASK ────────────────────────────────────────────
 *  Updates task fields (title, description, dueDate, status,
 *  priority). Ownership verified.
 * ────────────────────────────────────────────────────────────
 */
const update = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found.' });
  }

  if (
    task.userId.toString() !== req.user.userId &&
    req.user.role !== 'admin'
  ) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  const allowedFields = ['title', 'description', 'dueDate', 'status', 'priority'];
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      task[field] = req.body[field];
    }
  });

  await task.save();

  res.json({
    success: true,
    message: 'Task updated.',
    data: { task },
  });
});

/*
 * ─── REMOVE TASK ────────────────────────────────────────────
 *  Hard-deletes a task. Tasks don't need soft-delete since
 *  they're auxiliary data – the booking remains intact.
 * ────────────────────────────────────────────────────────────
 */
const remove = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ success: false, message: 'Task not found.' });
  }

  if (
    task.userId.toString() !== req.user.userId &&
    req.user.role !== 'admin'
  ) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  await Task.findByIdAndDelete(req.params.id);

  res.json({ success: true, message: 'Task deleted.' });
});

module.exports = { create, list, getById, update, remove };
