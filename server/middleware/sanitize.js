/*
 * ─────────────────────────────────────────────────────────────
 *  INPUT SANITIZATION MIDDLEWARE
 * ─────────────────────────────────────────────────────────────
 *  Strips MongoDB query operators (keys starting with "$")
 *  from req.body, req.query, and req.params to prevent
 *  NoSQL injection attacks.
 *
 *  CONNECTED TO:
 *    - server/index.js → registered before all routes
 * ─────────────────────────────────────────────────────────────
 */

function stripDollarKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(stripDollarKeys);
  }

  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) continue;
    clean[key] = stripDollarKeys(obj[key]);
  }
  return clean;
}

function sanitize(req, _res, next) {
  if (req.body) req.body = stripDollarKeys(req.body);
  if (req.query) req.query = stripDollarKeys(req.query);
  if (req.params) req.params = stripDollarKeys(req.params);
  next();
}

module.exports = { sanitize };
