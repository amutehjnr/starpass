'use strict';

const csurf = require('csurf');

const csrfProtection = csurf({
  cookie: false, // use session-based CSRF
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
});

// Apply CSRF protection but gracefully handle API routes and multipart routes.
// Multipart/form-data bodies aren't parsed yet at this point in the stack
// (multer runs per-route, after this), so csurf can't see req.body._csrf for
// file-upload routes. Those routes apply `csrfProtection` themselves, directly
// after their multer middleware — see routes/fan.js and routes/celebrity.js.
const csrfMiddleware = (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/refresh')) {
    return next();
  }
  if (req.is('multipart/form-data')) {
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

module.exports = { csrfMiddleware, csrfToken, csrfProtection };