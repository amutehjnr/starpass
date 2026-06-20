'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const ticketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      unique: true,
    },
    fan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
    },
    celebrity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Celebrity',
      required: true,
    },
    ticketCategory: {
      type: String,
      enum: ['general', 'premium', 'vip', 'platinum_vip'],
      required: true,
    },
    ticketLabel: String,
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: { type: String, default: 'USD' },
    status: {
      type: String,
      enum: ['pending_payment', 'active', 'used', 'cancelled', 'refunded', 'expired'],
      default: 'pending_payment',
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GiftCard',
      default: null,
    },
    qrCode: {
      data: String,       // QR code data URL
      verificationCode: String,
    },
    checkedIn: { type: Boolean, default: false },
    checkedInAt: { type: Date },
    checkedInBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pdfUrl: { type: String, default: null },
    notes: { type: String, maxlength: 500 },
    isTransferable: { type: Boolean, default: false },
    transferredTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    transferredAt: Date,
    expiresAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────
ticketSchema.index({ ticketNumber: 1 });
ticketSchema.index({ fan: 1, status: 1 });
ticketSchema.index({ event: 1, status: 1 });
ticketSchema.index({ 'qrCode.verificationCode': 1 });

// ─── Pre-save: Generate Ticket Number ─────────────────────────────────────────
ticketSchema.pre('save', function (next) {
  if (!this.ticketNumber) {
    const prefix = 'SP';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substr(2, 5).toUpperCase();
    this.ticketNumber = `${prefix}-${timestamp}-${random}`;
  }
  if (!this.qrCode?.verificationCode) {
    this.qrCode = {
      ...this.qrCode,
      verificationCode: uuidv4().replace(/-/g, '').toUpperCase(),
    };
  }
  next();
});

const Ticket = mongoose.model('Ticket', ticketSchema);
module.exports = Ticket;
