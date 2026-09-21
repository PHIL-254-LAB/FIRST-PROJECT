const express = require('express');
const { createClaim, approveClaim, exportDraftClaim, getClaims, getClaim, exportClaim, downloadClaimTemplate } = require('../controllers/claimController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.post('/', createClaim);
router.post('/export-draft', exportDraftClaim);
router.get('/template', downloadClaimTemplate);
router.get('/', getClaims);
router.get('/:id/export', exportClaim);
router.get('/:id', getClaim);
router.patch('/:id/approval', requireAdmin, approveClaim);

module.exports = router;