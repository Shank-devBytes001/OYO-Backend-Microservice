/*
 * ─────────────────────────────────────────────────────────────
 *  SEARCH CONTROLLER
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Public-facing search endpoint that combines:
 *      1. Cache-Aside (Redis) for performance
 *      2. MongoDB Aggregation Pipeline for filtering
 *
 *  ENDPOINT:
 *    GET /api/search?type=flight&category=business&minPrice=100&...
 *
 *  QUERY PARAMS (all optional):
 *    type        – "flight" | "hotel"
 *    category    – "economy" | "business" | "first" | "budget" | "standard" | "luxury"
 *    minPrice    – Lower bound in cents
 *    maxPrice    – Upper bound in cents
 *    origin      – Flight origin IATA (e.g. "JFK")
 *    destination – Flight destination IATA (e.g. "LAX")
 *    location    – Hotel city (partial match, case-insensitive)
 *    dateFrom    – ISO date string (availability start)
 *    dateTo      – ISO date string (availability end)
 *    page        – Page number (default 1)
 *    limit       – Results per page (default 20)
 *    sortBy      – "price" | "date"
 *
 *  RESPONSE SHAPE:
 *    {
 *      success: true,
 *      fromCache: boolean,  ← debugging flag
 *      data: {
 *        results: [...],
 *        total: number,
 *        page: number,
 *        limit: number,
 *        pages: number
 *      }
 *    }
 *
 *  DATA FLOW:
 *
 *    Client GET /api/search?type=hotel&location=Paris
 *         │
 *         ▼
 *    searchController.search()
 *         │
 *         ▼
 *    cacheService.getOrSet(params, fetchFn)
 *         │
 *         ├─ Cache HIT → return cached JSON
 *         │
 *         └─ Cache MISS
 *              │
 *              ▼
 *         searchService.search(params)
 *              │
 *              ▼
 *         MongoDB aggregation pipeline
 *              │
 *              ▼
 *         Store result in Redis (TTL 60s)
 *              │
 *              ▼
 *         Return fresh results
 *
 *  CONNECTED TO:
 *    - server/services/cacheService.js  → getOrSet()
 *    - server/services/searchService.js → search()
 *    - server/middleware/errorHandler.js → asyncHandler
 *    - server/routes/search.js          → route definition
 * ─────────────────────────────────────────────────────────────
 */

const cacheService = require('../services/cacheService');
const searchService = require('../services/searchService');
const { asyncHandler } = require('../middleware/errorHandler');

const search = asyncHandler(async (req, res) => {
  /*
   * req.query contains all the search parameters.
   * We pass the entire object to both cache key generation
   * and the search service pipeline builder.
   */
  const params = req.query;

  const { data, fromCache } = await cacheService.getOrSet(
    params,
    () => searchService.search(params)
  );

  res.json({
    success: true,
    fromCache,
    data,
  });
});

module.exports = { search };
