const express = require('express');
const {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  addCustomerNote,
  deleteCustomer,
  updateCustomerStatus,
  getRequestWindow
} = require('../controllers/customerController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/request-window', getRequestWindow);
router.post('/', createCustomer);
router.get('/', getCustomers);
router.get('/:id', getCustomer);
router.put('/:id', updateCustomer);
router.post('/:id/notes', addCustomerNote);
router.delete('/:id', deleteCustomer);
router.patch('/:id/status', requireAdmin, updateCustomerStatus);

module.exports = router;
