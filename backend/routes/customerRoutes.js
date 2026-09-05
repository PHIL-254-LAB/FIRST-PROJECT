const express = require('express');
const {
  createCustomer,
  getCustomers,
  getCustomer,
  deleteCustomer
} = require('../controllers/customerController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.post('/', createCustomer);
router.get('/', getCustomers);
router.get('/:id', getCustomer);
router.delete('/:id', deleteCustomer);

module.exports = router;
