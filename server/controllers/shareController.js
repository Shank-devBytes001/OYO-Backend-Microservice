/*
 * ─────────────────────────────────────────────────────────────
 *  SHARE CONTROLLER  (URL Shortener)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Handles creation and resolution of short share links.
 *
 *  ENDPOINTS:
 *    POST /api/share         → createShareLink()  (generates short URL)
 *    GET  /s/:code           → redirectShareLink() (redirects to item page)
 *    GET  /api/share/:code   → getShareInfo()      (returns link metadata)
 *
 *  FLOW:
 *    1. User clicks "Share" on a flight/hotel card
 *    2. Frontend calls POST /api/share { inventoryId }
 *    3. Server generates a 7-char code (e.g. "Ab3xK9z")
 *    4. Returns short URL: http://localhost:3000/s/Ab3xK9z
 *    5. When someone opens that URL, GET /s/Ab3xK9z redirects
 *       them to the app with the item details shown
 *
 *  DEDUPLICATION:
 *    If a share link already exists for the same inventory item,
 *    we return the existing one instead of creating a duplicate.
 *
 *  CONNECTED TO:
 *    - server/models/ShareLink.js     → Mongoose model
 *    - server/models/Inventory.js     → validates item exists
 *    - server/routes/share.js         → route definitions
 *    - server/index.js                → /s/:code redirect route
 *    - public/js/app.js               → shareItem() function
 * ─────────────────────────────────────────────────────────────
 */

const ShareLink = require('../models/ShareLink');
const Inventory = require('../models/Inventory');
const { asyncHandler } = require('../middleware/errorHandler');
const crypto = require('crypto');

/*
 * ─── generateCode ───────────────────────────────────────────
 *  Creates a random 7-character alphanumeric string.
 *
 *  Uses crypto.randomBytes for cryptographic randomness,
 *  then encodes as base64url and trims to 7 chars.
 *  Base64url uses: A-Z, a-z, 0-9, -, _ (64 chars)
 *  We strip - and _ to keep it clean alphanumeric.
 * ────────────────────────────────────────────────────────────
 */
function generateCode() {
  return crypto
    .randomBytes(8)
    .toString('base64url')
    .replace(/[-_]/g, '')
    .slice(0, 7);
}

/*
 * ─── CREATE SHARE LINK ─────────────────────────────────────
 *  Generates a short URL for an inventory item.
 *
 *  Body: { inventoryId }
 *  Returns: { shortUrl, code, clicks }
 *
 *  If a link for this item already exists, returns it
 *  instead of creating a duplicate.
 * ────────────────────────────────────────────────────────────
 */
const createShareLink = asyncHandler(async (req, res) => {
  const { inventoryId } = req.body;

  if (!inventoryId) {
    return res.status(400).json({
      success: false,
      message: 'inventoryId is required.',
    });
  }

  /* Verify the inventory item exists */
  const item = await Inventory.findById(inventoryId);
  if (!item) {
    return res.status(404).json({
      success: false,
      message: 'Inventory item not found.',
    });
  }

  /* Check if a share link already exists for this item */
  let shareLink = await ShareLink.findOne({ inventoryId });

  if (!shareLink) {
    /*
     * Generate a unique code. In the extremely rare case of
     * collision, retry up to 5 times with a new random code.
     */
    let code;
    let attempts = 0;

    while (attempts < 5) {
      code = generateCode();
      const exists = await ShareLink.findOne({ code });
      if (!exists) break;
      attempts++;
    }

    shareLink = await ShareLink.create({ code, inventoryId });
  }

  /* Build the full short URL using the request's host */
  const protocol = req.protocol;
  const host = req.get('host');
  const shortUrl = `${protocol}://${host}/s/${shareLink.code}`;

  res.status(201).json({
    success: true,
    data: {
      shortUrl,
      code: shareLink.code,
      inventoryId: shareLink.inventoryId,
      clicks: shareLink.clicks,
    },
  });
});

/*
 * ─── REDIRECT SHARE LINK ───────────────────────────────────
 *  When someone visits /s/Ab3xK9z, this handler:
 *    1. Looks up the code in the database
 *    2. Increments the click counter
 *    3. Redirects to the frontend with the item ID in the hash
 *
 *  The frontend hash format is: /#item=<inventoryId>
 *  The SPA router in app.js detects this and shows the item.
 * ────────────────────────────────────────────────────────────
 */
const redirectShareLink = asyncHandler(async (req, res) => {
  const { code } = req.params;

  const shareLink = await ShareLink.findOne({ code });

  if (!shareLink) {
    return res.status(404).send(`
      <html>
        <head><title>Link Not Found</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:4rem">
          <h1>Link Not Found</h1>
          <p>This share link doesn't exist or has been removed.</p>
          <a href="/">Go to Homepage</a>
        </body>
      </html>
    `);
  }

  /* Increment click count (fire-and-forget, non-blocking) */
  ShareLink.updateOne({ _id: shareLink._id }, { $inc: { clicks: 1 } }).catch(() => {});

  /* Redirect to frontend with the item ID */
  res.redirect(`/#item=${shareLink.inventoryId}`);
});

/*
 * ─── GET SHARE INFO ─────────────────────────────────────────
 *  Returns metadata about a share link (for admin/analytics).
 * ────────────────────────────────────────────────────────────
 */
const getShareInfo = asyncHandler(async (req, res) => {
  const { code } = req.params;

  const shareLink = await ShareLink.findOne({ code }).populate(
    'inventoryId',
    'title type category'
  );

  if (!shareLink) {
    return res.status(404).json({
      success: false,
      message: 'Share link not found.',
    });
  }

  res.json({
    success: true,
    data: { shareLink },
  });
});

module.exports = { createShareLink, redirectShareLink, getShareInfo };
