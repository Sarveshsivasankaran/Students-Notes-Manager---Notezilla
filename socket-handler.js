/**
 * Notezilla Real-time Sync Handler
 */
const socketIo = require('socket.io');

let io;
const socketIdentities = new Map();

const getActivePresenceCount = () => new Set(socketIdentities.values()).size;

const emitPresence = () => {
    if (io) io.emit('live_activity', { activeUsers: getActivePresenceCount() });
};

const setSocketIdentity = (socket, prefix, value) => {
    const safeValue = String(value || '').trim().slice(0, 160);
    if (!safeValue) return;
    socketIdentities.set(socket.id, `${prefix}:${safeValue}`);
    emitPresence();
};

const initializeSocket = (server) => {
    io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);
        socketIdentities.set(socket.id, `socket:${socket.id}`);
        emitPresence();

        socket.on('identify', (visitorId) => {
            setSocketIdentity(socket, 'visitor', visitorId);
        });

        socket.on('join', (userId) => {
            socket.join(`user_${userId}`);
            setSocketIdentity(socket, 'user', userId);
            console.log(`User ${userId} joined their room`);
        });

        socket.on('progress_update', (data) => {
            // Broadcast progress updates to the user's rooms (across devices)
            if (data.userId) {
                socket.to(`user_${data.userId}`).emit('progress_synced', data);
            }
        });

        socket.on('disconnect', () => {
            socketIdentities.delete(socket.id);
            emitPresence();
            console.log('Client disconnected:', socket.id);
        });
    });

    return io;
};

const notifyAnnouncement = (announcement) => {
    if (io) {
        io.emit('new_announcement', announcement);
    }
};

const notifyUpload = (note) => {
    if (io) {
        io.emit('new_upload', note);
    }
};

const notifyRepositoryUpdate = (stats) => {
    if (io) io.emit('repository_updated', stats);
};

module.exports = {
    initializeSocket,
    notifyAnnouncement,
    notifyUpload,
    notifyRepositoryUpdate,
    getIo: () => io,
    getPresenceSnapshot: () => ({ activeUsers: getActivePresenceCount() })
};
