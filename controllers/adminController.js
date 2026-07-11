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
const crypto = require('crypto');
const Invitation = require('../models/Invitation');
const { sendTemplateEmail } = require('../services/emailService');
const { deleteFile } = require('../config/cloudinary');

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

// ══════════════════════════════════════════════════════════════════════════════
// ── Celebrity Full CRUD ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

exports.getCreateCelebrity = async (req, res, next) => {
  try {
    res.render('admin/celebrity-create', {
      title: 'Create Celebrity – StarPass',
    });
  } catch (err) {
    next(err);
  }
};

exports.postCreateCelebrity = async (req, res, next) => {
  try {
    const {
      firstName, lastName, email, password,
      stageName, category, shortBio, biography,
      achievements, tags, basePrice, nationality, genres,
    } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      req.flash('error', 'A user with this email already exists.');
      return res.redirect('/admin/celebrities/create');
    }

    const existingSlug = await Celebrity.findOne({
      slug: stageName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'),
    });
    if (existingSlug) {
      req.flash('error', 'A celebrity with this stage name already exists.');
      return res.redirect('/admin/celebrities/create');
    }

    const user = await User.create({
      firstName, lastName, email,
      password: password || crypto.randomBytes(8).toString('hex'),
      role: 'celebrity',
      isActive: true,
      isEmailVerified: true,
    });

    let celebrity;
    try {
      celebrity = await Celebrity.create({
        user: user._id,
        stageName,
        category,
        shortBio,
        biography,
        achievements: achievements ? achievements.split('\n').filter(Boolean) : [],
        tags: tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : [],
        basePrice: parseFloat(basePrice) || 0,
        isVerified: req.body.isVerified === 'on',
        isFeatured: req.body.isFeatured === 'on',
        isActive: true,
        applicationSource: 'admin_invited',
        verifiedAt: req.body.isVerified === 'on' ? new Date() : undefined,
        metadata: {
          nationality,
          genres: genres ? genres.split(',').map((g) => g.trim()) : [],
        },
      });
    } catch (err) {
      await User.findByIdAndDelete(user._id).catch(() => {});
      throw err;
    }

    if (req.files?.profileImage?.[0]) {
      await Celebrity.findByIdAndUpdate(celebrity._id, {
        profileImage: { url: req.files.profileImage[0].path, publicId: req.files.profileImage[0].filename },
      });
    }
    if (req.files?.heroImage?.[0]) {
      await Celebrity.findByIdAndUpdate(celebrity._id, {
        heroImage: { url: req.files.heroImage[0].path, publicId: req.files.heroImage[0].filename },
      });
    }

    await AuditLog.create({
      actor: req.user._id,
      actorRole: req.user.role,
      action: 'admin:celebrity_create',
      resource: 'Celebrity',
      resourceId: celebrity._id,
      details: { stageName, email },
      ipAddress: req.ip,
      status: 'success',
    });

    req.flash('success', `Celebrity "${stageName}" created successfully.`);
    res.redirect(`/admin/celebrities/${celebrity._id}`);
  } catch (err) {
    next(err);
  }
};

exports.getEditCelebrity = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findById(req.params.id)
      .populate({ path: 'user', select: 'firstName lastName email isActive role' });
    if (!celebrity) throw new AppError('Celebrity not found.', 404);

    res.render('admin/celebrity-edit', {
      title: `Edit – ${celebrity.stageName}`,
      celebrity,
    });
  } catch (err) {
    next(err);
  }
};

exports.postEditCelebrity = async (req, res, next) => {
  try {
    const {
      stageName, category, shortBio, biography,
      achievements, tags, basePrice, nationality, genres,
      firstName, lastName,
    } = req.body;

    const celebrity = await Celebrity.findById(req.params.id).populate('user');
    if (!celebrity) throw new AppError('Celebrity not found.', 404);

    // Update User name if changed
    if (firstName || lastName) {
      await User.findByIdAndUpdate(celebrity.user._id, {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
      });
    }

    celebrity.stageName = stageName || celebrity.stageName;
    celebrity.category = category || celebrity.category;
    celebrity.shortBio = shortBio;
    celebrity.biography = biography;
    celebrity.achievements = achievements ? achievements.split('\n').filter(Boolean) : celebrity.achievements;
    celebrity.tags = tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : celebrity.tags;
    celebrity.basePrice = parseFloat(basePrice) || celebrity.basePrice;
    celebrity.isVerified = req.body.isVerified === 'on';
    celebrity.isFeatured = req.body.isFeatured === 'on';
    if (req.body.isVerified === 'on' && !celebrity.verifiedAt) {
      celebrity.verifiedAt = new Date();
    }
    celebrity.metadata = {
      nationality: nationality || celebrity.metadata?.nationality,
      genres: genres ? genres.split(',').map((g) => g.trim()) : celebrity.metadata?.genres || [],
      languages: celebrity.metadata?.languages || [],
    };

    if (req.files?.profileImage?.[0]) {
      if (celebrity.profileImage?.publicId) {
        await deleteFile(celebrity.profileImage.publicId).catch(() => {});
      }
      celebrity.profileImage = { url: req.files.profileImage[0].path, publicId: req.files.profileImage[0].filename };
    }
    if (req.files?.heroImage?.[0]) {
      if (celebrity.heroImage?.publicId) {
        await deleteFile(celebrity.heroImage.publicId).catch(() => {});
      }
      celebrity.heroImage = { url: req.files.heroImage[0].path, publicId: req.files.heroImage[0].filename };
    }

    await celebrity.save();

    req.flash('success', `${celebrity.stageName} updated successfully.`);
    res.redirect(`/admin/celebrities/${celebrity._id}`);
  } catch (err) {
    next(err);
  }
};

exports.suspendCelebrity = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findById(req.params.id).populate('user');
    if (!celebrity) throw new AppError('Celebrity not found.', 404);

    const newStatus = !celebrity.isActive;
    celebrity.isActive = newStatus;
    await celebrity.save();

    // Also suspend/restore the user account
    await User.findByIdAndUpdate(celebrity.user._id, { isActive: newStatus });

    // If suspending, unpublish all their events
    if (!newStatus) {
      await Event.updateMany(
        { celebrity: celebrity._id, status: 'published' },
        { $set: { status: 'postponed' } }
      );
    }

    req.flash(
      'success',
      `${celebrity.stageName} has been ${newStatus ? 'reinstated' : 'suspended'}.`
    );
    res.redirect('/admin/celebrities');
  } catch (err) {
    next(err);
  }
};

exports.deleteCelebrity = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findById(req.params.id).populate('user');
    if (!celebrity) throw new AppError('Celebrity not found.', 404);

    // Clean up Cloudinary assets
    if (celebrity.profileImage?.publicId) await deleteFile(celebrity.profileImage.publicId).catch(() => {});
    if (celebrity.heroImage?.publicId) await deleteFile(celebrity.heroImage.publicId).catch(() => {});
    for (const g of celebrity.gallery || []) {
      if (g.publicId) await deleteFile(g.publicId).catch(() => {});
    }

    // Cancel all their events
    await Event.updateMany({ celebrity: celebrity._id }, { $set: { status: 'cancelled' } });

    // Delete fan club
    const { FanClub } = require('../models/index');
    if (celebrity.fanClub) await FanClub.findByIdAndDelete(celebrity.fanClub).catch(() => {});

    // Delete user account
    if (celebrity.user) await User.findByIdAndDelete(celebrity.user._id).catch(() => {});

    // Delete celebrity
    await Celebrity.findByIdAndDelete(celebrity._id);

    req.flash('success', `${celebrity.stageName} and all associated data have been deleted.`);
    res.redirect('/admin/celebrities');
  } catch (err) {
    next(err);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// ── Event Full CRUD ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

exports.getAdminCreateEvent = async (req, res, next) => {
  try {
    const celebrities = await Celebrity.find({ isActive: true, isVerified: true })
      .select('stageName profileImage')
      .sort({ stageName: 1 });

    res.render('admin/event-create', {
      title: 'Create Event – StarPass',
      celebrities,
    });
  } catch (err) {
    next(err);
  }
};

exports.postAdminCreateEvent = async (req, res, next) => {
  try {
    const {
      title, description, shortDescription, type, category,
      startDate, endDate, timezone, celebrityId,
      venueName, venueAddress, venueCity, venueCountry, virtualLink,
      rulesAndGuidelines, tags,
    } = req.body;

    const celebrity = await Celebrity.findById(celebrityId);
    if (!celebrity) throw new AppError('Celebrity not found.', 404);

    const ticketCategories = [];
    const categoryNames = ['general', 'premium', 'vip', 'platinum_vip'];
    const categoryLabels = {
      general: 'General Admission', premium: 'Premium',
      vip: 'VIP', platinum_vip: 'Platinum VIP',
    };
    const defaultBenefits = {
      general: ['Event Access'],
      premium: ['Event Access', 'Priority Entry', 'Better Seating'],
      vip: ['Event Access', 'Meet Celebrity', 'Professional Photo', 'Autograph Session', 'Front Row Access'],
      platinum_vip: ['Private Meet & Greet', 'VIP Lounge', 'Premium Merchandise', 'Personal Interaction', 'Professional Photo'],
    };

    categoryNames.forEach((name) => {
      const price = parseFloat(req.body[`cat_${name}_price`]);
      const capacity = parseInt(req.body[`cat_${name}_capacity`]);
      if (price >= 0 && capacity > 0) {
        ticketCategories.push({
          name, label: categoryLabels[name], price, capacity,
          benefits: defaultBenefits[name], isActive: true,
        });
      }
    });

    const event = await Event.create({
      title, description, shortDescription, type, category,
      celebrity: celebrity._id,
      organizer: req.user._id,
      venue: { name: venueName, address: venueAddress, city: venueCity, country: venueCountry, virtualLink },
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      timezone: timezone || 'UTC',
      ticketCategories,
      rulesAndGuidelines: rulesAndGuidelines ? rulesAndGuidelines.split('\n').filter(Boolean) : [],
      tags: tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : [],
      status: req.body.status || 'draft',
      isFeatured: req.body.isFeatured === 'on',
      publishedAt: req.body.status === 'published' ? new Date() : undefined,
    });

    if (req.file) {
      await Event.findByIdAndUpdate(event._id, {
        banner: { url: req.file.path, publicId: req.file.filename },
      });
    }

    req.flash('success', `Event "${title}" created successfully.`);
    res.redirect(`/admin/events/${event._id}/edit`);
  } catch (err) {
    next(err);
  }
};

exports.getAdminEditEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate({ path: 'celebrity', select: 'stageName profileImage' });
    if (!event) throw new AppError('Event not found.', 404);

    const celebrities = await Celebrity.find({ isActive: true, isVerified: true })
      .select('stageName profileImage')
      .sort({ stageName: 1 });

    res.render('admin/event-edit', {
      title: `Edit – ${event.title}`,
      event,
      celebrities,
    });
  } catch (err) {
    next(err);
  }
};

exports.postAdminEditEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) throw new AppError('Event not found.', 404);

    const {
      title, description, shortDescription, type, category,
      startDate, endDate, timezone, celebrityId,
      venueName, venueAddress, venueCity, venueCountry, virtualLink,
      rulesAndGuidelines, tags, status,
    } = req.body;

    event.title = title || event.title;
    event.description = description || event.description;
    event.shortDescription = shortDescription;
    event.type = type || event.type;
    event.category = category || event.category;
    if (celebrityId) event.celebrity = celebrityId;
    event.venue = {
      name: venueName, address: venueAddress,
      city: venueCity, country: venueCountry, virtualLink,
      coordinates: event.venue?.coordinates,
    };
    if (startDate) event.startDate = new Date(startDate);
    if (endDate) event.endDate = new Date(endDate);
    event.timezone = timezone || event.timezone;
    event.rulesAndGuidelines = rulesAndGuidelines
      ? rulesAndGuidelines.split('\n').filter(Boolean)
      : event.rulesAndGuidelines;
    event.tags = tags
      ? tags.split(',').map((t) => t.trim().toLowerCase())
      : event.tags;
    event.isFeatured = req.body.isFeatured === 'on';

    // Status change handling
    if (status && status !== event.status) {
      event.status = status;
      if (status === 'published' && !event.publishedAt) event.publishedAt = new Date();
      if (status === 'cancelled') event.cancelledAt = new Date();
    }

    // Ticket categories
    const categoryNames = ['general', 'premium', 'vip', 'platinum_vip'];
    const categoryLabels = {
      general: 'General Admission', premium: 'Premium',
      vip: 'VIP', platinum_vip: 'Platinum VIP',
    };
    const defaultBenefits = {
      general: ['Event Access'],
      premium: ['Event Access', 'Priority Entry', 'Better Seating'],
      vip: ['Event Access', 'Meet Celebrity', 'Professional Photo', 'Autograph Session', 'Front Row Access'],
      platinum_vip: ['Private Meet & Greet', 'VIP Lounge', 'Premium Merchandise', 'Personal Interaction', 'Professional Photo'],
    };

    categoryNames.forEach((name) => {
      const price = parseFloat(req.body[`cat_${name}_price`]);
      const capacity = parseInt(req.body[`cat_${name}_capacity`]);
      const existing = event.ticketCategories.find((c) => c.name === name);

      if (price >= 0 && capacity > 0) {
        if (existing) {
          existing.price = price;
          existing.capacity = Math.max(capacity, existing.sold);
          existing.isActive = true;
        } else {
          event.ticketCategories.push({
            name, label: categoryLabels[name], price, capacity,
            benefits: defaultBenefits[name], isActive: true,
          });
        }
      } else if (existing) {
        existing.isActive = false;
      }
    });

    if (req.file) {
      if (event.banner?.publicId) await deleteFile(event.banner.publicId).catch(() => {});
      event.banner = { url: req.file.path, publicId: req.file.filename };
    }

    await event.save();

    req.flash('success', `Event "${event.title}" updated successfully.`);
    res.redirect(`/admin/events/${event._id}/edit`);
  } catch (err) {
    next(err);
  }
};

exports.suspendEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) throw new AppError('Event not found.', 404);

    const wasSuspended = event.status === 'postponed' && event._suspendedByAdmin;
    const newStatus = wasSuspended ? 'published' : 'postponed';
    event.status = newStatus;
    event._suspendedByAdmin = !wasSuspended;
    await event.save();

    req.flash(
      'success',
      `Event "${event.title}" has been ${wasSuspended ? 'reinstated' : 'suspended'}.`
    );
    res.redirect('/admin/events');
  } catch (err) {
    next(err);
  }
};

exports.deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) throw new AppError('Event not found.', 404);

    // Only allow deleting draft or cancelled events
    if (!['draft', 'cancelled'].includes(event.status)) {
      req.flash(
        'error',
        'Only draft or cancelled events can be deleted. Suspend or cancel the event first.'
      );
      return res.redirect('/admin/events');
    }

    // Clean up banner from Cloudinary
    if (event.banner?.publicId) await deleteFile(event.banner.publicId).catch(() => {});
    for (const g of event.gallery || []) {
      if (g.publicId) await deleteFile(g.publicId).catch(() => {});
    }

    // Cancel any pending tickets
    const Ticket = require('../models/Ticket');
    await Ticket.updateMany({ event: event._id, status: 'pending_payment' }, { $set: { status: 'cancelled' } });

    await Event.findByIdAndDelete(event._id);

    req.flash('success', `Event "${event.title}" has been permanently deleted.`);
    res.redirect('/admin/events');
  } catch (err) {
    next(err);
  }
};
