const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'اسم المستخدم مطلوب'],
    unique: true,
    trim: true,
    minlength: [3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'],
    maxlength: [20, 'اسم المستخدم يجب أن لا يتجاوز 20 حرف'],
    match: [/^[a-zA-Z0-9_]+$/, 'اسم المستخدم يجب أن يحتوي فقط على أحرف إنجليزية وأرقام وشرطات سفلية']
  },
  email: {
    type: String,
    required: [true, 'البريد الإلكتروني مطلوب'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: [validator.isEmail, 'بريد إلكتروني غير صحيح']
  },
  password: {
    type: String,
    required: [true, 'كلمة المرور مطلوبة'],
    minlength: [6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'],
    select: false
  },
  displayName: {
    type: String,
    trim: true,
    maxlength: [30, 'اسم العرض يجب أن لا يتجاوز 30 حرف'],
    default: function() {
      return this.username;
    }
  },
  avatar: {
    type: String,
    default: 'default-avatar.png'
  },
  status: {
    type: String,
    enum: {
      values: ['online', 'idle', 'dnd', 'offline'],
      message: 'الحالة غير صحيحة'
    },
    default: 'offline'
  },
  bio: {
    type: String,
    maxlength: [200, 'النبذة الشخصية يجب أن لا تتجاوز 200 حرف'],
    default: ''
  },
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  friendRequests: [{
    from: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    status: { 
      type: String, 
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending'
    },
    timestamp: { 
      type: Date, 
      default: Date.now 
    }
  }],
  servers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server'
  }],
  roles: [{
    server: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Server' 
    },
    role: { 
      type: String, 
      enum: ['owner', 'admin', 'moderator', 'member'],
      default: 'member'
    }
  }],
  settings: {
    theme: { 
      type: String, 
      enum: ['light', 'dark', 'auto'], 
      default: 'dark' 
    },
    language: { 
      type: String, 
      default: 'ar' 
    },
    notifications: { 
      type: Boolean, 
      default: true 
    },
    sound: {
      enabled: { type: Boolean, default: true },
      volume: { type: Number, default: 50, min: 0, max: 100 }
    }
  },
  lastSeen: {
    type: Date,
    default: Date.now
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
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Middleware لتحديث updatedAt
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Middleware لتشفير كلمة المرور
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Middleware لتحديث lastSeen
userSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Method لمقارنة كلمات المرور
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Virtual field for online status
userSchema.virtual('isOnline').get(function() {
  return this.status === 'online';
});

// Indexes for better performance
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ status: 1 });
userSchema.index({ 'roles.server': 1, 'roles.role': 1 });

module.exports = mongoose.model('User', userSchema);
