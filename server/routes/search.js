/*
 * ─────────────────────────────────────────────────────────────
 *  SEARCH ROUTES  (Public)
 * ─────────────────────────────────────────────────────────────
 *  The search endpoint is PUBLIC – no authentication required.
 *  This allows unauthenticated users to browse inventory
 *  before creating an account.
 *
 *  ENDPOINT:
 *    GET /api/search?type=flight&category=business&...
 *
 *  RATE LIMITING:
 *    Applied via express-rate-limit in server/index.js to
 *    prevent abuse of this public endpoint.
 *
 *  CONNECTED TO:
 *    - server/controllers/searchController.js → handler
 *    - server/index.js                         → mounted at /api/search
 * ─────────────────────────────────────────────────────────────
 */

const router = require('express').Router();
const { search } = require('../controllers/searchController');

router.get('/', search);

module.exports = router;
