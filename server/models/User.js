/*
 * ─────────────────────────────────────────────────────────────
 *  USER MODEL
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Stores credentials, roles, and refresh-token references
 *    for every registered account (both admins and customers).
 *
 *  FIELDS:
 *    email        – Unique login identifier
 *    password     – bcrypt-hashed (never stored in plaintext)
 *    name         – Display name
 *    role         – "user" | "admin"  (drives RBAC middleware)
 *    refreshToken – The currently valid refresh token hash;
 *                   stored so we can invalidate it on logout
 *
 *  CONNECTED TO:
 *    - server/controllers/authController.js → register/login
 *    - server/middleware/auth.js            → JWT verification
 *    - server/middleware/rbac.js            → role checks
 *    - server/models/Booking.js             → userId reference
 *    - server/models/Task.js                → userId reference
 *
 *  SECURITY NOTES:
 *    • Password is hashed in a pre-save hook so controllers
 *      never need to remember to hash manually.
 *    • The `toJSON` transform strips password & refreshToken
 *      from any API response automatically.
 * ─────────────────────────────────────────────────────────────
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, 'Invalid email format'],
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Excluded from queries by default
    },

    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },

    /*
     * RBAC: "user" can search & book; "admin" can manage inventory.
     * Checked by server/middleware/rbac.js → authorize('admin')
     */
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },

    /*
     * Stores the hash of the current refresh token.
     * On logout we set this to null, instantly invalidating
     * any outstanding refresh tokens for this account.
     */
    refreshToken: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt auto-managed

    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.__v;
        return ret;
      },
    },
  }
);

/*
 * PRE-SAVE HOOK – Hash password before persisting.
 * Only runs when `password` field is new or modified,
 * so updating name/email won't re-hash.
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

/*
 * INSTANCE METHOD – Compares a plaintext candidate with the
 * stored bcrypt hash. Used during login in authController.
 */
userSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
