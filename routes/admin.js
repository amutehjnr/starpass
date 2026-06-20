'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../middleware/auditLog');

const ADMIN_ROLES = ['admin', 'super_admin', 'moderator'];

router.use(requireAuth, requireRole(...ADMIN_ROLES));

// Dashboard
router.get('/dashboard', ctrl.getDashboard);

// Users
router.get('/users', requireRole('admin', 'super_admin'), ctrl.getUsers);
router.post('/users/:id/toggle-status', requireRole('admin', 'super_admin'), audit('admin:user_toggle', 'User'), ctrl.toggleUserStatus);
router.post('/users/:id/role', requireRole('admin', 'super_admin'), audit('admin:user_role', 'User'), ctrl.updateUserRole);

// Gift Card Reviews
router.get('/gift-cards', ctrl.getGiftCardReviews);
router.get('/gift-cards/:id', ctrl.getGiftCardDetail);
router.post('/gift-cards/:id/approve', audit('payment:approve', 'GiftCard'), ctrl.approveGiftCard);
router.post('/gift-cards/:id/reject', audit('payment:reject', 'GiftCard'), ctrl.rejectGiftCard);
router.post('/gift-cards/:id/flag', audit('payment:flag', 'GiftCard'), ctrl.flagGiftCard);

// Celebrities
router.get('/celebrities', ctrl.getCelebrities);
router.post('/celebrities/:id/verify', requireRole('admin', 'super_admin'), audit('admin:celebrity_verify', 'Celebrity'), ctrl.verifyCelebrity);
router.post('/celebrities/:id/toggle-featured', requireRole('admin', 'super_admin'), audit('admin:celebrity_feature', 'Celebrity'), ctrl.toggleFeaturedCelebrity);

// Events
router.get('/events', ctrl.getEvents);
router.post('/events/:id/toggle-featured', requireRole('admin', 'super_admin'), audit('admin:event_feature', 'Event'), ctrl.toggleFeaturedEvent);

// Reviews
router.get('/reviews', ctrl.getReviews);
router.post('/reviews/:id/approve', audit('admin:review_approve', 'Review'), ctrl.approveReview);
router.post('/reviews/:id/delete', audit('admin:review_delete', 'Review'), ctrl.deleteReview);

// Check-in
router.get('/checkin/:eventId', ctrl.getCheckin);
router.post('/checkin', ctrl.postCheckin);

// Audit Logs
router.get('/audit-logs', requireRole('admin', 'super_admin'), ctrl.getAuditLogs);

module.exports = router;
