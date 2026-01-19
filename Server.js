const mongoose = require('mongoose');

const serverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'اسم الخادم مطلوب'],
    trim: true,
    maxlength: [100, 'اسم الخادم يجب أن لا يتجاوز 100 حرف']
  },
  description: {
    type: String,
    maxlength: [500, 'وصف الخادم يجب أن لا يتجاوز 500 حرف'],
    default: ''
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'مالك الخادم مطلوب']
  },
  icon: {
    type: String,
    default: 'default-server-icon.png'
  },
  banner: {
    type: String
  },
  inviteCode: {
    type: String,
    unique: true,
    sparse: true
  },
  members: [{
    user: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User',
      required: true 
    },
    joinedAt: { 
      type: Date, 
      default: Date.now 
    },
    role: { 
      type: String, 
      enum: ['admin', 'moderator', 'member'], 
      default: 'member' 
    },
    nickname: {
      type: String,
      maxlength: 30
    }
  }],
  channels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel'
  }],
  categories: [{
    name: {
      type: String,
      required: true,
      maxlength: 50
    },
    position: {
      type: Number,
      default: 0
    },
    channels: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Channel' 
    }]
  }],
  settings: {
    verificationLevel: { 
      type: Number, 
      default: 0, 
      min: 0, 
      max: 4 
    },
    defaultNotifications: { 
      type: String, 
      enum: ['all', 'mentions', 'none'], 
      default: 'all' 
    },
    public: {
      type: Boolean,
      default: false
    },
    region: {
      type: String,
      default: 'me-central-1'
    }
  },
  stats: {
    memberCount: {
      type: Number,
      default: 1
    },
    messageCount: {
      type: Number,
      default: 0
    },
    voiceMinutes: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// توليد رمز الدعوة تلقائياً
serverSchema.pre('save', function(next) {
  if (!this.inviteCode && this.settings.public) {
    const crypto = require('crypto');
    this.inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  next();
});

// تحديث عدد الأعضاء
serverSchema.pre('save', function(next) {
  if (this.members && Array.isArray(this.members)) {
    this.stats.memberCount = this.members.length;
  }
  next();
});

// تحديث updatedAt
serverSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method للتحقق من صلاحيات المستخدم
serverSchema.methods.hasPermission = function(userId, permission) {
  const member = this.members.find(m => m.user.toString() === userId.toString());
  if (!member) return false;

  const permissions = {
    'member': ['view', 'send_messages'],
    'moderator': ['view', 'send_messages', 'manage_messages', 'kick_members'],
    'admin': ['view', 'send_messages', 'manage_messages', 'kick_members', 'ban_members', 'manage_channels'],
    'owner': ['view', 'send_messages', 'manage_messages', 'kick_members', 'ban_members', 'manage_channels', 'manage_server']
  };

  return permissions[member.role]?.includes(permission) || false;
};

// Indexes
serverSchema.index({ name: 'text', description: 'text' });
serverSchema.index({ inviteCode: 1 });
serverSchema.index({ 'members.user': 1 });
serverSchema.index({ owner: 1 });
serverSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Server', serverSchema);
