const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'اسم القناة مطلوب'],
    trim: true,
    maxlength: [100, 'اسم القناة يجب أن لا يتجاوز 100 حرف']
  },
  type: {
    type: String,
    enum: {
      values: ['text', 'voice', 'announcement', 'category'],
      message: 'نوع القناة غير صحيح'
    },
    default: 'text'
  },
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: [true, 'الخادم مطلوب']
  },
  category: {
    type: String,
    default: 'غير مصنف'
  },
  position: {
    type: Number,
    default: 0
  },
  topic: {
    type: String,
    maxlength: [1000, 'موضوع القناة يجب أن لا يتجاوز 1000 حرف'],
    default: ''
  },
  permissions: [{
    role: { 
      type: String,
      required: true 
    },
    allow: [{
      type: String,
      enum: ['view', 'send_messages', 'manage_messages', 'connect', 'speak']
    }],
    deny: [{
      type: String,
      enum: ['view', 'send_messages', 'manage_messages', 'connect', 'speak']
    }]
  }],
  isPrivate: {
    type: Boolean,
    default: false
  },
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  messageCount: {
    type: Number,
    default: 0
  },
  voiceSettings: {
    maxUsers: { 
      type: Number, 
      default: 25, 
      min: 1, 
      max: 99 
    },
    bitrate: { 
      type: Number, 
      default: 64000, 
      min: 8000, 
      max: 384000 
    },
    userLimit: {
      type: Number,
      default: 0,
      min: 0,
      max: 99
    }
  },
  nsfw: {
    type: Boolean,
    default: false
  },
  slowmode: {
    enabled: { type: Boolean, default: false },
    delay: { type: Number, default: 0, min: 0, max: 21600 } // ثواني
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

// تحديث updatedAt
channelSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Method للتحقق من الصلاحيات
channelSchema.methods.canView = function(userId, userRole) {
  if (!this.isPrivate) return true;
  
  return this.allowedUsers.some(user => 
    user.toString() === userId.toString()
  ) || userRole === 'admin' || userRole === 'owner';
};

// Method للتحقق من إمكانية الإرسال
channelSchema.methods.canSendMessage = function(userId, lastMessageTime) {
  if (this.slowmode.enabled && lastMessageTime) {
    const cooldownTime = lastMessageTime.getTime() + (this.slowmode.delay * 1000);
    if (Date.now() < cooldownTime) {
      return false;
    }
  }
  
  if (this.isPrivate) {
    return this.allowedUsers.some(user => 
      user.toString() === userId.toString()
    );
  }
  
  return true;
};

// Indexes
channelSchema.index({ server: 1, position: 1 });
channelSchema.index({ server: 1, type: 1 });
channelSchema.index({ server: 1, category: 1 });
channelSchema.index({ lastMessage: -1 });
channelSchema.index({ 'allowedUsers': 1 });

module.exports = mongoose.model('Channel', channelSchema);
