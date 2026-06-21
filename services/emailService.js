'use strict';

const nodemailer = require('nodemailer');
const logger = require('../config/logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  pool: true,
  maxConnections: 5,
});

const sendMail = async ({ to, subject, html, text }) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'StarPass <noreply@starpass.com>',
      to,
      subject,
      html,
      text,
    });
    logger.info(`Email sent: ${info.messageId} to ${to}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    logger.error('Email send error:', err);
    return { success: false, error: err.message };
  }
};

const emailTemplates = {
  welcome: (user) => ({
    subject: `Welcome to StarPass, ${user.firstName}! ✨`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#8b5cf6,#d946ef);padding:40px;text-align:center;">
          <h1 style="margin:0;font-size:32px;font-weight:700;">⭐ StarPass</h1>
          <p style="margin:8px 0 0;opacity:.8;">Celebrity Meet & Greet Platform</p>
        </div>
        <div style="padding:40px;">
          <h2 style="color:#d946ef;">Welcome, ${user.firstName}! 🎉</h2>
          <p style="color:#ccc;line-height:1.7;">Your account has been created. You can now browse celebrities, purchase tickets, and join exclusive fan clubs.</p>
          <a href="${process.env.APP_URL}/fan/dashboard" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Go to Dashboard</a>
        </div>
        <div style="padding:20px 40px;border-top:1px solid #222;color:#666;font-size:12px;">
          © 2025 StarPass. All rights reserved.
        </div>
      </div>`,
  }),

  emailVerification: (user, token) => ({
    subject: 'Verify your StarPass email address',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#8b5cf6,#d946ef);padding:40px;text-align:center;">
          <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
        </div>
        <div style="padding:40px;">
          <h2>Verify Your Email</h2>
          <p style="color:#ccc;">Click the button below to verify your email address. This link expires in 24 hours.</p>
          <a href="${process.env.APP_URL}/auth/verify-email/${token}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Verify Email</a>
        </div>
      </div>`,
  }),

  passwordReset: (user, token) => ({
    subject: 'Reset your StarPass password',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#8b5cf6,#d946ef);padding:40px;text-align:center;">
          <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
        </div>
        <div style="padding:40px;">
          <h2>Password Reset Request</h2>
          <p style="color:#ccc;">A password reset was requested for your account. This link expires in 1 hour.</p>
          <a href="${process.env.APP_URL}/auth/reset-password/${token}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Reset Password</a>
          <p style="color:#666;margin-top:20px;font-size:14px;">If you did not request this, ignore this email.</p>
        </div>
      </div>`,
  }),

  ticketConfirmed: (user, ticket, event) => ({
    subject: `🎟️ Ticket Confirmed – ${event.title}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#8b5cf6,#d946ef);padding:40px;text-align:center;">
          <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
        </div>
        <div style="padding:40px;">
          <h2>Your Ticket is Confirmed! 🎉</h2>
          <div style="background:#111;border-radius:12px;padding:24px;margin:20px 0;border-left:4px solid #d946ef;">
            <p style="margin:0 0 8px;color:#888;font-size:12px;text-transform:uppercase;">Event</p>
            <h3 style="margin:0 0 16px;">${event.title}</h3>
            <p style="margin:0 0 4px;color:#ccc;">Ticket #: <strong>${ticket.ticketNumber}</strong></p>
            <p style="margin:0 0 4px;color:#ccc;">Category: <strong>${ticket.ticketLabel || ticket.ticketCategory}</strong></p>
            <p style="margin:0;color:#ccc;">Date: <strong>${new Date(event.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>
          </div>
          <a href="${process.env.APP_URL}/fan/tickets/${ticket._id}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;">View Ticket & Download Pass</a>
        </div>
      </div>`,
  }),

  paymentApproved: (user, giftCard, ticket) => ({
    subject: '✅ Payment Approved – StarPass',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:40px;text-align:center;">
          <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
        </div>
        <div style="padding:40px;">
          <h2>Payment Approved ✅</h2>
          <p style="color:#ccc;">Your gift card payment of <strong>$${giftCard.declaredValue}</strong> has been approved. Your ticket is now active!</p>
          <a href="${process.env.APP_URL}/fan/tickets/${ticket._id}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">View Your Ticket</a>
        </div>
      </div>`,
  }),

  paymentRejected: (user, giftCard, reason) => ({
    subject: '❌ Payment Rejected – StarPass',
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:40px;text-align:center;">
          <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
        </div>
        <div style="padding:40px;">
          <h2>Payment Not Approved</h2>
          <p style="color:#ccc;">Your gift card submission was reviewed and could not be approved.</p>
          ${reason ? `<div style="background:#1a0000;border-radius:8px;padding:16px;margin:16px 0;border-left:3px solid #ef4444;"><p style="margin:0;color:#fca5a5;">Reason: ${reason}</p></div>` : ''}
          <p style="color:#ccc;">You may submit a new payment or contact support for assistance.</p>
          <a href="${process.env.APP_URL}/fan/payments" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">View Payments</a>
        </div>
      </div>`,
  }),

  eventReminder: (user, event) => ({
    subject: `⏰ Reminder: ${event.title} is tomorrow!`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#8b5cf6,#d946ef);padding:40px;text-align:center;">
          <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
        </div>
        <div style="padding:40px;">
          <h2>Your event is tomorrow! 🎊</h2>
          <h3 style="color:#d946ef;">${event.title}</h3>
          <p style="color:#ccc;">Date: ${new Date(event.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
          <p style="color:#ccc;">Location: ${event.venue?.name || 'Virtual Event'}</p>
          <a href="${process.env.APP_URL}/fan/tickets" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">View My Tickets</a>
        </div>
      </div>`,
  }),

  celebrityApplicationReceived: (user, celebrity) => ({
  subject: 'Your StarPass Celebrity Application Was Received',
  html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#8b5cf6,#d946ef);padding:40px;text-align:center;">
        <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
      </div>
      <div style="padding:40px;">
        <h2>Application Received ✅</h2>
        <p style="color:#ccc;line-height:1.7;">Hi ${user.firstName}, thanks for applying as <strong>${celebrity.stageName}</strong>. Our team typically reviews applications within 2-3 business days. We'll email you as soon as a decision is made.</p>
        <a href="${process.env.APP_URL}/celebrity/dashboard" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">View Your Dashboard</a>
      </div>
    </div>`,
}),

celebrityApplicationApproved: (user, celebrity) => ({
  subject: "🎉 You're Verified on StarPass!",
  html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:40px;text-align:center;">
        <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
      </div>
      <div style="padding:40px;">
        <h2>You're Verified! 🎉</h2>
        <p style="color:#ccc;line-height:1.7;">Congratulations, ${user.firstName}! <strong>${celebrity.stageName}</strong> is now a verified celebrity on StarPass. You can publish events and start meeting your fans.</p>
        <a href="${process.env.APP_URL}/celebrity/events/create" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Create Your First Event</a>
      </div>
    </div>`,
}),

celebrityApplicationRejected: (user, celebrity, reason) => ({
  subject: 'Update on Your StarPass Celebrity Application',
  html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:40px;text-align:center;">
        <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
      </div>
      <div style="padding:40px;">
        <h2>Application Update</h2>
        <p style="color:#ccc;line-height:1.7;">Hi ${user.firstName}, after review, we were unable to verify your application for <strong>${celebrity.stageName}</strong> at this time.</p>
        ${reason ? `<div style="background:#1a0000;border-radius:8px;padding:16px;margin:16px 0;border-left:3px solid #ef4444;"><p style="margin:0;color:#fca5a5;">Reason: ${reason}</p></div>` : ''}
        <p style="color:#ccc;">If you believe this was a mistake or have additional information, please contact our support team.</p>
        <a href="${process.env.APP_URL}/contact" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Contact Support</a>
      </div>
    </div>`,
}),

celebrityInvitation: (invitation, rawToken) => ({
  subject: `You're Invited to Join StarPass as ${invitation.stageName}`,
  html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#8b5cf6,#d946ef);padding:40px;text-align:center;">
        <h1 style="margin:0;font-size:32px;">⭐ StarPass</h1>
      </div>
      <div style="padding:40px;">
        <h2>You're Invited! ⭐</h2>
        <p style="color:#ccc;line-height:1.7;">StarPass has invited you to join as <strong>${invitation.stageName}</strong>. Claim your account to set up your profile and start hosting meet & greet events with your fans.</p>
        <a href="${process.env.APP_URL}/claim/${rawToken}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#d946ef);color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:20px;">Claim Your Account</a>
        <p style="color:#666;margin-top:20px;font-size:14px;">This invitation expires on ${new Date(invitation.expiresAt).toLocaleDateString()}.</p>
      </div>
    </div>`,
}),
};

const sendTemplateEmail = async (templateName, to, ...args) => {
  const template = emailTemplates[templateName];
  if (!template) throw new Error(`Email template '${templateName}' not found`);
  const { subject, html } = template(...args);
  return sendMail({ to, subject, html });
};



module.exports = { sendMail, sendTemplateEmail, emailTemplates };
