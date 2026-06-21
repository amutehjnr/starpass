'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/onboardingController');
const { redirectIfAuth } = require('../middleware/auth');
const { uploadVerificationDoc } = require('../config/cloudinary');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { audit } = require('../middleware/auditLog');
const { csrfProtection } = require('../middleware/csrf');

// Method 1: Self-service application
router.get('/apply', redirectIfAuth, ctrl.getApply);
router.post(
  '/apply',
  redirectIfAuth,
  uploadLimiter,
  uploadVerificationDoc.array('documents', 3),
  csrfProtection,
  audit('celebrity:apply', 'Celebrity'),
  ctrl.postApply
);

// Method 2: Invitation claim
router.get('/claim/:token', ctrl.getClaim);
router.post('/claim/:token', audit('celebrity:claim', 'Celebrity'), ctrl.postClaim);

module.exports = router;