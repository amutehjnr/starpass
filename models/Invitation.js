'use strict';

const mongoose = require('mongoose');

const invitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    stageName: {
      type: String,
      required: [true, 'Stage name is required'],
      trim: true,
      maxlength: 100,
    },
    category: {
      type: String,
      required: true,
      enum: ['actor', 'musician', 'athlete', 'comedian', 'influencer', 'model', 'gamer', 'chef', 'author', 'other'],
    },
    note: { type: String, maxlength: 500 },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    token: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ['pending', 'claimed', 'expired', 'revoked'],
      default: 'pending',
    },
    celebrity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Celebrity',
      default: null,
    },
    claimedAt: { type: Date, default: null },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  },
  { timestamps: true }
);

invitationSchema.index({ email: 1 });
invitationSchema.index({ status: 1, createdAt: -1 });

const Invitation = mongoose.model('Invitation', invitationSchema);
module.exports = Invitation;