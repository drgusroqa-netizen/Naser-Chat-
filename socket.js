const socketIO = require('socket.io');

const initializeSocket = (server) => {
  const io = socketIO(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  const onlineUsers = new Map();
  const typingUsers = new Map();

  io.on('connection', (socket) => {
    console.log(`🔌 New socket connection: ${socket.id}`);

    // User goes online
    socket.on('user_online', (userId) => {
      onlineUsers.set(userId, socket.id);
      socket.userId = userId;
      
      console.log(`👤 User ${userId} is now online`);
      io.emit('user_status_change', { userId, status: 'online' });
    });

    // Join server room
    socket.on('join_server', (serverId) => {
      socket.join(`server_${serverId}`);
      console.log(`Socket ${socket.id} joined server ${serverId}`);
    });

    // Join channel room
    socket.on('join_channel', (channelId) => {
      socket.join(`channel_${channelId}`);
      console.log(`Socket ${socket.id} joined channel ${channelId}`);
    });

    // Send message
    socket.on('send_message', async (data) => {
      const { channelId, userId, content, attachments } = data;
      
      try {
        const Message = require('../models/Message');
        const User = require('../models/User');
        
        const message = new Message({
          channel: channelId,
          author: userId,
          content,
          attachments,
          timestamp: new Date()
        });
        
        await message.save();
        
        const populatedMessage = await Message.findById(message._id)
          .populate('author', 'username avatar displayName');
        
        io.to(`channel_${channelId}`).emit('new_message', populatedMessage);
        
        console.log(`📨 New message in channel ${channelId}`);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // User typing
    socket.on('typing', (data) => {
      const { channelId, userId, isTyping } = data;
      
      if (isTyping) {
        typingUsers.set(`${channelId}_${userId}`, Date.now());
      } else {
        typingUsers.delete(`${channelId}_${userId}`);
      }
      
      socket.to(`channel_${channelId}`).emit('user_typing', { 
        userId, 
        isTyping,
        channelId 
      });
    });

    // Voice call events
    socket.on('voice_join', (data) => {
      const { channelId, userId } = data;
      socket.to(`channel_${channelId}`).emit('user_voice_join', { userId });
    });

    socket.on('voice_leave', (data) => {
      const { channelId, userId } = data;
      socket.to(`channel_${channelId}`).emit('user_voice_leave', { userId });
    });

    socket.on('voice_signal', (data) => {
      const { to, signal, from } = data;
      io.to(to).emit('voice_signal', { signal, from });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.id}`);
      
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        io.emit('user_status_change', { 
          userId: socket.userId, 
          status: 'offline' 
        });
        console.log(`👤 User ${socket.userId} is now offline`);
      }
      
      // Clean up typing users
      for (const [key, timestamp] of typingUsers.entries()) {
        if (key.endsWith(`_${socket.userId}`)) {
          typingUsers.delete(key);
        }
      }
    });
  });

  // Clean up typing users periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamp] of typingUsers.entries()) {
      if (now - timestamp > 5000) { // 5 seconds
        typingUsers.delete(key);
      }
    }
  }, 10000);

  return io;
};

module.exports = initializeSocket;
