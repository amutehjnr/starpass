'use strict';

const mongoose = require('mongoose');

// ─── FanClub ──────────────────────────────────────────────────────────────────
const fanClubSchema = new mongoose.Schema(
  {
    celebrity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Celebrity',
      required: true,
      unique: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, maxlength: 2000 },
    coverImage: { url: String, publicId: String },
    members: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joinedAt: { type: Date, default: Date.now },
        tier: { type: String, enum: ['basic', 'premium'], default: 'basic' },
      },
    ],
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    isActive: { type: Boolean, default: true },
    memberCount: { type: Number, default: 0 },
    subscriptionFee: { type: Number, default: 0 },
  },
  { timestamps: true }
);
fanClubSchema.index({ celebrity: 1 });
fanClubSchema.index({ 'members.user': 1 });

// ─── Post ─────────────────────────────────────────────────────────────────────
const postSchema = new mongoose.Schema(
  {
    fanClub: { type: mongoose.Schema.Types.ObjectId, ref: 'FanClub', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['text', 'image', 'video', 'announcement'], default: 'text' },
    content: { type: String, maxlength: 5000 },
    media: [{ url: String, publicId: String, type: { type: String, enum: ['image', 'video'] } }],
    isExclusive: { type: Boolean, default: false },
    isPinned: { type: Boolean, default: false },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        content: { type: String, maxlength: 1000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    isVisible: { type: Boolean, default: true },
  },
  { timestamps: true }
);
postSchema.index({ fanClub: 1, createdAt: -1 });
postSchema.index({ author: 1 });

// ─── Review ───────────────────────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema(
  {
    fan: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    celebrity: { type: mongoose.Schema.Types.ObjectId, ref: 'Celebrity', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, maxlength: 200 },
    content: { type: String, maxlength: 3000 },
    photos: [{ url: String, publicId: String }],
    isVerifiedAttendee: { type: Boolean, default: false },
    isApproved: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    isVisible: { type: Boolean, default: true },
    helpfulVotes: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);
reviewSchema.index({ event: 1, fan: 1 }, { unique: true });
reviewSchema.index({ celebrity: 1, rating: -1 });
reviewSchema.index({ isApproved: 1, isVisible: 1 });

// ─── Notification ─────────────────────────────────────────────────────────────
const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      required: true,
      enum: [
        'ticket_confirmed', 'ticket_cancelled',
        'payment_approved', 'payment_rejected',
        'event_reminder', 'event_cancelled', 'event_update',
        'fan_club_post', 'fan_club_joined',
        'review_approved',
        'system', 'announcement', 'celebrity_message',
      ],
    },
    title: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false },
    readAt: Date,
    link: String,
  },
  { timestamps: true }
);
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 }); // 30 days

// ─── AuditLog ─────────────────────────────────────────────────────────────────
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorRole: String,
    action: { type: String, required: true },
    resource: { type: String },
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: String,
    userAgent: String,
    status: { type: String, enum: ['success', 'failure'], default: 'success' },
  },
  { timestamps: true }
);
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // 90 days

const FanClub = mongoose.model('FanClub', fanClubSchema);
const Post = mongoose.model('Post', postSchema);
const Review = mongoose.model('Review', reviewSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = { FanClub, Post, Review, Notification, AuditLog };
