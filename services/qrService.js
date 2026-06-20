'use strict';

const QRCode = require('qrcode');

const generateQRCode = async (data) => {
  const qrString = typeof data === 'string' ? data : JSON.stringify(data);
  const dataUrl = await QRCode.toDataURL(qrString, {
    width: 300,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });
  return dataUrl;
};

const generateTicketQR = async (ticket) => {
  const payload = {
    t: ticket.ticketNumber,
    v: ticket.qrCode?.verificationCode,
    e: ticket._id,
  };
  return generateQRCode(payload);
};

module.exports = { generateQRCode, generateTicketQR };
