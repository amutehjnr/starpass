'use strict';

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

const generateTicketPDF = async (ticket, event, fan, celebrity) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [600, 900],
        margin: 0,
        info: {
          Title: `StarPass Ticket – ${event.title}`,
          Author: 'StarPass',
          Subject: 'Event Ticket',
        },
      });

      const buffers = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // ── Background ──────────────────────────────────────────────────────────
      doc.rect(0, 0, 600, 900).fill('#0a0a0a');

      // ── Gradient header strip ───────────────────────────────────────────────
      const headerGradient = doc.linearGradient(0, 0, 600, 0);
      headerGradient.stop(0, '#7c3aed').stop(1, '#c026d3');
      doc.rect(0, 0, 600, 200).fill(headerGradient);

      // ── Brand name ─────────────────────────────────────────────────────────
      doc.fontSize(42).fillColor('#ffffff').font('Helvetica-Bold').text('⭐ STARPASS', 40, 50, { width: 520, align: 'center' });
      doc.fontSize(14).fillColor('rgba(255,255,255,0.8)').font('Helvetica').text('Celebrity Meet & Greet Platform', 40, 105, { width: 520, align: 'center' });

      // ── Category badge ─────────────────────────────────────────────────────
      const badgeColors = {
        general: '#374151',
        premium: '#1e3a8a',
        vip: '#7c3aed',
        platinum_vip: '#92400e',
      };
      const badgeColor = badgeColors[ticket.ticketCategory] || '#374151';
      doc.roundedRect(220, 145, 160, 36, 18).fill(badgeColor);
      doc.fontSize(13).fillColor('#ffffff').font('Helvetica-Bold')
        .text((ticket.ticketLabel || ticket.ticketCategory).toUpperCase(), 220, 153, { width: 160, align: 'center' });

      // ── Event title ─────────────────────────────────────────────────────────
      doc.fontSize(26).fillColor('#ffffff').font('Helvetica-Bold').text(event.title, 40, 220, { width: 520, align: 'center' });

      // ── Divider line ────────────────────────────────────────────────────────
      const divGrad = doc.linearGradient(40, 270, 560, 270);
      divGrad.stop(0, '#7c3aed').stop(0.5, '#c026d3').stop(1, '#7c3aed');
      doc.moveTo(40, 270).lineTo(560, 270).strokeColor('#7c3aed').lineWidth(2).stroke();

      // ── Info grid ───────────────────────────────────────────────────────────
      const infoItems = [
        { label: 'CELEBRITY', value: celebrity?.stageName || 'TBA' },
        { label: 'DATE', value: new Date(event.startDate).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) },
        { label: 'TIME', value: new Date(event.startDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) },
        { label: 'VENUE', value: event.venue?.name || (event.type === 'virtual' ? 'Virtual Event' : 'TBA') },
        { label: 'TICKET #', value: ticket.ticketNumber },
        { label: 'FAN NAME', value: `${fan.firstName} ${fan.lastName}` },
      ];

      let infoY = 295;
      infoItems.forEach((item, i) => {
        const x = i % 2 === 0 ? 60 : 330;
        if (i % 2 === 0 && i > 0) infoY += 75;
        doc.fontSize(10).fillColor('#9ca3af').font('Helvetica').text(item.label, x, infoY);
        doc.fontSize(15).fillColor('#ffffff').font('Helvetica-Bold').text(item.value, x, infoY + 16, { width: 240, ellipsis: true });
      });

      infoY += 75;

      // ── Dashed tear line ────────────────────────────────────────────────────
      const dashY = infoY + 20;
      doc.moveTo(40, dashY).lineTo(560, dashY).dash(6, { space: 4 }).strokeColor('#374151').lineWidth(1).stroke();
      doc.undash();
      doc.circle(20, dashY, 12).fill('#0a0a0a');
      doc.circle(580, dashY, 12).fill('#0a0a0a');

      // ── QR Code section ─────────────────────────────────────────────────────
      const qrData = JSON.stringify({
        ticketNumber: ticket.ticketNumber,
        verificationCode: ticket.qrCode?.verificationCode,
        eventId: event._id,
        fanId: fan._id,
      });

      const qrBuffer = await QRCode.toBuffer(qrData, {
        width: 180,
        margin: 1,
        color: { dark: '#ffffff', light: '#111111' },
        errorCorrectionLevel: 'H',
      });

      const qrY = dashY + 30;
      doc.roundedRect(210, qrY, 180, 180, 12).fill('#111111');
      doc.image(qrBuffer, 215, qrY + 5, { width: 170, height: 170 });

      doc.fontSize(11).fillColor('#9ca3af').font('Helvetica').text('Scan at Entry', 40, qrY + 80, { width: 600, align: 'center' });

      // ── Verification code ───────────────────────────────────────────────────
      const codeY = qrY + 200;
      doc.fontSize(10).fillColor('#6b7280').font('Helvetica').text('VERIFICATION CODE', 40, codeY, { width: 520, align: 'center' });
      doc.fontSize(18).fillColor('#d946ef').font('Courier-Bold')
        .text(formatCode(ticket.qrCode?.verificationCode || ''), 40, codeY + 18, { width: 520, align: 'center' });

      // ── Benefits ────────────────────────────────────────────────────────────
      const benefitsY = codeY + 65;
      const benefitsMap = {
        general: ['Event Access'],
        premium: ['Event Access', 'Priority Entry', 'Better Seating'],
        vip: ['Event Access', 'Meet Celebrity', 'Professional Photo', 'Autograph Session', 'Front Row Access'],
        platinum_vip: ['Private Meet & Greet', 'VIP Lounge', 'Premium Merchandise', 'Personal Interaction', 'Front Row Access', 'Professional Photo'],
      };
      const benefits = benefitsMap[ticket.ticketCategory] || ['Event Access'];
      doc.fontSize(11).fillColor('#9ca3af').font('Helvetica').text('INCLUDED BENEFITS', 40, benefitsY, { width: 520, align: 'center' });
      benefits.forEach((benefit, i) => {
        doc.fontSize(12).fillColor('#e5e7eb').font('Helvetica').text(`✓  ${benefit}`, 150, benefitsY + 22 + i * 22);
      });

      // ── Footer ──────────────────────────────────────────────────────────────
      const footerY = 850;
      doc.fontSize(9).fillColor('#4b5563').font('Helvetica')
        .text('This ticket is non-transferable. Present this ticket at the event entrance.', 40, footerY, { width: 520, align: 'center' });
      doc.text(`Generated by StarPass • ${process.env.APP_URL}`, 40, footerY + 15, { width: 520, align: 'center' });

      doc.end();
    } catch (err) {
      logger.error('PDF generation error:', err);
      reject(err);
    }
  });
};

const formatCode = (code = '') => {
  return code.replace(/(.{4})/g, '$1 ').trim();
};

module.exports = { generateTicketPDF };
