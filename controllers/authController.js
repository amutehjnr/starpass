'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../models/User');
const { sendTemplateEmail } = require('../services/emailService');
const { generateTokens, setTokenCookies, clearTokenCookies } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');

// GET /auth/login
exports.getLogin = (req, res) => {
  res.render('auth/login', { title: 'Login – StarPass', redirect: req.query.redirect || null });
};

// GET /auth/register
exports.getRegister = (req, res) => {
  res.render('auth/register', { title: 'Create Account – StarPass' });
};

// POST /auth/register
exports.postRegister = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      req.flash('error', 'An account with this email already exists.');
      return res.redirect('/auth/register');
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      emailVerificationToken: crypto.createHash('sha256').update(verificationToken).digest('hex'),
      emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000,
    });

    // Send welcome + verification email (non-blocking)
    setImmediate(async () => {
      try {
        await sendTemplateEmail('welcome', email, user);
        await sendTemplateEmail('emailVerification', email, user, verificationToken);
      } catch (e) {
        logger.error('Registration email error:', e);
      }
    });

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);
    await User.findByIdAndUpdate(user._id, { $push: { refreshTokens: refreshToken } });
    setTokenCookies(res, accessToken, refreshToken);

    req.flash('success', `Welcome, ${user.firstName}! Your account has been created.`);
    res.redirect('/fan/dashboard');
  } catch (err) {
    next(err);
  }
};

// POST /auth/login
exports.postLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil +refreshTokens');
    if (!user) {
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/auth/login');
    }

    if (user.isLocked) {
      req.flash('error', 'Account temporarily locked due to too many failed login attempts. Try again in 2 hours.');
      return res.redirect('/auth/login');
    }

    if (!user.isActive) {
      req.flash('error', 'Your account has been deactivated. Please contact support.');
      return res.redirect('/auth/login');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      req.flash('error', 'Invalid email or password.');
      return res.redirect('/auth/login');
    }

    await user.resetLoginAttempts();
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date(), lastLoginIp: req.ip });

    const { accessToken, refreshToken } = generateTokens(user._id, user.role);
    // Rotate: keep max 5 refresh tokens
    const tokens = user.refreshTokens || [];
    if (tokens.length >= 5) tokens.shift();
    tokens.push(refreshToken);
    await User.findByIdAndUpdate(user._id, { $set: { refreshTokens: tokens } });
    setTokenCookies(res, accessToken, refreshToken);

    const roleRedirects = {
      fan: '/fan/dashboard',
      celebrity: '/celebrity/dashboard',
      celebrity_manager: '/celebrity/dashboard',
      event_organizer: '/celebrity/dashboard',
      moderator: '/admin/dashboard',
      admin: '/admin/dashboard',
      super_admin: '/admin/dashboard',
    };

    const redirect = req.query.redirect || req.body.redirect || roleRedirects[user.role] || '/';
    // Prevent open redirect
    const safeRedirect = redirect.startsWith('/') ? redirect : roleRedirects[user.role];

    req.flash('success', `Welcome back, ${user.firstName}!`);
    res.redirect(safeRedirect);
  } catch (err) {
    next(err);
  }
};

// POST /auth/logout
exports.logout = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.sp_refresh;
    if (refreshToken && req.user) {
      await User.findByIdAndUpdate(req.user._id, { $pull: { refreshTokens: refreshToken } });
    }
    clearTokenCookies(res);
    req.flash('success', 'You have been logged out.');
    res.redirect('/');
  } catch (err) {
    next(err);
  }
};

// POST /auth/refresh
exports.refreshToken = async (req, res, next) => {
  try {
    const token = req.cookies?.sp_refresh;
    if (!token) return res.status(401).json({ success: false, message: 'No refresh token.' });

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refreshTokens');
    if (!user || !user.refreshTokens?.includes(token)) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    const { accessToken, refreshToken: newRefresh } = generateTokens(user._id, user.role);
    const tokens = user.refreshTokens.filter((t) => t !== token);
    tokens.push(newRefresh);
    await User.findByIdAndUpdate(user._id, { $set: { refreshTokens: tokens } });
    setTokenCookies(res, accessToken, newRefresh);

    res.json({ success: true });
  } catch (err) {
    clearTokenCookies(res);
    res.status(401).json({ success: false, message: 'Session expired. Please login again.' });
  }
};

// GET /auth/forgot-password
exports.getForgotPassword = (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot Password – StarPass' });
};

// POST /auth/forgot-password
exports.postForgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    // Always show success to prevent email enumeration
    if (!user) {
      req.flash('success', 'If an account exists with that email, a reset link has been sent.');
      return res.redirect('/auth/forgot-password');
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    await User.findByIdAndUpdate(user._id, {
      passwordResetToken: crypto.createHash('sha256').update(resetToken).digest('hex'),
      passwordResetExpires: Date.now() + 60 * 60 * 1000, // 1 hour
    });

    await sendTemplateEmail('passwordReset', email, user, resetToken);

    req.flash('success', 'If an account exists with that email, a reset link has been sent.');
    res.redirect('/auth/forgot-password');
  } catch (err) {
    next(err);
  }
};

// GET /auth/reset-password/:token
exports.getResetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      req.flash('error', 'Password reset link is invalid or has expired.');
      return res.redirect('/auth/forgot-password');
    }

    res.render('auth/reset-password', { title: 'Reset Password – StarPass', token: req.params.token });
  } catch (err) {
    next(err);
  }
};

// POST /auth/reset-password/:token
exports.postResetPassword = async (req, res, next) => {
  try {
    const { password, confirmPassword } = req.body;
    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('back');
    }

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      req.flash('error', 'Password reset link is invalid or has expired.');
      return res.redirect('/auth/forgot-password');
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    req.flash('success', 'Password reset successful. Please login with your new password.');
    res.redirect('/auth/login');
  } catch (err) {
    next(err);
  }
};

// GET /auth/verify-email/:token
exports.verifyEmail = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    }).select('+emailVerificationToken +emailVerificationExpires');

    if (!user) {
      req.flash('error', 'Email verification link is invalid or has expired.');
      return res.redirect('/fan/dashboard');
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    req.flash('success', 'Email verified successfully!');
    res.redirect('/fan/dashboard');
  } catch (err) {
    next(err);
  }
};
