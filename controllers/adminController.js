'use strict';

const { User } = require('../models/User');
const Celebrity = require('../models/Celebrity');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const GiftCard = require('../models/GiftCard');
const { FanClub, Review, Notification, AuditLog } = require('../models/index');
const { notifyPaymentApproved, notifyPaymentRejected } = require('../services/notificationService');
const { AppError } = require('../middleware/errorHandler');
const { emitToUser } = require('../config/socket');
const logger = require('../config/logger');
const crypto = require('crypto');
const Invitation = require('../models/Invitation');
const { sendTemplateEmail } = require('../services/emailService');

// ── Dashboard Analytics ───────────────────────────────────────────────────────
exports.getDashboard = async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalUsers, totalCelebrities, totalEvents, totalTickets,
      pendingPayments, monthlyUsers, monthlyRevenue,
      recentPayments, recentAuditLogs,
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      Celebrity.countDocuments({ isActive: true }),
      Event.countDocuments({ status: 'published' }),
      Ticket.countDocuments({ status: 'active' }),
      GiftCard.countDocuments({ status: { $in: ['pending', 'under_review'] } }),
      User.countDocuments({ createdAt: { $gte: monthStart } }),
      Ticket.aggregate([
        { $match: { status: 'active', createdAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: '$price' } } },
      ]),
      GiftCard.find({ status: { $in: ['pending', 'under_review'] } })
        .populate({ path: 'fan', select: 'firstName lastName email avatar' })
        .populate({ path: 'event', select: 'title' })
        .sort({ createdAt: 1 })
        .limit(10),
      AuditLog.find().sort({ createdAt: -1 }).limit(20)
        .populate({ path: 'actor', select: 'firstName lastName role' }),
    ]);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard – StarPass',
      stats: {
        totalUsers,
        totalCelebrities,
        totalEvents,
        totalTickets,
        pendingPayments,
        monthlyUsers,
        monthlyRevenue: monthlyRevenue[0]?.total || 0,
      },
      recentPayments,
      recentAuditLogs,
    });
  } catch (err) {
    next(err);
  }
};

// ── Users ─────────────────────────────────────────────────────────────────────
exports.getUsers = async (req, res, next) => {
  try {
    const { search, role, status, page = 1 } = req.query;
    const limit = 20;
    const skip = (page - 1) * limit;
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.isActive = status === 'active';
    if (search) filter.$or = [
      { firstName: new RegExp(search, 'i') },
      { lastName: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
    ];

    const [users, total] = await Promise.all([
      User.find(filter).select('-password -refreshTokens').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.render('admin/users', {
      title: 'Manage Users – StarPass',
      users,
      filters: { search, role, status },
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found.', 404);
    if (user.role === 'super_admin') throw new AppError('Cannot modify super admin.', 403);

    user.isActive = !user.isActive;
    await user.save();

    req.flash('success', `User ${user.isActive ? 'activated' : 'deactivated'} successfully.`);
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
};

exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const validRoles = ['fan', 'celebrity', 'celebrity_manager', 'event_organizer', 'moderator', 'admin'];

    if (!validRoles.includes(role)) throw new AppError('Invalid role.', 400);

    const user = await User.findById(req.params.id);
    if (!user) throw new AppError('User not found.', 404);
    if (user.role === 'super_admin') throw new AppError('Cannot modify super admin role.', 403);

    user.role = role;
    await user.save();

    req.flash('success', `User role updated to ${role}.`);
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
};

// ── Gift Card Reviews ─────────────────────────────────────────────────────────
exports.getGiftCardReviews = async (req, res, next) => {
  try {
    const { status = 'pending', page = 1 } = req.query;
    const limit = 15;
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      GiftCard.find({ status })
        .populate({ path: 'fan', select: 'firstName lastName email avatar' })
        .populate({ path: 'event', select: 'title startDate' })
        .populate({ path: 'ticket', select: 'ticketNumber ticketCategory price' })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit),
      GiftCard.countDocuments({ status }),
    ]);

    res.render('admin/gift-card-reviews', {
      title: 'Gift Card Reviews – StarPass',
      payments,
      currentStatus: status,
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getGiftCardDetail = async (req, res, next) => {
  try {
    const payment = await GiftCard.findById(req.params.id)
      .populate({ path: 'fan', select: 'firstName lastName email avatar country' })
      .populate({ path: 'event', select: 'title startDate venue' })
      .populate({ path: 'ticket', select: 'ticketNumber ticketCategory price ticketLabel' })
      .select('+pin');

    if (!payment) throw new AppError('Payment not found.', 404);

    res.render('admin/gift-card-detail', { title: 'Review Payment – StarPass', payment });
  } catch (err) {
    next(err);
  }
};

exports.approveGiftCard = async (req, res, next) => {
  try {
    const { approvalNotes } = req.body;
    const giftCard = await GiftCard.findById(req.params.id);
    if (!giftCard) throw new AppError('Payment not found.', 404);
    if (!['pending', 'under_review'].includes(giftCard.status)) throw new AppError('Payment already processed.', 400);

    // Approve gift card
    giftCard.status = 'approved';
    giftCard.reviewedBy = req.user._id;
    giftCard.reviewedAt = new Date();
    giftCard.approvalNotes = approvalNotes;
    await giftCard.save();

    // Activate ticket
    const ticket = await Ticket.findByIdAndUpdate(giftCard.ticket, { status: 'active' }, { new: true })
      .populate('event');

    // Update event sold count
    if (ticket?.event) {
      await Event.updateOne(
        { _id: ticket.event._id, 'ticketCategories.name': ticket.ticketCategory },
        { $inc: { 'ticketCategories.$.sold': 1, totalSold: 1, revenue: ticket.price } }
      );
    }

    // Generate QR code
    if (ticket) {
      const { generateTicketQR } = require('../services/qrService');
      const qrData = await generateTicketQR(ticket);
      await Ticket.findByIdAndUpdate(ticket._id, { 'qrCode.data': qrData });
    }

    // Notify fan
    const fan = await User.findById(giftCard.fan);
    if (fan) {
      await notifyPaymentApproved(fan, giftCard, ticket, ticket?.event || { title: 'Your Event' });
    }

    req.flash('success', 'Gift card approved and ticket activated.');
    res.redirect('/admin/gift-cards');
  } catch (err) {
    next(err);
  }
};

exports.rejectGiftCard = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason?.trim()) {
      req.flash('error', 'Rejection reason is required.');
      return res.redirect('back');
    }

    const giftCard = await GiftCard.findById(req.params.id);
    if (!giftCard) throw new AppError('Payment not found.', 404);

    giftCard.status = 'rejected';
    giftCard.reviewedBy = req.user._id;
    giftCard.reviewedAt = new Date();
    giftCard.rejectionReason = rejectionReason;
    await giftCard.save();

    // Reset ticket to pending_payment so fan can resubmit
    await Ticket.findByIdAndUpdate(giftCard.ticket, { status: 'pending_payment', payment: null });

    const fan = await User.findById(giftCard.fan);
    if (fan) {
      await notifyPaymentRejected(fan, giftCard, rejectionReason);
    }

    req.flash('success', 'Gift card rejected. Fan has been notified.');
    res.redirect('/admin/gift-cards');
  } catch (err) {
    next(err);
  }
};

exports.flagGiftCard = async (req, res, next) => {
  try {
    const { flag, severity } = req.body;
    await GiftCard.findByIdAndUpdate(req.params.id, {
      $push: { fraudFlags: { flag, severity: severity || 'medium', detectedAt: new Date() } },
      $set: { isFlagged: true, status: 'under_review' },
    });
    req.flash('info', 'Payment flagged for fraud review.');
    res.redirect('back');
  } catch (err) {
    next(err);
  }
};

// ── Celebrities ───────────────────────────────────────────────────────────────
exports.getCelebrities = async (req, res, next) => {
  try {
    const { search, verified, page = 1 } = req.query;
    const limit = 20;
    const skip = (page - 1) * limit;
    const filter = {};
    if (verified !== undefined) filter.isVerified = verified === 'true';
    if (search) filter.$text = { $search: search };

    const [celebrities, total] = await Promise.all([
      Celebrity.find(filter)
        .populate({ path: 'user', select: 'firstName lastName email isActive' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Celebrity.countDocuments(filter),
    ]);

    res.render('admin/celebrities', {
      title: 'Manage Celebrities – StarPass',
      celebrities,
      filters: { search, verified },
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.verifyCelebrity = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findByIdAndUpdate(
      req.params.id,
      { $set: { isVerified: true, verifiedAt: new Date() }, $unset: { rejectionReason: 1 } },
      { new: true }
    ).populate('user');
    if (!celebrity) throw new AppError('Celebrity not found.', 404);

    if (celebrity.user) {
      await User.findByIdAndUpdate(celebrity.user._id, { isActive: true });
      await sendTemplateEmail('celebrityApplicationApproved', celebrity.user.email, celebrity.user, celebrity)
        .catch((e) => logger.error('Approval email error:', e));
    }

    req.flash('success', 'Celebrity verified successfully.');
    res.redirect('/admin/celebrities');
  } catch (err) {
    next(err);
  }
};

exports.toggleFeaturedCelebrity = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findById(req.params.id);
    if (!celebrity) throw new AppError('Celebrity not found.', 404);
    celebrity.isFeatured = !celebrity.isFeatured;
    await celebrity.save();
    req.flash('success', `Celebrity ${celebrity.isFeatured ? 'featured' : 'unfeatured'}.`);
    res.redirect('/admin/celebrities');
  } catch (err) {
    next(err);
  }
};

// ── Celebrity Detail / Review ─────────────────────────────────────────────────
exports.getCelebrityDetail = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findById(req.params.id)
      .populate({ path: 'user', select: 'firstName lastName email isActive createdAt' });
    if (!celebrity) throw new AppError('Celebrity not found.', 404);

    res.render('admin/celebrity-detail', { title: `Review – ${celebrity.stageName}`, celebrity });
  } catch (err) {
    next(err);
  }
};

exports.rejectCelebrity = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;
    if (!rejectionReason?.trim()) {
      req.flash('error', 'Rejection reason is required.');
      return res.redirect('back');
    }

    const celebrity = await Celebrity.findById(req.params.id).populate('user');
    if (!celebrity) throw new AppError('Celebrity not found.', 404);

    celebrity.rejectionReason = rejectionReason;
    celebrity.isVerified = false;
    await celebrity.save();

    if (celebrity.user) {
      await User.findByIdAndUpdate(celebrity.user._id, { isActive: false });
      await sendTemplateEmail('celebrityApplicationRejected', celebrity.user.email, celebrity.user, celebrity, rejectionReason)
        .catch((e) => logger.error('Rejection email error:', e));
    }

    req.flash('success', 'Application rejected.');
    res.redirect('/admin/celebrities');
  } catch (err) {
    next(err);
  }
};

// ── Invitations ─────────────────────────────────────────────────────────────
exports.getInvitations = async (req, res, next) => {
  try {
    const invitations = await Invitation.find().sort({ createdAt: -1 }).populate({ path: 'invitedBy', select: 'firstName lastName' });
    res.render('admin/invitations', { title: 'Celebrity Invitations – StarPass', invitations });
  } catch (err) {
    next(err);
  }
};

exports.postCreateInvitation = async (req, res, next) => {
  try {
    const { email, stageName, category, note } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      req.flash('error', 'A user with this email already exists.');
      return res.redirect('/admin/invitations');
    }

    const existingInvite = await Invitation.findOne({ email, status: 'pending' });
    if (existingInvite) {
      req.flash('error', 'There is already a pending invitation for this email.');
      return res.redirect('/admin/invitations');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const invitation = await Invitation.create({
      email,
      stageName,
      category,
      note,
      invitedBy: req.user._id,
      token: crypto.createHash('sha256').update(rawToken).digest('hex'),
    });

    await sendTemplateEmail('celebrityInvitation', email, invitation, rawToken)
      .catch((e) => logger.error('Invitation email error:', e));

    req.flash('success', `Invitation sent to ${email}.`);
    res.redirect('/admin/invitations');
  } catch (err) {
    next(err);
  }
};

exports.postRevokeInvitation = async (req, res, next) => {
  try {
    await Invitation.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { status: 'revoked' });
    req.flash('success', 'Invitation revoked.');
    res.redirect('/admin/invitations');
  } catch (err) {
    next(err);
  }
};

exports.postResendInvitation = async (req, res, next) => {
  try {
    const invitation = await Invitation.findOne({ _id: req.params.id, status: 'pending' });
    if (!invitation) throw new AppError('Invitation not found or already used.', 404);

    const rawToken = crypto.randomBytes(32).toString('hex');
    invitation.token = crypto.createHash('sha256').update(rawToken).digest('hex');
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await invitation.save();

    await sendTemplateEmail('celebrityInvitation', invitation.email, invitation, rawToken)
      .catch((e) => logger.error('Invitation email error:', e));

    req.flash('success', 'Invitation resent.');
    res.redirect('/admin/invitations');
  } catch (err) {
    next(err);
  }
};

// ── Events ────────────────────────────────────────────────────────────────────
exports.getEvents = async (req, res, next) => {
  try {
    const { status, page = 1 } = req.query;
    const limit = 20;
    const skip = (page - 1) * limit;
    const filter = {};
    if (status) filter.status = status;

    const [events, total] = await Promise.all([
      Event.find(filter)
        .populate({ path: 'celebrity', select: 'stageName profileImage' })
        .select('title slug type category startDate status totalSold totalCapacity isFeatured')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Event.countDocuments(filter),
    ]);

    res.render('admin/events', {
      title: 'Manage Events – StarPass',
      events,
      currentStatus: status || 'all',
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.toggleFeaturedEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) throw new AppError('Event not found.', 404);
    event.isFeatured = !event.isFeatured;
    await event.save();
    req.flash('success', `Event ${event.isFeatured ? 'featured' : 'unfeatured'}.`);
    res.redirect('/admin/events');
  } catch (err) {
    next(err);
  }
};

// ── Reviews Moderation ────────────────────────────────────────────────────────
exports.getReviews = async (req, res, next) => {
  try {
    const { approved, page = 1 } = req.query;
    const limit = 20;
    const skip = (page - 1) * limit;
    const filter = {};
    if (approved !== undefined) filter.isApproved = approved === 'true';

    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .populate({ path: 'fan', select: 'firstName lastName email' })
        .populate({ path: 'event', select: 'title' })
        .populate({ path: 'celebrity', select: 'stageName' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);

    res.render('admin/reviews', {
      title: 'Manage Reviews – StarPass',
      reviews,
      filters: { approved },
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.approveReview = async (req, res, next) => {
  try {
    const review = await Review.findByIdAndUpdate(req.params.id, {
      isApproved: true,
      isVisible: true,
      approvedBy: req.user._id,
      approvedAt: new Date(),
    }, { new: true });

    if (!review) throw new AppError('Review not found.', 404);

    // Update celebrity rating
    const [agg] = await Review.aggregate([
      { $match: { celebrity: review.celebrity, isApproved: true, isVisible: true } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    if (agg) {
      await Celebrity.findByIdAndUpdate(review.celebrity, {
        averageRating: Math.round(agg.avg * 10) / 10,
        totalReviews: agg.count,
      });
    }

    req.flash('success', 'Review approved.');
    res.redirect('/admin/reviews');
  } catch (err) {
    next(err);
  }
};

exports.deleteReview = async (req, res, next) => {
  try {
    await Review.findByIdAndUpdate(req.params.id, { isVisible: false });
    req.flash('success', 'Review hidden.');
    res.redirect('/admin/reviews');
  } catch (err) {
    next(err);
  }
};

// ── Check-in ──────────────────────────────────────────────────────────────────
exports.getCheckin = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.eventId).populate('celebrity');
    if (!event) throw new AppError('Event not found.', 404);

    const checkedInCount = await Ticket.countDocuments({ event: event._id, checkedIn: true });

    res.render('admin/checkin', { title: `Check-In – ${event.title}`, event, checkedInCount });
  } catch (err) {
    next(err);
  }
};

exports.postCheckin = async (req, res, next) => {
  try {
    const { verificationCode, eventId } = req.body;

    const ticket = await Ticket.findOne({
      'qrCode.verificationCode': verificationCode,
      event: eventId,
      status: 'active',
    }).populate({ path: 'fan', select: 'firstName lastName email avatar' });

    if (!ticket) {
      return res.json({ success: false, message: 'Invalid or already used ticket.' });
    }

    if (ticket.checkedIn) {
      return res.json({ success: false, message: `Already checked in at ${ticket.checkedInAt?.toLocaleTimeString()}.`, ticket });
    }

    ticket.checkedIn = true;
    ticket.checkedInAt = new Date();
    ticket.checkedInBy = req.user._id;
    ticket.status = 'used';
    await ticket.save();

    const { emitToEvent } = require('../config/socket');
    emitToEvent(eventId, 'checkin:new', {
      ticketNumber: ticket.ticketNumber,
      fan: `${ticket.fan.firstName} ${ticket.fan.lastName}`,
      category: ticket.ticketCategory,
      checkedInAt: ticket.checkedInAt,
    });

    res.json({ success: true, message: 'Check-in successful!', ticket });
  } catch (err) {
    next(err);
  }
};

// ── Audit Logs ────────────────────────────────────────────────────────────────
exports.getAuditLogs = async (req, res, next) => {
  try {
    const { action, page = 1 } = req.query;
    const limit = 30;
    const skip = (page - 1) * limit;
    const filter = {};
    if (action) filter.action = new RegExp(action, 'i');

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate({ path: 'actor', select: 'firstName lastName email role' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.render('admin/audit-logs', {
      title: 'Audit Logs – StarPass',
      logs,
      filters: { action },
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};
