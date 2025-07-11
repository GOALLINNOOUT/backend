const express = require('express');
const router = express.Router();
const { exportCSV, exportPDF } = require('../controllers/exportController');
const requireAdmin = require('../middleware/requireAdmin');
const auth = require('../middleware/auth');

router.get('/csv', auth, requireAdmin, exportCSV);
router.get('/pdf', auth, requireAdmin, exportPDF);

module.exports = router;
