'use strict';

const { Notification } = require('../models/index');
const { emitToUser } = require('../config/socket');
const { sendTemplateEmail } = require('./emailService');
const logger = require('../config/logger');

const createNotification = async ({ recipientId, type, title, message, data = {}, link = null, sendEmail = false, emailTemplate = null, emailArgs = [] }) => {
  try {
    const notification = await Notification.create({
      recipient: recipientId,
      type,
      title,
      message,
      data,
      link,
    });

    // Emit real-time notification
    emitToUser(recipientId.toString(), 'notification:new', {
      id: notification._id,
      type,
      title,
      message,
      link,
      createdAt: notification.createdAt,
    });

    // Optionally send email
    if (sendEmail && emailTemplate && emailArgs.length > 0) {
      setImmediate(async () => {
        try {
          await sendTemplateEmail(emailTemplate, ...emailArgs);
        } catch (err) {
          logger.error('Notification email error:', err);
        }
      });
    }

    return notification;
  } catch (err) {
    logger.error('Create notification error:', err);
  }
};

const notifyPaymentApproved = async (fan, giftCard, ticket, event) => {
  await createNotification({
    recipientId: fan._id,
    type: 'payment_approved',
    title: 'Payment Approved ✅',
    message: `Your gift card payment for "${event.title}" has been approved. Your ticket is now active!`,
    data: { ticketId: ticket._id, giftCardId: giftCard._id, eventId: event._id },
    link: `/fan/tickets/${ticket._id}`,
    sendEmail: fan.preferences?.emailNotifications !== false,
    emailTemplate: 'paymentApproved',
    emailArgs: [fan.email, giftCard, ticket],
  });
};

const notifyPaymentRejected = async (fan, giftCard, reason) => {
  await createNotification({
    recipientId: fan._id,
    type: 'payment_rejected',
    title: 'Payment Not Approved',
    message: `Your gift card submission could not be approved. ${reason ? `Reason: ${reason}` : ''}`,
    data: { giftCardId: giftCard._id },
    link: `/fan/payments`,
    sendEmail: fan.preferences?.emailNotifications !== false,
    emailTemplate: 'paymentRejected',
    emailArgs: [fan.email, giftCard, reason],
  });
};

const notifyTicketConfirmed = async (fan, ticket, event) => {
  await createNotification({
    recipientId: fan._id,
    type: 'ticket_confirmed',
    title: 'Ticket Confirmed 🎟️',
    message: `Your ticket for "${event.title}" is confirmed!`,
    data: { ticketId: ticket._id, eventId: event._id },
    link: `/fan/tickets/${ticket._id}`,
    sendEmail: fan.preferences?.emailNotifications !== false,
    emailTemplate: 'ticketConfirmed',
    emailArgs: [fan.email, fan, ticket, event],
  });
};

const notifyEventReminder = async (fan, ticket, event) => {
  await createNotification({
    recipientId: fan._id,
    type: 'event_reminder',
    title: `Reminder: ${event.title} is tomorrow!`,
    message: `Don't forget – your event starts tomorrow at ${new Date(event.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
    data: { ticketId: ticket._id, eventId: event._id },
    link: `/fan/tickets/${ticket._id}`,
    sendEmail: fan.preferences?.emailNotifications !== false,
    emailTemplate: 'eventReminder',
    emailArgs: [fan.email, fan, event],
  });
};

const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ recipient: userId, isRead: false });
};

const markAllRead = async (userId) => {
  return Notification.updateMany({ recipient: userId, isRead: false }, { $set: { isRead: true, readAt: new Date() } });
};

module.exports = {
  createNotification,
  notifyPaymentApproved,
  notifyPaymentRejected,
  notifyTicketConfirmed,
  notifyEventReminder,
  getUnreadCount,
  markAllRead,
};
