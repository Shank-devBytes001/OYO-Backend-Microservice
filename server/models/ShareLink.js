/*
 * ─────────────────────────────────────────────────────────────
 *  SHARE LINK MODEL  (URL Shortener)
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Maps a short 7-character code to an inventory item ID.
 *    When someone visits /s/Ab3xK9z, we look up this model
 *    to find which inventory item it points to, then redirect
 *    them to the full detail page.
 *
 *  HOW THE SHORT CODE IS GENERATED:
 *    We use a random 7-character alphanumeric string (base62).
 *    7 chars of base62 = 62^7 = 3.5 TRILLION possible codes.
 *    Collision is virtually impossible at our scale.
 *
 *  CONNECTED TO:
 *    - server/routes/share.js          → create & redirect endpoints
 *    - server/controllers/shareController.js → logic
 *    - server/models/Inventory.js      → inventoryId reference
 *    - public/js/app.js               → share button calls API
 * ─────────────────────────────────────────────────────────────
 */

const mongoose = require('mongoose');

const shareLinkSchema = new mongoose.Schema(
  {
    /*
     * The short code used in the URL: /s/Ab3xK9z
     * Unique index ensures no duplicates.
     */
    code: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    /* The inventory item this link points to */
    inventoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Inventory',
      required: true,
    },

    /* Track how many times this link was clicked */
    clicks: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('ShareLink', shareLinkSchema);
