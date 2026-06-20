'use strict';
// routes/public.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/publicController');
module.exports = router;

router.get('/', ctrl.getHomepage);
router.get('/celebrities', ctrl.getCelebrities);
router.get('/celebrities/:slug', ctrl.getCelebrityDetail);
router.get('/events', ctrl.getEvents);
router.get('/events/:slug', ctrl.getEventDetail);
router.get('/fan-clubs', ctrl.getFanClubs);
router.get('/about', ctrl.getAbout);
router.get('/contact', ctrl.getContact);
router.get('/faq', ctrl.getFAQ);
