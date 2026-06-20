'use strict';

const logger = require('../config/logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

const globalErrorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Mongoose CastError
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid resource ID.';
  }

  // Mongoose Duplicate Key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    statusCode = 409;
    message = `${field} already exists.`;
  }

  // Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  // JWT Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token.';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired.';
  }

  // CSRF Errors
  if (err.code === 'EBADCSRFTOKEN') {
    statusCode = 403;
    message = 'Invalid CSRF token. Please refresh and try again.';
  }

  if (!err.isOperational || statusCode === 500) {
    logger.error('Unhandled Error:', err);
  }

  if (req.accepts('html') && !req.path.startsWith('/api/')) {
    if (statusCode === 404) {
      return res.status(404).render('public/404', { title: 'Not Found' });
    }
    if (statusCode === 403) {
      req.flash('error', message);
      return res.redirect('back');
    }
    return res.status(statusCode).render('public/error', {
      title: 'Error',
      statusCode,
      message: process.env.NODE_ENV === 'production' && statusCode === 500
        ? 'Something went wrong. Please try again.'
        : message,
    });
  }

  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal Server Error'
      : message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = { AppError, globalErrorHandler };
