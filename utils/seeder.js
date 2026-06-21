'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { User } = require('../models/User');
const Celebrity = require('../models/Celebrity');
const Event = require('../models/Event');
const { FanClub } = require('../models/index');
const logger = require('../config/logger');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB for seeding...');

    // ── Super Admin ────────────────────────────────────────────
    const existingSA = await User.findOne({ email: process.env.SUPER_ADMIN_EMAIL });
    if (!existingSA) {
      await User.create({
        firstName: 'Super',
        lastName: 'Toff',
        email: process.env.SUPER_ADMIN_EMAIL || 'mustaeenms@gmail.com',
        password: process.env.SUPER_ADMIN_PASSWORD || 'Mustaeen@121',
        role: 'super_admin',
        isActive: true,
        isEmailVerified: true,
      });
      logger.info('Super admin created.');
    }

    // ── Admin ──────────────────────────────────────────────────
    let adminUser = await User.findOne({ email: 'emiliachris74@gmail.com' });
    if (!adminUser) {
      adminUser = await User.create({
        firstName: 'Admin', lastName: 'User',
        email: 'emiliachris74@gmail.com', password: 'Mustaeen@121',
        role: 'admin', isActive: true, isEmailVerified: true,
      });
      logger.info('Admin user created.');
    }

    // ── Demo Fan ───────────────────────────────────────────────
    let fanUser = await User.findOne({ email: 'fan@demo.com' });
    if (!fanUser) {
      fanUser = await User.create({
        firstName: 'Alex', lastName: 'Fan',
        email: 'fan@demo.com', password: 'Demo@1234',
        role: 'fan', isActive: true, isEmailVerified: true,
        country: 'United States',
      });
      logger.info('Fan user created.');
    }

    // ── Demo Celebrity User ────────────────────────────────────
    let celebUser = await User.findOne({ email: 'celebrity@demo.com' });
    if (!celebUser) {
      celebUser = await User.create({
        firstName: 'Taylor', lastName: 'Star',
        email: 'celebrity@demo.com', password: 'Demo@1234',
        role: 'celebrity', isActive: true, isEmailVerified: true,
      });
      logger.info('Celebrity user created.');
    }

    // ── Celebrity Profile ──────────────────────────────────────
    let celebrity = await Celebrity.findOne({ user: celebUser._id });
    if (!celebrity) {
      celebrity = await Celebrity.create({
        user: celebUser._id,
        stageName: 'Taylor Star',
        slug: 'taylor-star',
        category: 'musician',
        biography: 'Taylor Star is a multi-platinum recording artist known for chart-topping hits and electrifying live performances. With over 10 years in the industry, Taylor has sold out arenas worldwide.',
        shortBio: 'Multi-platinum musician & performer.',
        isVerified: true,
        isFeatured: true,
        isActive: true,
        verifiedAt: new Date(),
        basePrice: 99,
        averageRating: 4.8,
        totalReviews: 124,
        totalFans: 50000,
        tags: ['pop', 'music', 'performer'],
        metadata: { nationality: 'American', genres: ['Pop', 'R&B'] },
        socialLinks: [
          { platform: 'instagram', url: 'https://instagram.com/taylorstar' },
          { platform: 'twitter', url: 'https://twitter.com/taylorstar' },
        ],
      });
      logger.info('Celebrity profile created.');
    }

    // ── Fan Club ───────────────────────────────────────────────
    let fanClub = await FanClub.findOne({ celebrity: celebrity._id });
    if (!fanClub) {
      fanClub = await FanClub.create({
        celebrity: celebrity._id,
        name: 'Star Nation',
        description: 'The official fan club of Taylor Star. Get exclusive content, early access to tickets, and connect with fellow fans!',
        memberCount: 0,
        isActive: true,
      });
      await Celebrity.findByIdAndUpdate(celebrity._id, { fanClub: fanClub._id });
      logger.info('Fan club created.');
    }

    // ── Demo Event ─────────────────────────────────────────────
    const existingEvent = await Event.findOne({ celebrity: celebrity._id });
    if (!existingEvent) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const endDate = new Date(futureDate);
      endDate.setHours(endDate.getHours() + 3);

      await Event.create({
        title: 'Taylor Star Exclusive Meet & Greet – Los Angeles',
        description: 'Join Taylor Star for an exclusive meet & greet experience in Los Angeles! This intimate event offers fans the rare opportunity to meet Taylor in person, get an autograph, and take professional photos together.',
        shortDescription: 'Exclusive meet & greet with Taylor Star in Los Angeles.',
        type: 'physical',
        category: 'meet_greet',
        celebrity: celebrity._id,
        organizer: adminUser._id,
        venue: {
          name: 'The Beverly Hilton',
          address: '9876 Wilshire Blvd',
          city: 'Beverly Hills',
          country: 'USA',
        },
        startDate: futureDate,
        endDate: endDate,
        timezone: 'America/Los_Angeles',
        ticketCategories: [
          { name: 'general',     label: 'General Admission', price: 49,  capacity: 200, benefits: ['Event Access'], isActive: true, sortOrder: 1 },
          { name: 'premium',     label: 'Premium',           price: 99,  capacity: 100, benefits: ['Event Access','Priority Entry','Better Seating'], isActive: true, sortOrder: 2 },
          { name: 'vip',         label: 'VIP',               price: 199, capacity: 50,  benefits: ['Event Access','Meet Celebrity','Professional Photo','Autograph Session','Front Row Access'], isActive: true, sortOrder: 3 },
          { name: 'platinum_vip',label: 'Platinum VIP',      price: 399, capacity: 20,  benefits: ['Private Meet & Greet','VIP Lounge','Premium Merchandise','Personal Interaction','Professional Photo'], isActive: true, sortOrder: 4 },
        ],
        rulesAndGuidelines: [
          'No professional cameras or video equipment.',
          'One item per fan for autographs.',
          'Be respectful to the celebrity and staff at all times.',
          'Tickets are non-transferable and non-refundable.',
        ],
        tags: ['meet-greet', 'music', 'los-angeles'],
        status: 'published',
        isFeatured: true,
        publishedAt: new Date(),
      });
      logger.info('Demo event created.');
    }

    logger.info('✅ Seeding complete!');
    logger.info('Demo accounts:');
    logger.info('  Super Admin: mustaeenms@gmail.com / SuperAdmin@123!');
    logger.info('  Admin:       emiliachris74@gmail.com / Demo@1234');
    logger.info('  Fan:         fan@demo.com / Demo@1234');
    logger.info('  Celebrity:   celebrity@demo.com / Demo@1234');

    process.exit(0);
  } catch (err) {
    logger.error('Seeding failed:', err);
    process.exit(1);
  }
};

seed();
