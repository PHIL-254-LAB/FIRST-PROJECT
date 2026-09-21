const express = require('express');
const { getSettings, updateSettings, getUsers, updateUserRole, createUser, updateAccount, deleteUser, resetPassword, getLoginLog } = require('../controllers/adminController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);
router.get('/settings', getSettings);
router.patch('/settings', updateSettings);
router.get('/users', getUsers);
router.post('/users', createUser);
router.put('/users/:id', updateAccount);
router.delete('/users/:id', deleteUser);
router.patch('/users/:id/role', updateUserRole);
router.patch('/users/:id/password', resetPassword);
router.get('/login-log', getLoginLog);

module.exports = router;
