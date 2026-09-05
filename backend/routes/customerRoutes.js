const express = require('express');
const {
  createCustomer,
  getCustomers,
  getCustomer,
  deleteCustomer,
  updateCustomerStatus
} = require('../controllers/customerController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.post('/', createCustomer);
router.get('/', getCustomers);
router.get('/:id', getCustomer);
router.delete('/:id', deleteCustomer);
router.patch('/:id/status', requireAdmin, updateCustomerStatus);

module.exports = router;
