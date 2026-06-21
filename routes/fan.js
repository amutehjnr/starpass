'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/fanController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadGiftCard, uploadAvatar, uploadGallery } = require('../config/cloudinary');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { giftCardRules, reviewRules, handleValidation } = require('../middleware/validate');
const { audit } = require('../middleware/auditLog');
const { csrfProtection } = require('../middleware/csrf');

// All fan routes require auth
router.use(requireAuth, requireRole('fan', 'celebrity', 'celebrity_manager', 'event_organizer', 'moderator', 'admin', 'super_admin'));

router.get('/dashboard', ctrl.getDashboard);

// Tickets
router.get('/tickets', ctrl.getTickets);
router.get('/tickets/:id', ctrl.getTicketDetail);
router.get('/tickets/:id/download', ctrl.downloadTicket);

// Purchase flow
router.get('/purchase/:eventId', ctrl.getPurchasePage);
router.post('/purchase', audit('ticket:purchase', 'Ticket'), ctrl.postPurchaseTicket);

// Payments / Gift Cards
router.get('/payments', ctrl.getPayments);
router.get('/payments/upload/:ticketId', ctrl.getUploadGiftCard);
router.post(
  '/payments/upload',
  uploadLimiter,
  uploadGiftCard.fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }, { name: 'receipt', maxCount: 1 }]),
  csrfProtection,
  giftCardRules,
  handleValidation,
  audit('payment:submit', 'GiftCard'),
  ctrl.postUploadGiftCard
);

// Profile
router.get('/profile', ctrl.getProfile);
router.post('/profile', uploadAvatar.single('avatar'), csrfProtection, audit('user:profile_update', 'User'), ctrl.postUpdateProfile);

// Fan Clubs
router.get('/fan-clubs', ctrl.getFanClubs);
router.post('/fan-clubs/:id/join', audit('fanclub:join', 'FanClub'), ctrl.joinFanClub);
router.post('/fan-clubs/:id/leave', audit('fanclub:leave', 'FanClub'), ctrl.leaveFanClub);

// Notifications
router.get('/notifications', ctrl.getNotifications);

// Reviews
router.get('/reviews', ctrl.getReviews);
router.post('/reviews', uploadGallery.array('photos', 5), csrfProtection, reviewRules, handleValidation, audit('review:create', 'Review'), ctrl.postReview);

module.exports = router;