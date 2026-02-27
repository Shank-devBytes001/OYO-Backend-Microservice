/*
 * ─────────────────────────────────────────────────────────────
 *  INVENTORY ROUTES  (Admin Only)
 * ─────────────────────────────────────────────────────────────
 *  All routes require authentication + admin role.
 *  Regular users search inventory via /api/search instead.
 *
 *  ENDPOINTS:
 *    POST   /api/inventory              → Create new item
 *    GET    /api/inventory              → List all items (admin view)
 *    GET    /api/inventory/:id          → Get single item details
 *    PUT    /api/inventory/:id          → Update item
 *    DELETE /api/inventory/:id          → Soft-delete (deactivate)
 *    PATCH  /api/inventory/:id/activate → Re-activate deactivated item
 *    DELETE /api/inventory/:id/permanent→ Hard delete from database
 *
 *  MIDDLEWARE CHAIN:
 *    authenticate → authorize('admin') → controller handler
 *
 *  CONNECTED TO:
 *    - server/controllers/inventoryController.js → handlers
 *    - server/middleware/auth.js                  → authenticate
 *    - server/middleware/rbac.js                  → authorize
 *    - server/index.js                            → mounted at /api/inventory
 * ─────────────────────────────────────────────────────────────
 */

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const {
  create,
  list,
  getById,
  update,
  remove,
  activate,
  hardDelete,
} = require('../controllers/inventoryController');

/* Every inventory route needs admin privileges */
router.use(authenticate, authorize('admin'));

router.post('/', create);
router.get('/', list);
router.get('/:id', getById);
router.put('/:id', update);
router.delete('/:id', remove);             // Soft-delete (deactivate)
router.patch('/:id/activate', activate);    // Re-activate
router.delete('/:id/permanent', hardDelete); // Hard delete from DB

module.exports = router;
