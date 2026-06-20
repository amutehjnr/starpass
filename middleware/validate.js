'use strict';

const { body, param, query, validationResult } = require('express-validator');

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg).join(', ');
    if (req.accepts('html')) {
      req.flash('error', messages);
      return res.redirect('back');
    }
    return res.status(422).json({ success: false, message: messages, errors: errors.array() });
  }
  next();
};

const registerRules = [
  body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 50 }),
  body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ max: 50 }),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
  body('confirmPassword').custom((val, { req }) => {
    if (val !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
];

const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

const giftCardRules = [
  body('cardType')
    .isIn(['amazon', 'apple', 'steam', 'google_play', 'visa', 'mastercard', 'other'])
    .withMessage('Invalid card type'),
  body('declaredValue').isFloat({ min: 1 }).withMessage('Card value must be a positive number'),
  body('cardNumber').optional().trim().isLength({ max: 30 }),
];

const eventRules = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('type').isIn(['physical', 'virtual', 'hybrid']).withMessage('Invalid event type'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
];

const reviewRules = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('content').optional().trim().isLength({ max: 3000 }),
  body('title').optional().trim().isLength({ max: 200 }),
];

const paginationRules = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
];

module.exports = {
  handleValidation,
  registerRules,
  loginRules,
  giftCardRules,
  eventRules,
  reviewRules,
  paginationRules,
};
