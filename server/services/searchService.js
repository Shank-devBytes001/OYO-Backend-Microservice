/*
 * ─────────────────────────────────────────────────────────────
 *  SEARCH SERVICE  (MongoDB Aggregation Pipeline)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Builds and executes a MongoDB aggregation pipeline that
 *    supports multi-dimensional filtering for inventory search.
 *
 *  SUPPORTED FILTERS:
 *    - type          → "flight" or "hotel"
 *    - category      → "economy", "business", "luxury", etc.
 *    - minPrice      → lower bound (inclusive)
 *    - maxPrice      → upper bound (inclusive)
 *    - origin        → flight origin IATA code
 *    - destination   → flight destination IATA code
 *    - location      → hotel city/area (partial match)
 *    - dateFrom      → availability start date
 *    - dateTo        → availability end date
 *    - page / limit  → pagination
 *    - sortBy        → "price" | "date" (default: price asc)
 *
 *  PIPELINE STAGES:
 *    1. $match    → filter by type, category, availability > 0
 *    2. $match    → price range filter
 *    3. $match    → route / location filters
 *    4. $match    → date range filter
 *    5. $sort     → order results
 *    6. $facet    → split into { data (paginated), totalCount }
 *
 *  WHY AGGREGATION INSTEAD OF find()?
 *    Aggregation lets us compute totalCount in the same DB
 *    roundtrip as the paginated results (via $facet), and
 *    makes it easy to add future stages like $lookup for
 *    reviews or $geoNear for proximity search.
 *
 *  CONNECTED TO:
 *    - server/services/cacheService.js       → wrapped by getOrSet
 *    - server/controllers/searchController.js → API endpoint
 *    - server/models/Inventory.js             → collection queried
 * ─────────────────────────────────────────────────────────────
 */

const Inventory = require('../models/Inventory');

/*
 * ─── buildPipeline ──────────────────────────────────────────
 *  Constructs the aggregation pipeline array from query params.
 *  Each filter is only added if the param is present, keeping
 *  the pipeline minimal for simple queries.
 * ────────────────────────────────────────────────────────────
 */
function buildPipeline(params) {
  const {
    type,
    category,
    minPrice,
    maxPrice,
    origin,
    destination,
    location,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20,
    sortBy = 'price',
  } = params;

  const pipeline = [];

  /* ── Stage 1: Base filter (type + active + in stock) ────── */
  const baseMatch = { isActive: true, availableUnits: { $gte: 1 } };
  if (type) baseMatch.type = type;
  if (category) baseMatch.category = category;
  pipeline.push({ $match: baseMatch });

  /* ── Stage 2: Price range ──────────────────────────────── */
  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter = {};
    if (minPrice !== undefined) priceFilter.$gte = Number(minPrice);
    if (maxPrice !== undefined) priceFilter.$lte = Number(maxPrice);
    pipeline.push({ $match: { price: priceFilter } });
  }

  /* ── Stage 3: Route (flights) or location (hotels) ─────── */
  if (origin) pipeline.push({ $match: { origin: origin.toUpperCase() } });
  if (destination) pipeline.push({ $match: { destination: destination.toUpperCase() } });
  if (location) {
    pipeline.push({
      $match: { location: { $regex: location, $options: 'i' } },
    });
  }

  /* ── Stage 4: Date availability ────────────────────────── */
  if (dateFrom || dateTo) {
    const dateMatch = {};

    if (type === 'flight') {
      if (dateFrom) dateMatch.departureDate = { $gte: new Date(dateFrom) };
      if (dateTo) {
        dateMatch.arrivalDate = dateMatch.arrivalDate || {};
        dateMatch.arrivalDate.$lte = new Date(dateTo);
      }
    } else {
      if (dateFrom) dateMatch.checkInDate = { $gte: new Date(dateFrom) };
      if (dateTo) {
        dateMatch.checkOutDate = dateMatch.checkOutDate || {};
        dateMatch.checkOutDate.$lte = new Date(dateTo);
      }
    }

    if (Object.keys(dateMatch).length) {
      pipeline.push({ $match: dateMatch });
    }
  }

  /* ── Stage 5: Sort ─────────────────────────────────────── */
  const sortStage = {};
  if (sortBy === 'date') {
    sortStage.departureDate = 1;
    sortStage.checkInDate = 1;
  } else {
    sortStage.price = 1; // Default: cheapest first
  }
  pipeline.push({ $sort: sortStage });

  /* ── Stage 6: Facet – paginated results + total count ──── */
  const skip = (Number(page) - 1) * Number(limit);
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, { $limit: Number(limit) }],
      totalCount: [{ $count: 'count' }],
    },
  });

  return pipeline;
}

/*
 * ─── search ─────────────────────────────────────────────────
 *  Executes the pipeline and normalises the $facet output
 *  into a clean response shape.
 *
 *  @param {Object} params – Query parameters from the request
 *  @returns {Object}      – { results, total, page, limit }
 * ────────────────────────────────────────────────────────────
 */
async function search(params) {
  const pipeline = buildPipeline(params);
  const [result] = await Inventory.aggregate(pipeline);

  const data = result.data || [];
  const total = result.totalCount[0]?.count || 0;

  return {
    results: data,
    total,
    page: Number(params.page) || 1,
    limit: Number(params.limit) || 20,
    pages: Math.ceil(total / (Number(params.limit) || 20)),
  };
}

module.exports = { search, buildPipeline };
