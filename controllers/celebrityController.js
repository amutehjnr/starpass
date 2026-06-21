'use strict';

const Celebrity = require('../models/Celebrity');
const Event = require('../models/Event');
const Ticket = require('../models/Ticket');
const { FanClub, Post } = require('../models/index');
const { AppError } = require('../middleware/errorHandler');

// ── Dashboard ─────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    if (!celebrity) {
      req.flash('error', 'Celebrity profile not found. Please contact support.');
      return res.redirect('/');
    }

    const now = new Date();
    const [upcomingEvents, recentTickets, revenueData] = await Promise.all([
      Event.find({ celebrity: celebrity._id, status: 'published', startDate: { $gt: now } })
        .select('title startDate totalSold totalCapacity banner')
        .sort({ startDate: 1 })
        .limit(5),
      Ticket.find({ celebrity: celebrity._id, status: 'active' })
        .populate({ path: 'fan', select: 'firstName lastName avatar' })
        .populate({ path: 'event', select: 'title' })
        .sort({ createdAt: -1 })
        .limit(10),
      Event.aggregate([
        { $match: { celebrity: celebrity._id } },
        { $group: { _id: null, totalRevenue: { $sum: '$revenue' }, totalEvents: { $sum: 1 }, totalSold: { $sum: '$totalSold' } } },
      ]),
    ]);

    const stats = revenueData[0] || { totalRevenue: 0, totalEvents: 0, totalSold: 0 };

    res.render('celebrity/dashboard', {
      title: 'Dashboard – StarPass',
      celebrity,
      upcomingEvents,
      recentTickets,
      stats: { ...stats, totalFans: celebrity.totalFans, averageRating: celebrity.averageRating },
    });
  } catch (err) {
    next(err);
  }
};

// ── Profile ───────────────────────────────────────────────────────────────────
exports.getProfile = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    res.render('celebrity/profile', { title: 'My Profile – StarPass', celebrity });
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { stageName, category, biography, shortBio, achievements, tags } = req.body;
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    if (!celebrity) throw new AppError('Celebrity profile not found.', 404);

    celebrity.stageName = stageName || celebrity.stageName;
    celebrity.category = category || celebrity.category;
    celebrity.biography = biography;
    celebrity.shortBio = shortBio;
    celebrity.achievements = achievements ? achievements.split('\n').filter(Boolean) : celebrity.achievements;
    celebrity.tags = tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : celebrity.tags;

    if (req.files?.profileImage?.[0]) {
      celebrity.profileImage = { url: req.files.profileImage[0].path, publicId: req.files.profileImage[0].filename };
    }
    if (req.files?.heroImage?.[0]) {
      celebrity.heroImage = { url: req.files.heroImage[0].path, publicId: req.files.heroImage[0].filename };
    }

    await celebrity.save();
    req.flash('success', 'Profile updated successfully.');
    res.redirect('/celebrity/profile');
  } catch (err) {
    next(err);
  }
};

// ── Events ────────────────────────────────────────────────────────────────────
exports.getEvents = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    const { status, page = 1 } = req.query;
    const limit = 10;
    const skip = (page - 1) * limit;
    const filter = { celebrity: celebrity._id };
    if (status) filter.status = status;

    const [events, total] = await Promise.all([
      Event.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Event.countDocuments(filter),
    ]);

    res.render('celebrity/events', {
      title: 'My Events – StarPass',
      events,
      celebrity,
      currentStatus: status || 'all',
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getCreateEvent = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    res.render('celebrity/create-event', { title: 'Create Event – StarPass', celebrity });
  } catch (err) {
    next(err);
  }
};

exports.postCreateEvent = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    if (!celebrity?.isVerified) throw new AppError('Your profile must be verified to create events.', 403);

    const {
      title, description, shortDescription, type, category,
      startDate, endDate, timezone,
      venueName, venueAddress, venueCity, venueCountry, virtualLink,
      rulesAndGuidelines, tags,
    } = req.body;

    // Parse ticket categories from form
    const ticketCategories = [];
    const categoryNames = ['general', 'premium', 'vip', 'platinum_vip'];
    const categoryLabels = { general: 'General Admission', premium: 'Premium', vip: 'VIP', platinum_vip: 'Platinum VIP' };
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
          name,
          label: categoryLabels[name],
          price,
          capacity,
          benefits: defaultBenefits[name],
          isActive: true,
        });
      }
    });

    const event = new Event({
      title,
      description,
      shortDescription,
      type,
      category,
      celebrity: celebrity._id,
      organizer: req.user._id,
      venue: {
        name: venueName,
        address: venueAddress,
        city: venueCity,
        country: venueCountry,
        virtualLink,
      },
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      timezone,
      ticketCategories,
      rulesAndGuidelines: rulesAndGuidelines ? rulesAndGuidelines.split('\n').filter(Boolean) : [],
      tags: tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : [],
      status: 'draft',
    });

    if (req.file) {
      event.banner = { url: req.file.path, publicId: req.file.filename };
    }

    await event.save();
    req.flash('success', 'Event created successfully. Submit for review to publish.');
    res.redirect(`/celebrity/events/${event._id}/edit`);
  } catch (err) {
    next(err);
  }
};

exports.getEditEvent = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    const event = await Event.findOne({ _id: req.params.id, celebrity: celebrity._id });
    if (!event) throw new AppError('Event not found.', 404);

    res.render('celebrity/edit-event', { title: `Edit – ${event.title}`, event, celebrity });
  } catch (err) {
    next(err);
  }
};

exports.postPublishEvent = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    const event = await Event.findOne({ _id: req.params.id, celebrity: celebrity._id });
    if (!event) throw new AppError('Event not found.', 404);
    if (event.status !== 'draft') throw new AppError('Only draft events can be published.', 400);

    event.status = 'published';
    event.publishedAt = new Date();
    await event.save();

    req.flash('success', 'Event published successfully!');
    res.redirect('/celebrity/events');
  } catch (err) {
    next(err);
  }
};

exports.postCancelEvent = async (req, res, next) => {
  try {
    const { cancelReason } = req.body;
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    const event = await Event.findOne({ _id: req.params.id, celebrity: celebrity._id });
    if (!event) throw new AppError('Event not found.', 404);

    event.status = 'cancelled';
    event.cancelledAt = new Date();
    event.cancelReason = cancelReason;
    await event.save();

    // TODO: Notify ticket holders
    req.flash('success', 'Event cancelled. Ticket holders will be notified.');
    res.redirect('/celebrity/events');
  } catch (err) {
    next(err);
  }
};

exports.postUpdateEvent = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    const event = await Event.findOne({ _id: req.params.id, celebrity: celebrity._id });
    if (!event) throw new AppError('Event not found.', 404);
    if (['cancelled', 'completed'].includes(event.status)) {
      throw new AppError('Cancelled or completed events cannot be edited.', 400);
    }

    const {
      title, description, shortDescription, type, category,
      startDate, endDate, timezone,
      venueName, venueAddress, venueCity, venueCountry, virtualLink,
      rulesAndGuidelines, tags,
    } = req.body;

    event.title = title || event.title;
    event.description = description || event.description;
    event.shortDescription = shortDescription;
    event.type = type || event.type;
    event.category = category || event.category;

    const existingVenue = event.venue || {};
    event.venue = {
      coordinates: existingVenue.coordinates,
      virtualPlatform: existingVenue.virtualPlatform,
      name: venueName,
      address: venueAddress,
      city: venueCity,
      country: venueCountry,
      virtualLink,
    };

    if (startDate) event.startDate = new Date(startDate);
    if (endDate) event.endDate = new Date(endDate);
    event.timezone = timezone || event.timezone;
    event.rulesAndGuidelines = rulesAndGuidelines ? rulesAndGuidelines.split('\n').filter(Boolean) : event.rulesAndGuidelines;
    event.tags = tags ? tags.split(',').map((t) => t.trim().toLowerCase()) : event.tags;

    // Update / add ticket categories (capacity can never drop below tickets already sold)
    const categoryNames = ['general', 'premium', 'vip', 'platinum_vip'];
    const categoryLabels = { general: 'General Admission', premium: 'Premium', vip: 'VIP', platinum_vip: 'Platinum VIP' };
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
        existing.isActive = false; // deactivate, but keep history of sold tickets
      }
    });

    if (req.file) {
      event.banner = { url: req.file.path, publicId: req.file.filename };
    }

    await event.save();
    req.flash('success', 'Event updated successfully.');
    res.redirect(`/celebrity/events/${event._id}/edit`);
  } catch (err) {
    next(err);
  }
};

// ── Fan Club ──────────────────────────────────────────────────────────────────
exports.getFanClub = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id }).populate('fanClub');
    let fanClub = celebrity?.fanClub;

    let posts = [];
    if (fanClub) {
      posts = await Post.find({ fanClub: fanClub._id })
        .populate({ path: 'author', select: 'firstName lastName avatar role' })
        .sort({ isPinned: -1, createdAt: -1 })
        .limit(20);
    }

    res.render('celebrity/fan-club', { title: 'Fan Club – StarPass', celebrity, fanClub, posts });
  } catch (err) {
    next(err);
  }
};

exports.createFanClub = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    if (!celebrity) throw new AppError('Celebrity profile not found.', 404);
    if (celebrity.fanClub) throw new AppError('Fan club already exists.', 409);

    const fanClub = await FanClub.create({
      celebrity: celebrity._id,
      name,
      description,
    });

    await Celebrity.findByIdAndUpdate(celebrity._id, { fanClub: fanClub._id });

    req.flash('success', 'Fan club created!');
    res.redirect('/celebrity/fan-club');
  } catch (err) {
    next(err);
  }
};

exports.postFanClubPost = async (req, res, next) => {
  try {
    const { content, type, isExclusive } = req.body;
    const celebrity = await Celebrity.findOne({ user: req.user._id });
    if (!celebrity?.fanClub) throw new AppError('Fan club not found.', 404);

    const media = [];
    if (req.files?.length) {
      req.files.forEach((f) => media.push({ url: f.path, publicId: f.filename, type: 'image' }));
    }

    await Post.create({
      fanClub: celebrity.fanClub,
      author: req.user._id,
      type: type || 'text',
      content,
      media,
      isExclusive: isExclusive === 'on',
    });

    req.flash('success', 'Post published!');
    res.redirect('/celebrity/fan-club');
  } catch (err) {
    next(err);
  }
};

// ── Analytics ─────────────────────────────────────────────────────────────────
exports.getAnalytics = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ user: req.user._id });

    const [eventStats, ticketsByCategory, monthlyRevenue] = await Promise.all([
      Event.find({ celebrity: celebrity._id })
        .select('title startDate totalSold totalCapacity revenue status')
        .sort({ startDate: -1 })
        .limit(10),
      Ticket.aggregate([
        { $match: { celebrity: celebrity._id, status: 'active' } },
        { $group: { _id: '$ticketCategory', count: { $sum: 1 }, revenue: { $sum: '$price' } } },
      ]),
      Ticket.aggregate([
        { $match: { celebrity: celebrity._id, status: 'active', createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            revenue: { $sum: '$price' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    res.render('celebrity/analytics', {
      title: 'Analytics – StarPass',
      celebrity,
      eventStats,
      ticketsByCategory,
      monthlyRevenue,
    });
  } catch (err) {
    next(err);
  }
};
