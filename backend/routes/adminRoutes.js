const express = require('express');
const { getSettings, updateSettings, getUsers, updateUserRole } = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);
router.get('/settings', getSettings);
router.patch('/settings', updateSettings);
router.get('/users', getUsers);
router.patch('/users/:id/role', updateUserRole);

module.exports = router;
