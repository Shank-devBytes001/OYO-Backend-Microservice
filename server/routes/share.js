/*
 * ─────────────────────────────────────────────────────────────
 *  SHARE LINK ROUTES
 * ─────────────────────────────────────────────────────────────
 *  All share routes are PUBLIC – no authentication needed.
 *  Anyone can generate and use share links.
 *
 *  ENDPOINTS:
 *    POST /api/share         → Generate short URL for an item
 *    GET  /api/share/:code   → Get link metadata (clicks, etc.)
 *
 *  NOTE: The redirect route (GET /s/:code) is registered
 *  directly in server/index.js because it lives outside /api.
 *
 *  CONNECTED TO:
 *    - server/controllers/shareController.js → handlers
 *    - server/index.js → mounted at /api/share + /s/:code redirect
 * ─────────────────────────────────────────────────────────────
 */

const router = require('express').Router();
const { createShareLink, getShareInfo } = require('../controllers/shareController');

router.post('/', createShareLink);
router.get('/:code', getShareInfo);

module.exports = router;
