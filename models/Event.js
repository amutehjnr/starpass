'use strict';

const mongoose = require('mongoose');

const ticketCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: ['general', 'premium', 'vip', 'platinum_vip'],
  },
  label: { type: String, required: true },
  description: String,
  price: { type: Number, required: true, min: 0 },
  capacity: { type: Number, required: true, min: 1 },
  sold: { type: Number, default: 0 },
  benefits: [String],
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { _id: true });

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
      maxlength: [200, 'Title too long'],
    },
    slug: { type: String, unique: true, lowercase: true },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: [10000, 'Description too long'],
    },
    shortDescription: { type: String, maxlength: [500] },
    type: {
      type: String,
      required: true,
      enum: ['physical', 'virtual', 'hybrid'],
    },
    category: {
      type: String,
      enum: ['meet_greet', 'fan_conference', 'autograph_session', 'photo_session', 'vip_experience', 'birthday_shoutout', 'concert', 'other'],
      default: 'meet_greet',
    },
    celebrity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Celebrity',
      required: true,
    },
    organizer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    banner: {
      url: String,
      publicId: String,
    },
    gallery: [
      {
        url: String,
        publicId: String,
        caption: String,
      },
    ],
    venue: {
      name: String,
      address: String,
      city: String,
      country: String,
      coordinates: {
        lat: Number,
        lng: Number,
      },
      virtualLink: String,
      virtualPlatform: {
        type: String,
        enum: ['zoom', 'meet', 'teams', 'custom', null],
        default: null,
      },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    timezone: { type: String, default: 'UTC' },
    ticketCategories: [ticketCategorySchema],
    totalCapacity: { type: Number, default: 0 },
    totalSold: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'published', 'cancelled', 'completed', 'postponed'],
      default: 'draft',
    },
    rulesAndGuidelines: [String],
    tags: [{ type: String, lowercase: true }],
    isFeatured: { type: Boolean, default: false },
    isEarlyAccess: { type: Boolean, default: false },
    earlyAccessFanClubOnly: { type: Boolean, default: false },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    publishedAt: Date,
    cancelledAt: Date,
    cancelReason: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
eventSchema.index({ slug: 1 });
eventSchema.index({ celebrity: 1, status: 1 });
eventSchema.index({ startDate: 1 });
eventSchema.index({ status: 1, isFeatured: 1 });
eventSchema.index({ title: 'text', description: 'text', tags: 'text' });

// ─── Virtuals ─────────────────────────────────────────────────────────────────
eventSchema.virtual('isUpcoming').get(function () {
  return this.startDate > new Date() && this.status === 'published';
});

eventSchema.virtual('isSoldOut').get(function () {
  return this.totalCapacity > 0 && this.totalSold >= this.totalCapacity;
});

eventSchema.virtual('availableTickets').get(function () {
  return Math.max(0, this.totalCapacity - this.totalSold);
});

// ─── Pre-save: Slug & Capacity ─────────────────────────────────────────────────
eventSchema.pre('save', async function (next) {
  if (this.isModified('title') && !this.slug) {
    const base = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
    let slug = `${base}-${Date.now()}`;
    this.slug = slug;
  }

  if (this.isModified('ticketCategories')) {
    this.totalCapacity = this.ticketCategories.reduce((sum, cat) => sum + (cat.capacity || 0), 0);
    this.totalSold = this.ticketCategories.reduce((sum, cat) => sum + (cat.sold || 0), 0);
  }

  next();
});

const Event = mongoose.model('Event', eventSchema);
module.exports = Event;
