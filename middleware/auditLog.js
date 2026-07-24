'use strict';

const geoip = require('geoip-lite');
const { AuditLog } = require('../models/index');
const logger = require('../config/logger');

// Resolve a rough location from an IP address. Returns nulls for local/private
// IPs (e.g. ::1, 127.0.0.1, 192.168.x.x) since those can't be geolocated.
const resolveLocation = (ip) => {
  if (!ip) return { city: null, region: null, country: null };
  const cleanIp = ip.replace('::ffff:', ''); // normalize IPv4-mapped IPv6
  const geo = geoip.lookup(cleanIp);
  if (!geo) return { city: null, region: null, country: null };
  return { city: geo.city || null, region: geo.region || null, country: geo.country || null };
};

const audit = (action, resource) => async (req, res, next) => {
  const originalJson = res.json.bind(res);
  const originalRedirect = res.redirect.bind(res);

  let status = 'success';

  res.json = function (body) {
    if (body && body.success === false) status = 'failure';
    return originalJson(body);
  };

  res.redirect = function (...args) {
    return originalRedirect(...args);
  };

  res.on('finish', async () => {
    try {
      await AuditLog.create({
        actor: req.user?._id || null,
        actorRole: req.user?.role || 'anonymous',
        action,
        resource,
        resourceId: req.params?.id || null,
        details: {
          method: req.method,
          path: req.originalUrl,
          body: sanitizeBody(req.body),
        },
        ipAddress: req.ip,
        location: resolveLocation(req.ip),
        userAgent: req.headers['user-agent'],
        status: res.statusCode < 400 ? 'success' : 'failure',
      });
    } catch (err) {
      logger.error('Audit log error:', err);
    }
  });

  next();
};

const sanitizeBody = (body) => {
  if (!body) return {};
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'confirmPassword', 'pin', 'cardNumber', 'token'];
  sensitiveFields.forEach((f) => { if (sanitized[f]) sanitized[f] = '[REDACTED]'; });
  return sanitized;
};

module.exports = { audit };