'use strict';

const crypto = require('crypto');
const { User } = require('../models/User');
const Celebrity = require('../models/Celebrity');
const Invitation = require('../models/Invitation');
const { generateTokens, setTokenCookies } = require('../middleware/auth');
const { sendTemplateEmail } = require('../services/emailService');
const logger = require('../config/logger');

// ── Method 1: Self-Service Application ─────────────────────────────────────
exports.getApply = (req, res) => {
  res.render('public/apply', { title: 'Apply as a Celebrity – StarPass' });
};

exports.postApply = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password, confirmPassword, stageName, category, shortBio, biography } = req.body;

    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/apply');
    }

    const existing = await User.findOne({ email });
    if (existing) {
      req.flash('error', 'An account with this email already exists.');
      return res.redirect('/apply');
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: 'celebrity_manager',
      isActive: true,
    });

    const documents = (req.files || []).map((f) => ({ type: 'other', url: f.path, publicId: f.filename }));

    let celebrity;
    try {
      celebrity = await Celebrity.create({
        user: user._id,
        stageName,
        category,
        shortBio,
        biography,
        isVerified: false,
        applicationSource: 'self_applied',
        verificationDocuments: documents,
      });
    } catch (err) {
      // Roll back the orphaned user if the celebrity profile fails validation
      await User.findByIdAndDelete(user._id).catch(() => {});
      throw err;
    }

    setImmediate(async () => {
      try {
        await sendTemplateEmail('celebrityApplicationReceived', email, user, celebrity);
      } catch (e) {
        logger.error('Application email error:', e);
      }
    });

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);
    await User.findByIdAndUpdate(user._id, { $push: { refreshTokens: refreshToken } });
    setTokenCookies(res, accessToken, refreshToken);

    req.flash('success', "Application submitted! We'll review it and let you know once you're verified.");
    res.redirect('/celebrity/dashboard');
  } catch (err) {
    next(err);
  }
};

// ── Method 2: Invitation Claim ───────────────────────────────────────────────
exports.getClaim = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const invitation = await Invitation.findOne({ token: hashedToken, status: 'pending' }).select('+token');

    if (!invitation || invitation.expiresAt < new Date()) {
      req.flash('error', 'This invitation link is invalid or has expired.');
      return res.redirect('/');
    }

    res.render('public/claim', { title: 'Claim Your Celebrity Account – StarPass', invitation, token: req.params.token });
  } catch (err) {
    next(err);
  }
};

exports.postClaim = async (req, res, next) => {
  try {
    const { firstName, lastName, password, confirmPassword } = req.body;

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const invitation = await Invitation.findOne({ token: hashedToken, status: 'pending' }).select('+token');

    if (!invitation || invitation.expiresAt < new Date()) {
      req.flash('error', 'This invitation link is invalid or has expired.');
      return res.redirect('/');
    }

    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('back');
    }

    const existing = await User.findOne({ email: invitation.email });
    if (existing) {
      req.flash('error', 'An account with this email already exists. Please login instead.');
      return res.redirect('/auth/login');
    }

    const user = await User.create({
      firstName,
      lastName,
      email: invitation.email,
      password,
      role: 'celebrity',
      isActive: true,
      isEmailVerified: true,
    });

    let celebrity;
    try {
      celebrity = await Celebrity.create({
        user: user._id,
        stageName: invitation.stageName,
        category: invitation.category,
        isVerified: false,
        applicationSource: 'admin_invited',
      });
    } catch (err) {
      await User.findByIdAndDelete(user._id).catch(() => {});
      throw err;
    }

    invitation.status = 'claimed';
    invitation.celebrity = celebrity._id;
    invitation.claimedAt = new Date();
    await invitation.save();

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);
    await User.findByIdAndUpdate(user._id, { $push: { refreshTokens: refreshToken } });
    setTokenCookies(res, accessToken, refreshToken);

    req.flash('success', 'Account claimed! Complete your profile so our team can verify you.');
    res.redirect('/celebrity/profile');
  } catch (err) {
    next(err);
  }
};