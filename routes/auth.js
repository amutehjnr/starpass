'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { redirectIfAuth, requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');
const { registerRules, loginRules, handleValidation } = require('../middleware/validate');
const { audit } = require('../middleware/auditLog');

router.get('/login', redirectIfAuth, ctrl.getLogin);
router.post('/login', authLimiter, loginRules, handleValidation, audit('user:login', 'User'), ctrl.postLogin);

router.get('/register', redirectIfAuth, ctrl.getRegister);
router.post('/register', authLimiter, registerRules, handleValidation, audit('user:register', 'User'), ctrl.postRegister);

router.post('/logout', requireAuth, ctrl.logout);
router.post('/refresh', ctrl.refreshToken);

router.get('/forgot-password', redirectIfAuth, ctrl.getForgotPassword);
router.post('/forgot-password', authLimiter, ctrl.postForgotPassword);

router.get('/reset-password/:token', ctrl.getResetPassword);
router.post('/reset-password/:token', authLimiter, ctrl.postResetPassword);

router.get('/verify-email/:token', requireAuth, ctrl.verifyEmail);

module.exports = router;
