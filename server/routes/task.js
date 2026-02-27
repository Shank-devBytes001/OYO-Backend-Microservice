/*
 * ─────────────────────────────────────────────────────────────
 *  TASK / ITINERARY ROUTES
 * ─────────────────────────────────────────────────────────────
 *  All routes require authentication. Users manage their own
 *  tasks; admins can manage any task.
 *
 *  ENDPOINTS:
 *    POST   /api/tasks              → Create task for a booking
 *    GET    /api/tasks              → List user's tasks
 *    GET    /api/tasks/:id          → Get single task
 *    PUT    /api/tasks/:id          → Update task
 *    DELETE /api/tasks/:id          → Delete task
 *
 *  CONNECTED TO:
 *    - server/controllers/taskController.js → handlers
 *    - server/middleware/auth.js             → authenticate
 *    - server/index.js                       → mounted at /api/tasks
 * ─────────────────────────────────────────────────────────────
 */

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const {
  create,
  list,
  getById,
  update,
  remove,
} = require('../controllers/taskController');

router.use(authenticate);

router.post('/', create);
router.get('/', list);
router.get('/:id', getById);
router.put('/:id', update);
router.delete('/:id', remove);

module.exports = router;
