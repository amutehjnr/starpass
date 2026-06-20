'use strict';

const csurf = require('csurf');

const csrfProtection = csurf({
  cookie: false, // use session-based CSRF
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
});

// Apply CSRF protection but gracefully handle API routes
const csrfMiddleware = (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/refresh')) {
    return next();
  }
  csrfProtection(req, res, next);
};

// Inject CSRF token into template locals
const csrfToken = (req, res, next) => {
  try {
    res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
  } catch {
    res.locals.csrfToken = '';
  }
  next();
};

module.exports = { csrfMiddleware, csrfToken };
