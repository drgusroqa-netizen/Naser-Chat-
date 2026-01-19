const Server = require('../models/Server');
const Channel = require('../models/Channel');
const User = require('../models/User');

// Create new server
exports.createServer = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'اسم الخادم مطلوب'
      });
    }
    
    // Create server
    const server = new Server({
      name,
      description: description || '',
      owner: req.user.id,
      members: [{
        user: req.user.id,
        role: 'owner',
        joinedAt: new Date()
      }]
    });
    
    // Create default channels
    const welcomeChannel = new Channel({
      name: 'الترحيب',
      server: server._id,
      type: 'text',
      category: 'النصية'
    });
    
    const generalChannel = new Channel({
      name: 'عام',
      server: server._id,
      type: 'text',
      category: 'النصية'
    });
    
    const voiceChannel = new Channel({
      name: 'غرفة صوتية عامة',
      server: server._id,
      type: 'voice',
      category: 'الصوتية'
    });
    
    // Save channels
    await Promise.all([
      welcomeChannel.save(),
      generalChannel.save(),
      voiceChannel.save()
    ]);
    
    // Add channels to server
    server.channels = [welcomeChannel._id, generalChannel._id, voiceChannel._id];
    server.categories = [
      {
        name: 'النصية',
        position: 0,
        channels: [welcomeChannel._id, generalChannel._id]
      },
      {
        name: 'الصوتية',
        position: 1,
        channels: [voiceChannel._id]
      }
    ];
    
    await server.save();
    
    // Add server to user's servers
    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        servers: server._id,
        roles: {
          server: server._id,
          role: 'owner'
        }
      }
    });
    
    // Populate server data
    const populatedServer = await Server.findById(server._id)
      .populate('owner', 'username displayName avatar')
      .populate('members.user', 'username displayName avatar status')
      .populate('channels');
    
    res.status(201).json({
      success: true,
      message: 'تم إنشاء الخادم بنجاح',
      server: populatedServer
    });
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في إنشاء الخادم'
    });
  }
};

// Get all servers for user
exports.getUserServers = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'servers',
      populate: [
        { path: 'owner', select: 'username displayName avatar' },
        { path: 'members.user', select: 'username displayName avatar status' },
        { path: 'channels' }
      ]
    });
    
    res.json({
      success: true,
      servers: user.servers
    });
  } catch (error) {
    console.error('Get user servers error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب الخوادم'
    });
  }
};

// Get server by ID
exports.getServer = async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
      .populate('owner', 'username displayName avatar')
      .populate('members.user', 'username displayName avatar status')
      .populate({
        path: 'channels',
        match: { isPrivate: false }
      });
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check if user is member
    const isMember = server.members.some(
      member => member.user._id.toString() === req.user.id.toString()
    );
    
    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: 'غير مصرح لك بالوصول إلى هذا الخادم'
      });
    }
    
    res.json({
      success: true,
      server
    });
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب الخادم'
    });
  }
};

// Update server
exports.updateServer = async (req, res) => {
  try {
    const { name, description } = req.body;
    
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check if user is owner
    if (server.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لتعديل هذا الخادم'
      });
    }
    
    // Update server
    if (name) server.name = name;
    if (description !== undefined) server.description = description;
    
    // Handle icon upload
    if (req.file) {
      server.icon = `/uploads/servers/${req.file.filename}`;
    }
    
    await server.save();
    
    res.json({
      success: true,
      message: 'تم تحديث الخادم بنجاح',
      server
    });
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في تحديث الخادم'
    });
  }
};

// Delete server
exports.deleteServer = async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check if user is owner
    if (server.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لحذف هذا الخادم'
      });
    }
    
    // Delete all channels
    await Channel.deleteMany({ server: server._id });
    
    // Remove server from all users
    await User.updateMany(
      { servers: server._id },
      { $pull: { servers: server._id } }
    );
    
    // Delete server
    await server.deleteOne();
    
    res.json({
      success: true,
      message: 'تم حذف الخادم بنجاح'
    });
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في حذف الخادم'
    });
  }
};

// Join server by invite code
exports.joinServer = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    
    if (!inviteCode) {
      return res.status(400).json({
        success: false,
        error: 'رمز الدعوة مطلوب'
      });
    }
    
    const server = await Server.findOne({ inviteCode });
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'رمز الدعوة غير صحيح'
      });
    }
    
    // Check if user is already a member
    const isMember = server.members.some(
      member => member.user.toString() === req.user.id.toString()
    );
    
    if (isMember) {
      return res.status(400).json({
        success: false,
        error: 'أنت بالفعل عضو في هذا الخادم'
      });
    }
    
    // Add user to server members
    server.members.push({
      user: req.user.id,
      role: 'member',
      joinedAt: new Date()
    });
    
    await server.save();
    
    // Add server to user's servers
    await User.findByIdAndUpdate(req.user.id, {
      $push: {
        servers: server._id,
        roles: {
          server: server._id,
          role: 'member'
        }
      }
    });
    
    // Emit socket event
    const io = req.app.get('io');
    io.emit('server_member_joined', {
      serverId: server._id,
      user: req.user
    });
    
    res.json({
      success: true,
      message: 'تم الانضمام إلى الخادم بنجاح',
      server
    });
  } catch (error) {
    console.error('Join server error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في الانضمام إلى الخادم'
    });
  }
};

// Leave server
exports.leaveServer = async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check if user is a member
    const memberIndex = server.members.findIndex(
      member => member.user.toString() === req.user.id.toString()
    );
    
    if (memberIndex === -1) {
      return res.status(400).json({
        success: false,
        error: 'أنت لست عضوًا في هذا الخادم'
      });
    }
    
    // Prevent owner from leaving (should transfer ownership first)
    if (server.members[memberIndex].role === 'owner') {
      return res.status(400).json({
        success: false,
        error: 'مالك الخادم لا يمكنه المغادرة'
      });
    }
    
    // Remove user from server members
    server.members.splice(memberIndex, 1);
    await server.save();
    
    // Remove server from user's servers
    await User.findByIdAndUpdate(req.user.id, {
      $pull: {
        servers: server._id,
        roles: { server: server._id }
      }
    });
    
    // Emit socket event
    const io = req.app.get('io');
    io.emit('server_member_left', {
      serverId: server._id,
      userId: req.user.id
    });
    
    res.json({
      success: true,
      message: 'تم مغادرة الخادم بنجاح'
    });
  } catch (error) {
    console.error('Leave server error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في مغادرة الخادم'
    });
  }
};

// Get server members
exports.getServerMembers = async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
      .populate('members.user', 'username displayName avatar status bio');
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    res.json({
      success: true,
      members: server.members
    });
  } catch (error) {
    console.error('Get server members error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في جلب أعضاء الخادم'
    });
  }
};

// Update member role
exports.updateMemberRole = async (req, res) => {
  try {
    const { memberId, role } = req.body;
    
    if (!memberId || !role) {
      return res.status(400).json({
        success: false,
        error: 'معرّف العضو والصلاحية مطلوبان'
      });
    }
    
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check if current user is owner or admin
    const currentMember = server.members.find(
      member => member.user.toString() === req.user.id.toString()
    );
    
    if (!currentMember || (currentMember.role !== 'owner' && currentMember.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لتعديل صلاحيات الأعضاء'
      });
    }
    
    // Find target member
    const targetMemberIndex = server.members.findIndex(
      member => member.user.toString() === memberId
    );
    
    if (targetMemberIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'العضو غير موجود في الخادم'
      });
    }
    
    // Prevent changing owner's role
    if (server.members[targetMemberIndex].role === 'owner') {
      return res.status(400).json({
        success: false,
        error: 'لا يمكن تغيير صلاحية مالك الخادم'
      });
    }
    
    // Update role
    server.members[targetMemberIndex].role = role;
    await server.save();
    
    // Update user's role in User collection
    await User.updateOne(
      { 
        _id: memberId,
        'roles.server': server._id 
      },
      { 
        $set: { 'roles.$.role': role } 
      }
    );
    
    res.json({
      success: true,
      message: 'تم تحديث صلاحية العضو بنجاح'
    });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في تحديث صلاحية العضو'
    });
  }
};

// Generate invite code
exports.generateInviteCode = async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check if user has permission
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية لإنشاء رمز دعوة'
      });
    }
    
    // Generate new invite code
    const crypto = require('crypto');
    server.inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    await server.save();
    
    res.json({
      success: true,
      inviteCode: server.inviteCode,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
  } catch (error) {
    console.error('Generate invite code error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في إنشاء رمز الدعوة'
    });
  }
};
