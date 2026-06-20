'use strict';

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./logger');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map((o) => o.trim()),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // Auth middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie
      ?.split(';')
      .find((c) => c.trim().startsWith('sp_token='))
      ?.split('=')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
      } catch {
        // Allow unauthenticated sockets but mark them
        socket.user = null;
      }
    } else {
      socket.user = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
      logger.debug(`Socket connected: user=${userId}`);
    }

    socket.on('join:event', (eventId) => {
      socket.join(`event:${eventId}`);
    });

    socket.on('leave:event', (eventId) => {
      socket.leave(`event:${eventId}`);
    });

    socket.on('join:fanclub', (fanClubId) => {
      socket.join(`fanclub:${fanClubId}`);
    });

    socket.on('disconnect', () => {
      if (userId) logger.debug(`Socket disconnected: user=${userId}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

// Emit notification to specific user
const emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

// Broadcast to event room
const emitToEvent = (eventId, event, data) => {
  if (!io) return;
  io.to(`event:${eventId}`).emit(event, data);
};

// Broadcast to fan club room
const emitToFanClub = (fanClubId, event, data) => {
  if (!io) return;
  io.to(`fanclub:${fanClubId}`).emit(event, data);
};

module.exports = { initSocket, getIO, emitToUser, emitToEvent, emitToFanClub };
