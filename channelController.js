const Channel = require('../models/Channel');
const Server = require('../models/Server');

// Create channel
exports.createChannel = async (req, res) => {
  try {
    const { name, type, category, isPrivate, topic } = req.body;
    const serverId = req.params.serverId;
    
    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: 'اسم القناة ونوعها مطلوبان'
      });
    }
    
    // Check server exists
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check user permissions
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لإنشاء قناة'
      });
    }
    
    // Create channel
    const channel = new Channel({
      name,
      type,
      server: serverId,
      category: category || 'غير مصنف',
      isPrivate: isPrivate || false,
      topic: topic || '',
      position: server.channels.length
    });
    
    await channel.save();
    
    // Add channel to server
    server.channels.push(channel._id);
    
    // Add to category if specified
    if (category && category !== 'غير مصنف') {
      const catIndex = server.categories.findIndex(cat => cat.name === category);
      if (catIndex > -1) {
        server.categories[catIndex].channels.push(channel._id);
      } else {
        server.categories.push({
          name: category,
          position: server.categories.length,
          channels: [channel._id]
        });
      }
    }
    
    await server.save();
    
    res.status(201).json({
      success: true,
      message: 'تم إنشاء القناة بنجاح',
      channel
    });
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في إنشاء القناة'
    });
  }
};

// Get channel by ID
exports.getChannel = async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('server', 'name icon owner')
      .populate('allowedUsers', 'username displayName avatar');
    
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
    
    // Check if channel is private
    if (channel.isPrivate && !channel.allowedUsers.some(
      user => user._id.toString() === req.user.id.toString()
    )) {
      // Check if user is admin or owner
      if (member.role !== 'admin' && member.role !== 'owner') {
        return res.status(403).json({
          success: false,
          error: 'ليس لديك صلاحية للوصول إلى هذه القناة'
        });
      }
    }
    
    res.json({
      success: true,
      channel
    });
  } catch (error) {
    console.error('Get channel error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب القناة'
    });
  }
};

// Get all channels in server
exports.getServerChannels = async (req, res) => {
  try {
    const serverId = req.params.serverId;
    
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check if user is member
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية للوصول إلى هذا الخادم'
      });
    }
    
    const channels = await Channel.find({ 
      server: serverId,
      $or: [
        { isPrivate: false },
        { 
          isPrivate: true,
          allowedUsers: req.user.id 
        }
      ]
    }).sort({ position: 1 });
    
    res.json({
      success: true,
      channels
    });
  } catch (error) {
    console.error('Get server channels error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب قنوات الخادم'
    });
  }
};

// Update channel
exports.updateChannel = async (req, res) => {
  try {
    const { name, topic, isPrivate, slowmode } = req.body;
    
    const channel = await Channel.findById(req.params.id);
    
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
    
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لتعديل القناة'
      });
    }
    
    // Update channel
    if (name) channel.name = name;
    if (topic !== undefined) channel.topic = topic;
    if (isPrivate !== undefined) channel.isPrivate = isPrivate;
    
    if (slowmode !== undefined) {
      channel.slowmode = {
        enabled: slowmode.enabled || false,
        delay: slowmode.delay || 0
      };
    }
    
    await channel.save();
    
    res.json({
      success: true,
      message: 'تم تحديث القناة بنجاح',
      channel
    });
  } catch (error) {
    console.error('Update channel error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في تحديث القناة'
    });
  }
};

// Delete channel
exports.deleteChannel = async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    
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
    
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لحذف القناة'
      });
    }
    
    // Remove channel from server
    await Server.findByIdAndUpdate(channel.server, {
      $pull: { channels: channel._id }
    });
    
    // Remove from categories
    await Server.updateMany(
      { 'categories.channels': channel._id },
      { $pull: { 'categories.$.channels': channel._id } }
    );
    
    // Delete channel
    await channel.deleteOne();
    
    res.json({
      success: true,
      message: 'تم حذف القناة بنجاح'
    });
  } catch (error) {
    console.error('Delete channel error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في حذف القناة'
    });
  }
};

// Update channel position
exports.updateChannelPosition = async (req, res) => {
  try {
    const { channels } = req.body;
    
    if (!Array.isArray(channels)) {
      return res.status(400).json({
        success: false,
        error: 'يجب إرسال مصفوفة من القنوات'
      });
    }
    
    // Update each channel position
    const updatePromises = channels.map((channel, index) => {
      return Channel.findByIdAndUpdate(
        channel.id,
        { position: index },
        { new: true }
      );
    });
    
    await Promise.all(updatePromises);
    
    res.json({
      success: true,
      message: 'تم تحديث ترتيب القنوات بنجاح'
    });
  } catch (error) {
    console.error('Update channel position error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في تحديث ترتيب القنوات'
    });
  }
};

// Add user to private channel
exports.addUserToChannel = async (req, res) => {
  try {
    const { userId } = req.body;
    
    const channel = await Channel.findById(req.params.id);
    
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'القناة غير موجودة'
      });
    }
    
    if (!channel.isPrivate) {
      return res.status(400).json({
        success: false,
        error: 'هذه القناة ليست خاصة'
      });
    }
    
    // Check permissions
    const server = await Server.findById(channel.server);
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لإضافة مستخدمين إلى القناة'
      });
    }
    
    // Check if user is already added
    if (channel.allowedUsers.includes(userId)) {
      return res.status(400).json({
        success: false,
        error: 'المستخدم مضاف بالفعل إلى القناة'
      });
    }
    
    // Add user to channel
    channel.allowedUsers.push(userId);
    await channel.save();
    
    res.json({
      success: true,
      message: 'تم إضافة المستخدم إلى القناة بنجاح',
      channel
    });
  } catch (error) {
    console.error('Add user to channel error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في إضافة المستخدم إلى القناة'
    });
  }
};

// Remove user from private channel
exports.removeUserFromChannel = async (req, res) => {
  try {
    const { userId } = req.body;
    
    const channel = await Channel.findById(req.params.id);
    
    if (!channel) {
      return res.status(404).json({
        success: false,
        error: 'القناة غير موجودة'
      });
    }
    
    if (!channel.isPrivate) {
      return res.status(400).json({
        success: false,
        error: 'هذه القناة ليست خاصة'
      });
    }
    
    // Check permissions
    const server = await Server.findById(channel.server);
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لإزالة مستخدمين من القناة'
      });
    }
    
    // Remove user from channel
    channel.allowedUsers = channel.allowedUsers.filter(
      id => id.toString() !== userId
    );
    
    await channel.save();
    
    res.json({
      success: true,
      message: 'تم إزالة المستخدم من القناة بنجاح',
      channel
    });
  } catch (error) {
    console.error('Remove user from channel error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في إزالة المستخدم من القناة'
    });
  }
};
