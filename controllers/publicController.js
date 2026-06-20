'use strict';

const Celebrity = require('../models/Celebrity');
const Event = require('../models/Event');
const { FanClub, Review } = require('../models/index');

// ── Homepage ──────────────────────────────────────────────────────────────────
exports.getHomepage = async (req, res, next) => {
  try {
    const [featuredCelebrities, upcomingEvents, featuredEvents, stats] = await Promise.all([
      Celebrity.find({ isVerified: true, isFeatured: true, isActive: true })
        .select('stageName slug category profileImage heroImage averageRating totalReviews isVerified')
        .limit(6),
      Event.find({ status: 'published', startDate: { $gt: new Date() } })
        .populate({ path: 'celebrity', select: 'stageName profileImage isVerified' })
        .select('title slug banner startDate venue type category totalSold totalCapacity')
        .sort({ startDate: 1 })
        .limit(8),
      Event.find({ status: 'published', isFeatured: true, startDate: { $gt: new Date() } })
        .populate({ path: 'celebrity', select: 'stageName profileImage isVerified' })
        .select('title slug banner startDate venue type ticketCategories')
        .sort({ startDate: 1 })
        .limit(3),
      Promise.all([
        Celebrity.countDocuments({ isVerified: true, isActive: true }),
        Event.countDocuments({ status: 'published' }),
        FanClub.countDocuments({ isActive: true }),
      ]),
    ]);

    res.render('public/home', {
      title: 'StarPass – Celebrity Meet & Greet Platform',
      featuredCelebrities,
      upcomingEvents,
      featuredEvents,
      stats: { celebrities: stats[0], events: stats[1], fanClubs: stats[2] },
    });
  } catch (err) {
    next(err);
  }
};

// ── Celebrities ───────────────────────────────────────────────────────────────
exports.getCelebrities = async (req, res, next) => {
  try {
    const { search, category, sort = 'featured', page = 1 } = req.query;
    const limit = 12;
    const skip = (page - 1) * limit;

    const filter = { isActive: true, isVerified: true };
    if (category) filter.category = category;
    if (search) filter.$text = { $search: search };

    const sortOptions = {
      featured: { isFeatured: -1, averageRating: -1 },
      rating: { averageRating: -1 },
      newest: { createdAt: -1 },
      popular: { totalFans: -1 },
    };

    const [celebrities, total] = await Promise.all([
      Celebrity.find(filter)
        .select('stageName slug category profileImage heroImage averageRating totalReviews isVerified totalFans isFeatured')
        .sort(sortOptions[sort] || sortOptions.featured)
        .skip(skip)
        .limit(limit),
      Celebrity.countDocuments(filter),
    ]);

    const categories = ['actor', 'musician', 'athlete', 'comedian', 'influencer', 'model', 'gamer', 'chef', 'author', 'other'];

    res.render('public/celebrities', {
      title: 'Browse Celebrities – StarPass',
      celebrities,
      categories,
      filters: { search, category, sort },
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getCelebrityDetail = async (req, res, next) => {
  try {
    const celebrity = await Celebrity.findOne({ slug: req.params.slug, isActive: true })
      .populate({ path: 'user', select: 'firstName lastName email' })
      .populate({ path: 'fanClub', select: 'name memberCount coverImage' });

    if (!celebrity) {
      req.flash('error', 'Celebrity not found.');
      return res.redirect('/celebrities');
    }

    // Increment view count (non-blocking)
    Celebrity.findByIdAndUpdate(celebrity._id, { $inc: { viewCount: 1 } }).exec();

    const [upcomingEvents, reviews, isFanClubMember] = await Promise.all([
      Event.find({ celebrity: celebrity._id, status: 'published', startDate: { $gt: new Date() } })
        .select('title slug banner startDate venue type ticketCategories totalSold totalCapacity')
        .sort({ startDate: 1 })
        .limit(6),
      Review.find({ celebrity: celebrity._id, isApproved: true, isVisible: true })
        .populate({ path: 'fan', select: 'firstName lastName avatar' })
        .sort({ createdAt: -1 })
        .limit(10),
      req.user && celebrity.fanClub
        ? FanClub.exists({ _id: celebrity.fanClub, 'members.user': req.user._id })
        : Promise.resolve(false),
    ]);

    res.render('public/celebrity-detail', {
      title: `${celebrity.stageName} – StarPass`,
      celebrity,
      upcomingEvents,
      reviews,
      isFanClubMember: !!isFanClubMember,
    });
  } catch (err) {
    next(err);
  }
};

// ── Events ─────────────────────────────────────────────────────────────────────
exports.getEvents = async (req, res, next) => {
  try {
    const { search, type, category, sort = 'soonest', page = 1 } = req.query;
    const limit = 12;
    const skip = (page - 1) * limit;

    const filter = { status: 'published', startDate: { $gt: new Date() } };
    if (type) filter.type = type;
    if (category) filter.category = category;
    if (search) filter.$text = { $search: search };

    const sortOptions = {
      soonest: { startDate: 1 },
      featured: { isFeatured: -1, startDate: 1 },
      newest: { createdAt: -1 },
    };

    const [events, total] = await Promise.all([
      Event.find(filter)
        .populate({ path: 'celebrity', select: 'stageName profileImage isVerified' })
        .select('title slug banner startDate venue type category ticketCategories totalSold totalCapacity isFeatured')
        .sort(sortOptions[sort] || sortOptions.soonest)
        .skip(skip)
        .limit(limit),
      Event.countDocuments(filter),
    ]);

    res.render('public/events', {
      title: 'Browse Events – StarPass',
      events,
      filters: { search, type, category, sort },
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

exports.getEventDetail = async (req, res, next) => {
  try {
    const event = await Event.findOne({ slug: req.params.slug, status: 'published' })
      .populate({
        path: 'celebrity',
        select: 'stageName slug profileImage heroImage isVerified category averageRating totalReviews fanClub',
        populate: { path: 'fanClub', select: 'name memberCount' },
      });

    if (!event) {
      req.flash('error', 'Event not found.');
      return res.redirect('/events');
    }

    Event.findByIdAndUpdate(event._id, { $inc: { viewCount: 1 } }).exec();

    const [reviews, userTicket] = await Promise.all([
      Review.find({ event: event._id, isApproved: true, isVisible: true })
        .populate({ path: 'fan', select: 'firstName lastName avatar' })
        .sort({ createdAt: -1 })
        .limit(8),
      req.user
        ? Ticket.findOne({ fan: req.user._id, event: event._id, status: { $nin: ['cancelled', 'refunded'] } })
        : Promise.resolve(null),
    ]);

    const Ticket = require('../models/Ticket');

    res.render('public/event-detail', {
      title: `${event.title} – StarPass`,
      event,
      reviews,
      userTicket,
    });
  } catch (err) {
    next(err);
  }
};

// ── Fan Clubs Public ──────────────────────────────────────────────────────────
exports.getFanClubs = async (req, res, next) => {
  try {
    const { page = 1 } = req.query;
    const limit = 12;
    const skip = (page - 1) * limit;

    const [fanClubs, total] = await Promise.all([
      FanClub.find({ isActive: true })
        .populate({ path: 'celebrity', select: 'stageName slug profileImage isVerified category' })
        .select('name description coverImage memberCount subscriptionFee')
        .sort({ memberCount: -1 })
        .skip(skip)
        .limit(limit),
      FanClub.countDocuments({ isActive: true }),
    ]);

    res.render('public/fan-clubs', {
      title: 'Fan Clubs – StarPass',
      fanClubs,
      pagination: { page: parseInt(page), limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ── Static Pages ─────────────────────────────────────────────────────────────
exports.getAbout = (req, res) => res.render('public/about', { title: 'About – StarPass' });
exports.getContact = (req, res) => res.render('public/contact', { title: 'Contact – StarPass' });
exports.getFAQ = (req, res) => res.render('public/faq', { title: 'FAQ – StarPass' });
