'use strict';

// ── Celebrity Routes ──────────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/celebrityController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { uploadEventBanner, uploadGallery, uploadAvatar } = require('../config/cloudinary');
const { audit } = require('../middleware/auditLog');

const CELEBRITY_ROLES = ['celebrity', 'celebrity_manager', 'event_organizer', 'admin', 'super_admin'];

router.use(requireAuth, requireRole(...CELEBRITY_ROLES));

router.get('/dashboard', ctrl.getDashboard);
router.get('/profile', ctrl.getProfile);
router.post('/profile', uploadGallery.fields([{ name: 'profileImage', maxCount: 1 }, { name: 'heroImage', maxCount: 1 }]), audit('celebrity:profile_update', 'Celebrity'), ctrl.updateProfile);

// Events
router.get('/events', ctrl.getEvents);
router.get('/events/create', ctrl.getCreateEvent);
router.post('/events/create', uploadEventBanner.single('banner'), audit('event:create', 'Event'), ctrl.postCreateEvent);
router.get('/events/:id/edit', ctrl.getEditEvent);
router.post('/events/:id/publish', audit('event:publish', 'Event'), ctrl.postPublishEvent);
router.post('/events/:id/cancel', audit('event:cancel', 'Event'), ctrl.postCancelEvent);

// Fan Club
router.get('/fan-club', ctrl.getFanClub);
router.post('/fan-club/create', audit('fanclub:create', 'FanClub'), ctrl.createFanClub);
router.post('/fan-club/post', uploadGallery.array('media', 10), audit('fanclub:post', 'Post'), ctrl.postFanClubPost);

// Analytics
router.get('/analytics', ctrl.getAnalytics);

module.exports = router;
