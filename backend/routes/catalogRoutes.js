const express = require('express');
const {
  getOptions,
  getManage,
  createClaimCustomer,
  updateClaimCustomer,
  setClaimCustomerActive,
  createSku,
  updateSku,
  setSkuActive
} = require('../controllers/catalogController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/options', getOptions);
router.get('/manage', requireAdmin, getManage);

router.post('/customers', requireAdmin, createClaimCustomer);
router.put('/customers/:id', requireAdmin, updateClaimCustomer);
router.patch('/customers/:id/active', requireAdmin, setClaimCustomerActive);

router.post('/skus', requireAdmin, createSku);
router.put('/skus/:id', requireAdmin, updateSku);
router.patch('/skus/:id/active', requireAdmin, setSkuActive);

module.exports = router;