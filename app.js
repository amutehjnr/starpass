'use strict';

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean = require('xss-clean');
const cors = require('cors');
const flash = require('connect-flash');
const rateLimit = require('express-rate-limit');

const logger = require('./config/logger');
const { csrfMiddleware, csrfToken } = require('./middleware/csrf');
const { globalErrorHandler } = require('./middleware/errorHandler');
const { attachUser } = require('./middleware/auth');
const onboardingRoutes = require('./routes/onboarding')

// Route imports
const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const fanRoutes = require('./routes/fan');
const celebrityRoutes = require('./routes/celebrity');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();

// ─── Trust Proxy (Render) ────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ─── View Engine ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Security Headers ────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.socket.io'],
        imgSrc: ["'self'", 'data:', 'res.cloudinary.com', '*.cloudinary.com'],
        fontSrc: ["'self'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        mediaSrc: ["'self'", 'res.cloudinary.com'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map((o) => o.trim());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  })
);

// ─── Compression ─────────────────────────────────────────────────────────────
app.use(compression());

// ─── Logging ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// ─── Sanitization ─────────────────────────────────────────────────────────────
app.use(mongoSanitize());
app.use(xssClean());

// ─── Session ─────────────────────────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    },
    name: 'sp_sid',
  })
);

// ─── Flash ───────────────────────────────────────────────────────────────────
app.use(flash());

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    if (req.accepts('html')) {
      req.flash('error', 'Too many requests. Please try again later.');
      return res.redirect('/');
    }
    res.status(429).json({ success: false, message: 'Too many requests.' });
  },
});
app.use(globalLimiter);

// ─── Auth Middleware ──────────────────────────────────────────────────────────
app.use(attachUser);

// ─── CSRF ─────────────────────────────────────────────────────────────────────
app.use(csrfMiddleware);
app.use(csrfToken);

// ─── Global Template Locals ──────────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.info_msg = req.flash('info');
  res.locals.currentUser = req.user || null;
  res.locals.currentPath = req.path;
  res.locals.appName = process.env.APP_NAME || 'StarPass';
  res.locals.appUrl = process.env.APP_URL || 'http://localhost:3000';
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/', publicRoutes);
app.use('/auth', authRoutes);
app.use('/fan', fanRoutes);
app.use('/celebrity', celebrityRoutes);
app.use('/admin', adminRoutes);
app.use('/api/v1', apiRoutes);
app.use('/', onboardingRoutes);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('public/404', { title: 'Page Not Found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(globalErrorHandler);

module.exports = app;
