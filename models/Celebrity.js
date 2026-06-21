'use strict';

const mongoose = require('mongoose');

const socialLinkSchema = new mongoose.Schema({
  platform: { type: String, enum: ['instagram', 'twitter', 'youtube', 'tiktok', 'facebook', 'website', 'other'] },
  url: { type: String, trim: true },
}, { _id: false });

const galleryItemSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String },
  type: { type: String, enum: ['image', 'video'], default: 'image' },
  caption: { type: String, maxlength: 200 },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: true });

const celebritySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    stageName: {
      type: String,
      required: [true, 'Stage name is required'],
      trim: true,
      maxlength: [100, 'Stage name too long'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    category: {
      type: String,
      required: true,
      enum: ['actor', 'musician', 'athlete', 'comedian', 'influencer', 'model', 'gamer', 'chef', 'author', 'other'],
    },
    biography: {
      type: String,
      maxlength: [5000, 'Biography too long'],
    },
    shortBio: {
      type: String,
      maxlength: [300, 'Short bio too long'],
    },
    heroImage: {
      url: { type: String },
      publicId: { type: String },
    },
    profileImage: {
      url: { type: String },
      publicId: { type: String },
    },
    gallery: [galleryItemSchema],
    socialLinks: [socialLinkSchema],
    achievements: [{ type: String, maxlength: 200 }],
    tags: [{ type: String, lowercase: true }],
    isVerified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    applicationSource: {
      type: String,
      enum: ['self_applied', 'admin_invited', 'seeded'],
      default: 'self_applied',
    },
    verificationDocuments: [
      {
        type: { type: String, enum: ['government_id', 'proof_of_fame', 'social_media', 'other'], default: 'other' },
        url: String,
        publicId: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    rejectionReason: { type: String, maxlength: 500 },
    basePrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    totalRevenue: { type: Number, default: 0 },
    totalEvents: { type: Number, default: 0 },
    totalFans: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    totalReviews: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    fanClub: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FanClub',
      default: null,
    },
    metadata: {
      nationality: String,
      genres: [String],
      languages: [String],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
celebritySchema.index({ slug: 1 });
celebritySchema.index({ user: 1 });
celebritySchema.index({ category: 1 });
celebritySchema.index({ isVerified: 1, isActive: 1 });
celebritySchema.index({ isFeatured: 1 });
celebritySchema.index({ averageRating: -1 });
celebritySchema.index({ stageName: 'text', biography: 'text', tags: 'text' });

// ─── Pre-save: Slug ───────────────────────────────────────────────────────────
celebritySchema.pre('save', async function (next) {
  if (this.isModified('stageName') && !this.slug) {
    const base = this.stageName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
    let slug = base;
    let count = 1;
    while (await Celebrity.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${base}-${count++}`;
    }
    this.slug = slug;
  }
  next();
});

const Celebrity = mongoose.model('Celebrity', celebritySchema);
module.exports = Celebrity;
