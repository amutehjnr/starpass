'use strict';

const jwt = require('jsonwebtoken');
const { User } = require('../models/User');
const logger = require('../config/logger');

// Attach user to request from JWT cookie or header
const attachUser = async (req, res, next) => {
  try {
    const token =
      req.cookies?.sp_token ||
      (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('+loginAttempts');

    if (!user || !user.isActive) {
      req.user = null;
      return next();
    }

    req.user = user;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
};

// Require authentication
const requireAuth = (req, res, next) => {
  if (!req.user) {
    if (req.accepts('html')) {
      req.flash('error', 'Please login to continue.');
      return res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
    }
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  next();
};

// Require specific roles
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      if (req.accepts('html')) {
        req.flash('error', 'Please login to continue.');
        return res.redirect(`/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
      }
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      if (req.accepts('html')) {
        req.flash('error', 'You do not have permission to access this page.');
        return res.redirect('/');
      }
      return res.status(403).json({ success: false, message: 'Insufficient permissions.' });
    }
    next();
  };
};

// Redirect already-authenticated users
const redirectIfAuth = (req, res, next) => {
  if (!req.user) return next();

  const roleRedirects = {
    fan: '/fan/dashboard',
    celebrity: '/celebrity/dashboard',
    celebrity_manager: '/celebrity/dashboard',
    event_organizer: '/celebrity/dashboard',
    moderator: '/admin/dashboard',
    admin: '/admin/dashboard',
    super_admin: '/admin/dashboard',
  };
  return res.redirect(roleRedirects[req.user.role] || '/');
};

// Generate JWT tokens
const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '15m',
  });
  const refreshToken = jwt.sign({ id: userId, role }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
  });
  return { accessToken, refreshToken };
};

// Set token cookies
const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('sp_token', accessToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 min
  });
  res.cookie('sp_refresh', refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/auth/refresh',
  });
};

const clearTokenCookies = (res) => {
  res.clearCookie('sp_token');
  res.clearCookie('sp_refresh', { path: '/auth/refresh' });
};

module.exports = {
  attachUser,
  requireAuth,
  requireRole,
  redirectIfAuth,
  generateTokens,
  setTokenCookies,
  clearTokenCookies,
};
