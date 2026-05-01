/**
 * Notezilla Real-time Sync Handler
 */
const socketIo = require('socket.io');

let io;
const activeUsers = new Set();

const initializeSocket = (server) => {
    io = socketIo(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('New client connected:', socket.id);

        socket.on('join', (userId) => {
            socket.join(`user_${userId}`);
            activeUsers.add(userId);
            io.emit('live_activity', { activeUsers: activeUsers.size });
            console.log(`User ${userId} joined their room`);
        });

        socket.on('progress_update', (data) => {
            // Broadcast progress updates to the user's rooms (across devices)
            if (data.userId) {
                socket.to(`user_${data.userId}`).emit('progress_synced', data);
            }
        });

        socket.on('disconnect', () => {
            // Logic to remove user from activeUsers would need tracking socketId -> userId
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

module.exports = {
    initializeSocket,
    notifyAnnouncement,
    notifyUpload,
    getIo: () => io
};
