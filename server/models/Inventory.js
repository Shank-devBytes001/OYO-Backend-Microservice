/*
 * ─────────────────────────────────────────────────────────────
 *  INVENTORY MODEL  (Flights & Hotels)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Represents a bookable item – either a flight seat bucket
 *    or a hotel room type. Each document tracks the TOTAL units
 *    and the CURRENTLY AVAILABLE units.
 *
 *  KEY DESIGN DECISIONS:
 *
 *    1. SINGLE COLLECTION for flights AND hotels
 *       A discriminator field `type` ("flight" | "hotel")
 *       keeps the schema unified. This simplifies the search
 *       aggregation pipeline – one query can span both types.
 *
 *    2. `totalUnits` vs `availableUnits`
 *       totalUnits   = the original capacity (never changes)
 *       availableUnits = decremented atomically on booking
 *       This split lets the admin dashboard show occupancy %.
 *
 *    3. VERSION KEY (`__v`) for OPTIMISTIC CONCURRENCY
 *       Mongoose's built-in versionKey is used by the lock
 *       service to detect stale writes during seat/room grab.
 *       See server/services/lockService.js for the full flow.
 *
 *  CONNECTED TO:
 *    - server/controllers/inventoryController.js → CRUD (admin)
 *    - server/controllers/searchController.js    → search query
 *    - server/services/lockService.js            → atomic decrement
 *    - server/services/cacheService.js           → cache invalidation
 *    - server/services/searchService.js          → aggregation pipeline
 *    - server/models/Booking.js                  → inventoryId ref
 *
 *  INDEXES:
 *    - { type, category, availableUnits, price } compound index
 *      powers the search aggregation with minimal collection scan.
 *    - { location } for geo-based hotel searches.
 * ─────────────────────────────────────────────────────────────
 */

const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    /*
     * Discriminator: "flight" or "hotel"
     * Determines which subset of fields are relevant.
     */
    type: {
      type: String,
      required: true,
      enum: ['flight', 'hotel'],
      index: true,
    },

    /* Human-readable title – e.g. "NYC → LAX Business" or "Grand Hyatt Deluxe" */
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },

    description: { type: String, default: '' },

    /*
     * Category drives the search filter chips on the frontend.
     * Flights: economy, business, first
     * Hotels:  budget, standard, luxury
     */
    category: {
      type: String,
      required: true,
      enum: ['economy', 'business', 'first', 'budget', 'standard', 'luxury'],
      index: true,
    },

    /* Price per unit (per seat / per night) in USD cents to avoid float math */
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    /* ── Flight-specific fields ──────────────────────────── */
    origin: { type: String, trim: true },       // IATA code (e.g. "JFK")
    destination: { type: String, trim: true },   // IATA code (e.g. "LAX")
    airline: { type: String, trim: true },
    flightNumber: { type: String, trim: true },
    departureDate: { type: Date },
    arrivalDate: { type: Date },

    /* ── Hotel-specific fields ───────────────────────────── */
    location: { type: String, trim: true },      // City or address
    checkInDate: { type: Date },
    checkOutDate: { type: Date },
    amenities: [{ type: String }],               // ["wifi", "pool", "spa"]

    /* ── Capacity tracking ───────────────────────────────── */
    totalUnits: {
      type: Number,
      required: true,
      min: 1,
    },

    /*
     * CRITICAL FIELD for the double-booking guard.
     * Decremented atomically inside lockService.acquireAndDecrement().
     * Must NEVER go below 0.
     */
    availableUnits: {
      type: Number,
      required: true,
      min: 0,
    },

    /* Soft-delete / disable flag */
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,

    /*
     * OPTIMISTIC CONCURRENCY:
     * Mongoose increments __v on every save(). Our lock service
     * uses findOneAndUpdate with a version-match condition:
     *   { _id, __v: knownVersion, availableUnits: { $gte: 1 } }
     * If another request already bumped __v, the update returns
     * null → the caller knows the seat was grabbed by someone else.
     */
    optimisticConcurrency: true,
  }
);

/*
 * COMPOUND INDEX – powers the main search aggregation.
 * Fields ordered by selectivity: type → category → availability → price.
 */
inventorySchema.index(
  { type: 1, category: 1, availableUnits: 1, price: 1 },
  { name: 'search_compound' }
);

inventorySchema.index({ location: 1 }, { name: 'hotel_location' });
inventorySchema.index({ origin: 1, destination: 1 }, { name: 'flight_route' });

module.exports = mongoose.model('Inventory', inventorySchema);
