'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { Notification } = require('../models/index');
const Ticket = require('../models/Ticket');
const { getUnreadCount, markAllRead } = require('../services/notificationService');

// Notification unread count
router.get('/notifications/unread-count', requireAuth, async (req, res) => {
  try {
    const count = await getUnreadCount(req.user._id);
    res.json({ success: true, count });
  } catch {
    res.json({ success: false, count: 0 });
  }
});

// Mark all notifications read
router.post('/notifications/mark-read', requireAuth, async (req, res) => {
  try {
    await markAllRead(req.user._id);
    res.json({ success: true });
  } catch {
    res.json({ success: false });
  }
});

// QR ticket verify (public for check-in scanners)
router.post('/tickets/verify', requireAuth, async (req, res) => {
  try {
    const { verificationCode } = req.body;
    const ticket = await Ticket.findOne({ 'qrCode.verificationCode': verificationCode })
      .populate({ path: 'fan', select: 'firstName lastName avatar' })
      .populate({ path: 'event', select: 'title startDate' });

    if (!ticket) return res.json({ success: false, valid: false, message: 'Ticket not found.' });

    res.json({
      success: true,
      valid: ticket.status === 'active',
      checkedIn: ticket.checkedIn,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        status: ticket.status,
        category: ticket.ticketCategory,
        fan: ticket.fan ? `${ticket.fan.firstName} ${ticket.fan.lastName}` : 'Unknown',
        event: ticket.event?.title,
        checkedInAt: ticket.checkedInAt,
      },
    });
  } catch {
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
});

// Search celebrities/events
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, results: [] });

    const Celebrity = require('../models/Celebrity');
    const Event = require('../models/Event');

    const [celebrities, events] = await Promise.all([
      Celebrity.find({ $text: { $search: q }, isActive: true, isVerified: true })
        .select('stageName slug profileImage category').limit(5),
      Event.find({ $text: { $search: q }, status: 'published' })
        .select('title slug banner startDate type').limit(5),
    ]);

    res.json({
      success: true,
      results: {
        celebrities: celebrities.map((c) => ({ id: c._id, name: c.stageName, slug: c.slug, image: c.profileImage?.url, type: 'celebrity', category: c.category })),
        events: events.map((e) => ({ id: e._id, name: e.title, slug: e.slug, image: e.banner?.url, type: 'event', date: e.startDate })),
      },
    });
  } catch {
    res.json({ success: false, results: [] });
  }
});

module.exports = router;
