const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Server = require('../models/Server');

// Send message
exports.sendMessage = async (req, res) => {
  try {
    const { content, attachments, reference } = req.body;
    const channelId = req.params.channelId;
    
    if (!content && (!attachments || attachments.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'يجب إرسال محتوى أو مرفقات'
      });
    }
    
    // Check channel exists
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'القناة غير موجودة'
      });
    }
    
    // Check permissions
    const server = await Server.findById(channel.server);
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية للإرسال في هذه القناة'
      });
    }
    
    // Check if channel is private
    if (channel.isPrivate && !channel.allowedUsers.some(
      id => id.toString() === req.user.id.toString()
    )) {
      if (member.role !== 'admin' && member.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error: 'ليس لديك صلاحية للإرسال في هذه القناة'
        });
      }
    }
    
    // Check slowmode
    if (channel.slowmode.enabled) {
      const lastMessage = await Message.findOne({
        channel: channelId,
        author: req.user.id
      }).sort({ timestamp: -1 });
      
      if (lastMessage) {
        const cooldownTime = lastMessage.timestamp.getTime() + (channel.slowmode.delay * 1000);
        if (Date.now() < cooldownTime) {
          const remainingSeconds = Math.ceil((cooldownTime - Date.now()) / 1000);
          return res.status(429).json({
            success: false,
            error: `يرجى الانتظار ${remainingSeconds} ثانية قبل إرسال رسالة أخرى`
          });
        }
      }
    }
    
    // Create message
    const message = new Message({
      content,
      channel: channelId,
      author: req.user.id,
      attachments: attachments || [],
      reference: reference || null,
      timestamp: new Date()
    });
    
    await message.save();
    
    // Populate author information
    const populatedMessage = await Message.findById(message._id)
      .populate('author', 'username displayName avatar status')
      .populate('mentions', 'username displayName avatar');
    
    // Emit socket event
    const io = req.app.get('io');
    io.to(`channel_${channelId}`).emit('new_message', populatedMessage);
    
    res.status(201).json({
      success: true,
      message: 'تم إرسال الرسالة بنجاح',
      data: populatedMessage
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في إرسال الرسالة'
    });
  }
};

// Get messages in channel
exports.getMessages = async (req, res) => {
  try {
    const channelId = req.params.channelId;
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before;
    
    // Check channel exists
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'القناة غير موجودة'
      });
    }
    
    // Check permissions
    const server = await Server.findById(channel.server);
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية للوصول إلى هذه القناة'
      });
    }
    
    // Build query
    const query = { channel: channelId };
    
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }
    
    // Get messages
    const messages = await Message.find(query)
      .populate('author', 'username displayName avatar status')
      .populate('mentions', 'username displayName avatar')
      .sort({ timestamp: -1 })
      .limit(limit);
    
    // Reverse to get chronological order
    messages.reverse();
    
    res.json({
      success: true,
      messages,
      hasMore: messages.length === limit
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب الرسائل'
    });
  }
};

// Edit message
exports.editMessage = async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'محتوى الرسالة مطلوب'
      });
    }
    
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'الرسالة غير موجودة'
      });
    }
    
    // Check if user is the author
    if (message.author.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لتعديل هذه الرسالة'
      });
    }
    
    // Update message
    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    
    await message.save();
    
    // Populate author information
    const populatedMessage = await Message.findById(message._id)
      .populate('author', 'username displayName avatar status')
      .populate('mentions', 'username displayName avatar');
    
    // Emit socket event
    const io = req.app.get('io');
    io.to(`channel_${message.channel}`).emit('message_updated', populatedMessage);
    
    res.json({
      success: true,
      message: 'تم تعديل الرسالة بنجاح',
      data: populatedMessage
    });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في تعديل الرسالة'
    });
  }
};

// Delete message
exports.deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'الرسالة غير موجودة'
      });
    }
    
    // Check permissions
    const channel = await Channel.findById(message.channel);
    const server = await Server.findById(channel.server);
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    const canDelete = 
      message.author.toString() === req.user.id.toString() ||
      (member && (member.role === 'admin' || member.role === 'owner')) ||
      (member && member.role === 'moderator');
    
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لحذف هذه الرسالة'
      });
    }
    
    // Delete message
    await message.deleteOne();
    
    // Emit socket event
    const io = req.app.get('io');
    io.to(`channel_${message.channel}`).emit('message_deleted', {
      messageId: message._id,
      channelId: message.channel
    });
    
    res.json({
      success: true,
      message: 'تم حذف الرسالة بنجاح'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في حذف الرسالة'
    });
  }
};

// Pin message
exports.pinMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'الرسالة غير موجودة'
      });
    }
    
    // Check permissions
    const channel = await Channel.findById(message.channel);
    const server = await Server.findById(channel.server);
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member || (member.role !== 'admin' && member.role !== 'owner' && member.role !== 'moderator')) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لتثبيت الرسالة'
      });
    }
    
    // Pin message
    message.pinned = true;
    message.pinnedAt = new Date();
    message.pinnedBy = req.user.id;
    
    await message.save();
    
    // Emit socket event
    const io = req.app.get('io');
    io.to(`channel_${message.channel}`).emit('message_pinned', {
      messageId: message._id,
      channelId: message.channel,
      pinnedBy: req.user.id
    });
    
    res.json({
      success: true,
      message: 'تم تثبيت الرسالة بنجاح',
      data: message
    });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في تثبيت الرسالة'
    });
  }
};

// Unpin message
exports.unpinMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'الرسالة غير موجودة'
      });
    }
    
    // Check permissions
    const channel = await Channel.findById(message.channel);
    const server = await Server.findById(channel.server);
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member || (member.role !== 'admin' && member.role !== 'owner' && member.role !== 'moderator')) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لفك تثبيت الرسالة'
      });
    }
    
    // Unpin message
    message.pinned = false;
    message.pinnedAt = null;
    message.pinnedBy = null;
    
    await message.save();
    
    // Emit socket event
    const io = req.app.get('io');
    io.to(`channel_${message.channel}`).emit('message_unpinned', {
      messageId: message._id,
      channelId: message.channel
    });
    
    res.json({
      success: true,
      message: 'تم فك تثبيت الرسالة بنجاح',
      data: message
    });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في فك تثبيت الرسالة'
    });
  }
};

// Get pinned messages
exports.getPinnedMessages = async (req, res) => {
  try {
    const channelId = req.params.channelId;
    
    const messages = await Message.find({
      channel: channelId,
      pinned: true
    })
      .populate('author', 'username displayName avatar status')
      .populate('pinnedBy', 'username displayName avatar')
      .sort({ pinnedAt: -1 });
    
    res.json({
      success: true,
      messages
    });
  } catch (error) {
    console.error('Get pinned messages error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب الرسائل المثبتة'
    });
  }
};

// Add reaction to message
exports.addReaction = async (req, res) => {
  try {
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({
        success: false,
        error: 'الرمز التفاعلي مطلوب'
      });
    }
    
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'الرسالة غير موجودة'
      });
    }
    
    // Add reaction
    const result = await message.addReaction(emoji, req.user.id);
    
    if (!result.added) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }
    
    // Emit socket event
    const io = req.app.get('io');
    io.to(`channel_${message.channel}`).emit('message_reaction_added', {
      messageId: message._id,
      emoji,
      userId: req.user.id,
      reaction: result.reaction
    });
    
    res.json({
      success: true,
      message: 'تم إضافة التفاعل بنجاح',
      reaction: result.reaction
    });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في إضافة التفاعل'
    });
  }
};

// Remove reaction from message
exports.removeReaction = async (req, res) => {
  try {
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({
        success: false,
        error: 'الرمز التفاعلي مطلوب'
      });
    }
    
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({
        success: false,
        error: 'الرسالة غير موجودة'
      });
    }
    
    // Remove reaction
    const result = await message.removeReaction(emoji, req.user.id);
    
    if (!result.removed) {
      return res.status(400).json({
        success: false,
        error: result.message
      });
    }
    
    // Emit socket event
    const io = req.app.get('io');
    io.to(`channel_${message.channel}`).emit('message_reaction_removed', {
      messageId: message._id,
      emoji,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'تم إزالة التفاعل بنجاح'
    });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في إزالة التفاعل'
    });
  }
};

// Search messages
exports.searchMessages = async (req, res) => {
  try {
    const { query, channelId, limit } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'كلمة البحث مطلوبة'
      });
    }
    
    const searchQuery = {
      content: { $regex: query, $options: 'i' }
    };
    
    if (channelId) {
      searchQuery.channel = channelId;
    }
    
    const messages = await Message.find(searchQuery)
      .populate('author', 'username displayName avatar status')
      .populate('channel', 'name')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit) || 50);
    
    res.json({
      success: true,
      results: messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في البحث'
    });
  }
};
