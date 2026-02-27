/*
 * ─────────────────────────────────────────────────────────────
 *  INVENTORY CONTROLLER  (Admin CRUD)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Admin-only endpoints for managing bookable items
 *    (flights and hotels). Regular users never hit these
 *    routes – they use the search endpoint instead.
 *
 *  ENDPOINTS HANDLED:
 *    POST   /api/inventory              → create()     (admin only)
 *    GET    /api/inventory              → list()       (admin only)
 *    GET    /api/inventory/:id          → getById()    (admin only)
 *    PUT    /api/inventory/:id          → update()     (admin only)
 *    DELETE /api/inventory/:id          → remove()     (admin, soft-delete)
 *    PATCH  /api/inventory/:id/activate → activate()   (admin, re-enable)
 *    DELETE /api/inventory/:id/permanent→ hardDelete() (admin, permanent)
 *
 *  CONNECTED TO:
 *    - server/models/Inventory.js         → Mongoose model
 *    - server/services/cacheService.js    → invalidate on mutations
 *    - server/middleware/rbac.js           → authorize('admin')
 *    - server/middleware/errorHandler.js   → asyncHandler
 *    - server/routes/inventory.js         → route definitions
 * ─────────────────────────────────────────────────────────────
 */

const Inventory = require('../models/Inventory');
const cacheService = require('../services/cacheService');
const { asyncHandler } = require('../middleware/errorHandler');

/*
 * ─── CREATE ─────────────────────────────────────────────────
 *  Adds a new inventory item (flight or hotel).
 *
 *  Body: {
 *    type, title, category, price, totalUnits,
 *    ...flight or hotel specific fields
 *  }
 *
 *  availableUnits is initialised to totalUnits.
 * ────────────────────────────────────────────────────────────
 */
const create = asyncHandler(async (req, res) => {
  const data = req.body;

  /* Default available to total on creation */
  if (!data.availableUnits) {
    data.availableUnits = data.totalUnits;
  }

  const item = await Inventory.create(data);

  /* New inventory means search results are stale */
  await cacheService.invalidatePattern();

  res.status(201).json({
    success: true,
    message: `${data.type} inventory created.`,
    data: { item },
  });
});

/*
 * ─── LIST ───────────────────────────────────────────────────
 *  Admin listing with optional type filter and pagination.
 *  Unlike the public search, this shows ALL items including
 *  inactive and sold-out ones.
 * ────────────────────────────────────────────────────────────
 */
const list = asyncHandler(async (req, res) => {
  const { type, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (type) filter.type = type;

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Inventory.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Inventory.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: {
      items,
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    },
  });
});

/*
 * ─── GET BY ID ──────────────────────────────────────────────
 *  Returns a single inventory item's full details.
 * ────────────────────────────────────────────────────────────
 */
const getById = asyncHandler(async (req, res) => {
  const item = await Inventory.findById(req.params.id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not found.' });
  }

  res.json({ success: true, data: { item } });
});

/*
 * ─── UPDATE ─────────────────────────────────────────────────
 *  Updates inventory fields. Cannot update availableUnits
 *  directly through this endpoint (that's managed by the
 *  lock service during bookings).
 * ────────────────────────────────────────────────────────────
 */
const update = asyncHandler(async (req, res) => {
  /* Prevent manual manipulation of the booking-critical field */
  delete req.body.availableUnits;

  const item = await Inventory.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not found.' });
  }

  await cacheService.invalidatePattern();

  res.json({
    success: true,
    message: 'Inventory updated.',
    data: { item },
  });
});

/*
 * ─── REMOVE (soft-delete) ───────────────────────────────────
 *  Sets isActive = false instead of deleting the document.
 *  Existing bookings still reference this item, so hard
 *  deleting would break data integrity.
 * ────────────────────────────────────────────────────────────
 */
const remove = asyncHandler(async (req, res) => {
  const item = await Inventory.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );

  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not found.' });
  }

  await cacheService.invalidatePattern();

  res.json({
    success: true,
    message: 'Inventory deactivated.',
    data: { item },
  });
});

/*
 * ─── ACTIVATE ───────────────────────────────────────────────
 *  Re-enables a previously deactivated inventory item.
 *  Sets isActive = true so it appears in search results again.
 * ────────────────────────────────────────────────────────────
 */
const activate = asyncHandler(async (req, res) => {
  const item = await Inventory.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    { new: true }
  );

  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not found.' });
  }

  await cacheService.invalidatePattern();

  res.json({
    success: true,
    message: 'Inventory activated.',
    data: { item },
  });
});

/*
 * ─── HARD DELETE ────────────────────────────────────────────
 *  Permanently removes an inventory item from the database.
 *  WARNING: Only use this if no bookings reference this item.
 *  If bookings exist, those bookings will have a broken
 *  inventoryId reference. Prefer deactivate (soft-delete)
 *  for items with existing bookings.
 * ────────────────────────────────────────────────────────────
 */
const hardDelete = asyncHandler(async (req, res) => {
  const item = await Inventory.findById(req.params.id);

  if (!item) {
    return res.status(404).json({ success: false, message: 'Item not found.' });
  }

  await Inventory.findByIdAndDelete(req.params.id);
  await cacheService.invalidatePattern();

  res.json({
    success: true,
    message: 'Inventory permanently deleted.',
  });
});

module.exports = { create, list, getById, update, remove, activate, hardDelete };
