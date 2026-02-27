/*
 * ─────────────────────────────────────────────────────────────
 *  GLOBAL ERROR HANDLER MIDDLEWARE
 * ─────────────────────────────────────────────────────────────
 *  PURPOSE:
 *    Catches all unhandled errors from controllers/services
 *    and returns a consistent JSON error response.
 *
 *  WHY A GLOBAL HANDLER?
 *    Without this, Express returns HTML error pages by default.
 *    A JSON API must always return JSON – even on 500 errors.
 *    This also prevents stack traces from leaking to clients
 *    in production.
 *
 *  CONNECTED TO:
 *    - server/index.js → registered as the LAST middleware
 *    - Every controller → errors thrown with `next(err)` or
 *      from async wrappers land here
 *
 *  ERROR SHAPE CONVENTION:
 *    Services/controllers attach `statusCode` to Error objects:
 *      const err = new Error('Not found');
 *      err.statusCode = 404;
 *      throw err;
 *    This middleware reads that property.
 * ─────────────────────────────────────────────────────────────
 */

function errorHandler(err, req, res, _next) {
  /* Default to 500 if no statusCode was attached */
  const statusCode = err.statusCode || 500;

  /* Log full error in development for debugging */
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[Error] ${statusCode} – ${err.message}`);
    if (statusCode === 500) console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    /* Only include stack trace in development */
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
}

/*
 * ─── asyncHandler ───────────────────────────────────────────
 *  Wraps async route handlers so we don't need try/catch in
 *  every controller. Any rejected promise is forwarded to
 *  the error handler via next(err).
 *
 *  USAGE:
 *    router.get('/items', asyncHandler(async (req, res) => {
 *      const items = await Item.find();
 *      res.json(items);
 *    }));
 * ────────────────────────────────────────────────────────────
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, asyncHandler };
