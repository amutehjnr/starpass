'use strict';

const QRCode = require('qrcode');
const { User } = require('../models/User');
const Celebrity = require('../models/Celebrity');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const GiftCard = require('../models/GiftCard');
const { FanClub, Review, Notification } = require('../models/index');
const { generateTicketPDF } = require('../services/pdfService');
const { generateTicketQR } = require('../services/qrService');
const { notifyTicketConfirmed, getUnreadCount, markAllRead } = require('../services/notificationService');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

// ── Dashboard ─────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res, next) => {
  try {
    const fanId = req.user._id;
    const [tickets, unreadCount, recentNotifications] = await Promise.all([
      Ticket.find({ fan: fanId, status: { $in: ['active', 'pending_payment'] } })
        .populate({ path: 'event', select: 'title startDate banner venue status' })
        .sort({ createdAt: -1 })
        .limit(5),
      getUnreadCount(fanId),
      Notification.find({ recipient: fanId }).sort({ createdAt: -1 }).limit(5),
    ]);

    const upcomingTickets = tickets.filter((t) => t.event?.startDate > new Date());
    const stats = {
      totalTickets: await Ticket.countDocuments({ fan: fanId }),
      upcomingEvents: upcomingTickets.length,
      fanClubs: await FanClub.countDocuments({ 'members.user': fanId }),
    };

    res.render('fan/dashboard', {
      title: 'Dashboard – StarPass',
      tickets: upcomingTickets,
      stats,
      unreadCount,
      recentNotifications,
    });
  } catch (err) {
    next(err);
  }
};

// ── Tickets ───────────────────────────────────────────────────────────────────
exports.getTickets = async (req, res, next) => {
  try {
    const { status, page = 1 } = req.query;
    const limit = 12;
    const skip = (page - 1) * limit;
    const filter = { fan: req.user._id };
    if (status) filter.status = status;

    const [tickets, total] = await Promise.all([
      Ticket.find(filter)
        .populate({ path: 'event', select: 'title startDate banner venue type status' })
        .populate({ path: 'celebrity', select: 'stageName profileImage' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Ticket.countDocuments(filter),
    ]);

    res.render('fan/tickets', {
      title: 'My Tickets – StarPass',
      tickets,
      currentStatus: status || 'all',
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getTicketDetail = async (req, res, next) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.id, fan: req.user._id })
      .populate({ path: 'event', populate: { path: 'celebrity', model: 'Celebrity' } })
      .populate('celebrity');

    if (!ticket) {
      req.flash('error', 'Ticket not found.');
      return res.redirect('/fan/tickets');
    }

    // Regenerate QR if missing
    if (ticket.status === 'active' && !ticket.qrCode?.data) {
      const qrData = await generateTicketQR(ticket);
      ticket.qrCode = { ...ticket.qrCode, data: qrData };
      await ticket.save();
    }

    res.render('fan/ticket-detail', { title: `Ticket – ${ticket.event?.title}`, ticket });
  } catch (err) {
    next(err);
  }
};

exports.downloadTicket = async (req, res, next) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.id, fan: req.user._id })
      .populate('event')
      .populate('celebrity');

    if (!ticket || ticket.status !== 'active') {
      req.flash('error', 'Ticket not available for download.');
      return res.redirect('/fan/tickets');
    }

    const pdfBuffer = await generateTicketPDF(ticket, ticket.event, req.user, ticket.celebrity);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="StarPass-${ticket.ticketNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
};

// ── Purchase Flow ─────────────────────────────────────────────────────────────
exports.getPurchasePage = async (req, res, next) => {
  try {
    const event = await Event.findOne({ _id: req.params.eventId, status: 'published' })
      .populate({ path: 'celebrity', select: 'stageName profileImage isVerified' });

    if (!event) {
      req.flash('error', 'Event not found.');
      return res.redirect('/events');
    }

    if (event.startDate < new Date()) {
      req.flash('error', 'This event has already passed.');
      return res.redirect(`/events/${event.slug}`);
    }

    // Check if fan already has a ticket
    const existingTicket = await Ticket.findOne({ fan: req.user._id, event: event._id, status: { $nin: ['cancelled', 'refunded'] } });

    res.render('fan/purchase', {
      title: `Purchase Ticket – ${event.title}`,
      event,
      existingTicket,
    });
  } catch (err) {
    next(err);
  }
};

exports.postPurchaseTicket = async (req, res, next) => {
  try {
    const { eventId, ticketCategory } = req.body;

    const event = await Event.findOne({ _id: eventId, status: 'published' });
    if (!event) throw new AppError('Event not found.', 404);

    if (event.startDate < new Date()) throw new AppError('This event has already passed.', 400);

    // Check for duplicate
    const existing = await Ticket.findOne({
      fan: req.user._id,
      event: eventId,
      status: { $nin: ['cancelled', 'refunded'] },
    });
    if (existing) throw new AppError('You already have a ticket for this event.', 409);

    const category = event.ticketCategories.find((c) => c.name === ticketCategory && c.isActive);
    if (!category) throw new AppError('Invalid ticket category.', 400);
    if (category.sold >= category.capacity) throw new AppError('This ticket category is sold out.', 400);

    // Create ticket in pending_payment state
    const ticket = await Ticket.create({
      fan: req.user._id,
      event: eventId,
      celebrity: event.celebrity,
      ticketCategory,
      ticketLabel: category.label,
      price: category.price,
      status: 'pending_payment',
    });

    // Redirect to gift card upload
    res.redirect(`/fan/payments/upload/${ticket._id}`);
  } catch (err) {
    next(err);
  }
};

// ── Gift Card Payments ─────────────────────────────────────────────────────────
exports.getPayments = async (req, res, next) => {
  try {
    const { status, page = 1 } = req.query;
    const limit = 12;
    const skip = (page - 1) * limit;
    const filter = { fan: req.user._id };
    if (status) filter.status = status;

    const [payments, total] = await Promise.all([
      GiftCard.find(filter)
        .populate({ path: 'ticket', select: 'ticketNumber ticketCategory status' })
        .populate({ path: 'event', select: 'title startDate' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      GiftCard.countDocuments(filter),
    ]);

    res.render('fan/payments', {
      title: 'My Payments – StarPass',
      payments,
      currentStatus: status || 'all',
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getUploadGiftCard = async (req, res, next) => {
  try {
    const ticket = await Ticket.findOne({ _id: req.params.ticketId, fan: req.user._id, status: 'pending_payment' })
      .populate('event');

    if (!ticket) {
      req.flash('error', 'Ticket not found or payment already submitted.');
      return res.redirect('/fan/tickets');
    }

    res.render('fan/upload-gift-card', {
      title: 'Upload Gift Card – StarPass',
      ticket,
    });
  } catch (err) {
    next(err);
  }
};

exports.postUploadGiftCard = async (req, res, next) => {
  try {
    const { ticketId, cardType, declaredValue, cardNumber } = req.body;

    const ticket = await Ticket.findOne({ _id: ticketId, fan: req.user._id, status: 'pending_payment' });
    if (!ticket) throw new AppError('Ticket not found.', 404);

    // Check existing pending submission
    const existingPayment = await GiftCard.findOne({ ticket: ticketId, status: { $in: ['pending', 'under_review'] } });
    if (existingPayment) throw new AppError('A payment is already under review for this ticket.', 409);

    const images = {};
    if (req.files?.front?.[0]) images.front = { url: req.files.front[0].path, publicId: req.files.front[0].filename };
    if (req.files?.back?.[0]) images.back = { url: req.files.back[0].path, publicId: req.files.back[0].filename };
    if (req.files?.receipt?.[0]) images.receipt = { url: req.files.receipt[0].path, publicId: req.files.receipt[0].filename };

    if (!images.front?.url) throw new AppError('Front image of gift card is required.', 400);

    const giftCard = await GiftCard.create({
      fan: req.user._id,
      ticket: ticketId,
      event: ticket.event,
      cardType,
      declaredValue: parseFloat(declaredValue),
      cardNumber,
      images,
      status: 'pending',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Link payment to ticket
    await Ticket.findByIdAndUpdate(ticketId, { payment: giftCard._id });

    req.flash('success', 'Gift card submitted! Our team will review it shortly (usually within 24 hours).');
    res.redirect('/fan/payments');
  } catch (err) {
    next(err);
  }
};

// ── Profile ───────────────────────────────────────────────────────────────────
exports.getProfile = async (req, res, next) => {
  try {
    res.render('fan/profile', { title: 'My Profile – StarPass' });
  } catch (err) {
    next(err);
  }
};

exports.postUpdateProfile = async (req, res, next) => {
  try {
    const { firstName, lastName, phone, country, bio } = req.body;
    const updates = { firstName, lastName, phone, country, bio };

    if (req.file) {
      updates['avatar.url'] = req.file.path;
      updates['avatar.publicId'] = req.file.filename;
    }

    await User.findByIdAndUpdate(req.user._id, updates, { runValidators: true });
    req.flash('success', 'Profile updated successfully.');
    res.redirect('/fan/profile');
  } catch (err) {
    next(err);
  }
};

// ── Fan Clubs ─────────────────────────────────────────────────────────────────
exports.getFanClubs = async (req, res, next) => {
  try {
    const fanClubs = await FanClub.find({ 'members.user': req.user._id })
      .populate({ path: 'celebrity', select: 'stageName profileImage isVerified category' })
      .sort({ createdAt: -1 });

    res.render('fan/fan-clubs', { title: 'My Fan Clubs – StarPass', fanClubs });
  } catch (err) {
    next(err);
  }
};

exports.joinFanClub = async (req, res, next) => {
  try {
    const fanClub = await FanClub.findById(req.params.id);
    if (!fanClub) throw new AppError('Fan club not found.', 404);

    const isMember = fanClub.members.some((m) => m.user.toString() === req.user._id.toString());
    if (isMember) {
      req.flash('info', 'You are already a member of this fan club.');
      return res.redirect('back');
    }

    fanClub.members.push({ user: req.user._id });
    fanClub.memberCount = fanClub.members.length;
    await fanClub.save();

    req.flash('success', 'You have joined the fan club!');
    res.redirect('back');
  } catch (err) {
    next(err);
  }
};

exports.leaveFanClub = async (req, res, next) => {
  try {
    const fanClub = await FanClub.findById(req.params.id);
    if (!fanClub) throw new AppError('Fan club not found.', 404);

    fanClub.members = fanClub.members.filter((m) => m.user.toString() !== req.user._id.toString());
    fanClub.memberCount = fanClub.members.length;
    await fanClub.save();

    req.flash('success', 'You have left the fan club.');
    res.redirect('/fan/fan-clubs');
  } catch (err) {
    next(err);
  }
};

// ── Notifications ─────────────────────────────────────────────────────────────
exports.getNotifications = async (req, res, next) => {
  try {
    const { page = 1 } = req.query;
    const limit = 20;
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments({ recipient: req.user._id }),
    ]);

    await markAllRead(req.user._id);

    res.render('fan/notifications', {
      title: 'Notifications – StarPass',
      notifications,
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ── Reviews ───────────────────────────────────────────────────────────────────
exports.getReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ fan: req.user._id })
      .populate({ path: 'event', select: 'title startDate banner' })
      .populate({ path: 'celebrity', select: 'stageName profileImage' })
      .sort({ createdAt: -1 });

    // Events eligible for review (attended, no review yet)
    const attendedEventIds = await Ticket.distinct('event', { fan: req.user._id, status: 'used' });
    const reviewedEventIds = reviews.map((r) => r.event._id.toString());
    const pendingReviewEvents = await Event.find({
      _id: { $in: attendedEventIds.filter((id) => !reviewedEventIds.includes(id.toString())) },
    }).select('title startDate banner');

    res.render('fan/reviews', { title: 'My Reviews – StarPass', reviews, pendingReviewEvents });
  } catch (err) {
    next(err);
  }
};

exports.postReview = async (req, res, next) => {
  try {
    const { eventId, rating, title, content } = req.body;

    const ticket = await Ticket.findOne({ fan: req.user._id, event: eventId, status: 'used' });
    if (!ticket) throw new AppError('You must attend the event to leave a review.', 403);

    const existing = await Review.findOne({ fan: req.user._id, event: eventId });
    if (existing) throw new AppError('You have already reviewed this event.', 409);

    const event = await Event.findById(eventId);
    if (!event) throw new AppError('Event not found.', 404);

    const photos = [];
    if (req.files?.length) {
      req.files.forEach((f) => photos.push({ url: f.path, publicId: f.filename }));
    }

    await Review.create({
      fan: req.user._id,
      event: eventId,
      celebrity: event.celebrity,
      rating: parseInt(rating),
      title,
      content,
      photos,
      isVerifiedAttendee: true,
    });

    req.flash('success', 'Review submitted! It will appear after moderation.');
    res.redirect('/fan/reviews');
  } catch (err) {
    next(err);
  }
};
