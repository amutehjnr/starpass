'use strict';

const mongoose = require('mongoose');

const giftCardSchema = new mongoose.Schema(
  {
    fan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    cardType: {
      type: String,
      required: true,
      enum: ['amazon', 'apple', 'steam', 'google_play', 'visa', 'mastercard', 'other'],
    },
    declaredValue: {
      type: Number,
      required: [true, 'Card value is required'],
      min: [1, 'Value must be positive'],
    },
    currency: { type: String, default: 'USD' },
    cardNumber: {
      type: String,
      trim: true,
      maxlength: [30],
    },
    pin: {
      type: String,
      trim: true,
      maxlength: [20],
      select: false,
    },
    images: {
      front: {
        url: String,
        publicId: String,
      },
      back: {
        url: String,
        publicId: String,
      },
      receipt: {
        url: String,
        publicId: String,
      },
    },
    status: {
      type: String,
      enum: ['pending', 'under_review', 'approved', 'rejected', 'expired'],
      default: 'pending',
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 500 },
    approvalNotes: { type: String, maxlength: 500 },
    fraudFlags: [
      {
        flag: String,
        detectedAt: { type: Date, default: Date.now },
        severity: { type: String, enum: ['low', 'medium', 'high'] },
      },
    ],
    isFlagged: { type: Boolean, default: false },
    ipAddress: { type: String, select: false },
    userAgent: { type: String, select: false },
    submittedAt: { type: Date, default: Date.now },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h review window
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
giftCardSchema.index({ fan: 1, status: 1 });
giftCardSchema.index({ status: 1, createdAt: -1 });
giftCardSchema.index({ ticket: 1 });
giftCardSchema.index({ isFlagged: 1 });
giftCardSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const GiftCard = mongoose.model('GiftCard', giftCardSchema);
module.exports = GiftCard;
