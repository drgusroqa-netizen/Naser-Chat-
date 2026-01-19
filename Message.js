const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'محتوى الرسالة مطلوب'],
    maxlength: [2000, 'الرسالة يجب أن لا تتجاوز 2000 حرف'],
    trim: true
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: [true, 'القناة مطلوبة'],
    index: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'المرسل مطلوب']
  },
  attachments: [{
    url: {
      type: String,
      required: true
    },
    filename: {
      type: String,
      required: true
    },
    filetype: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    width: Number,
    height: Number,
    duration: Number, // للملفات الصوتية/المرئية
    thumbnail: String
  }],
  embeds: [{
    title: String,
    description: String,
    url: String,
    color: String,
    fields: [{
      name: String,
      value: String,
      inline: {
        type: Boolean,
        default: false
      }
    }],
    image: { url: String },
    thumbnail: { url: String },
    footer: { 
      text: String, 
      icon_url: String 
    },
    timestamp: Date,
    provider: {
      name: String,
      url: String
    }
  }],
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  mentionRoles: [String],
  mentionEveryone: {
    type: Boolean,
    default: false
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  pinned: {
    type: Boolean,
    default: false
  },
  pinnedAt: {
    type: Date
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reactions: [{
    emoji: {
      type: String,
      required: true
    },
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    count: {
      type: Number,
      default: 1,
      min: 1
    }
  }],
  reference: {
    messageId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Message' 
    },
    channelId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Channel' 
    },
    guildId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Server' 
    }
  },
  webhookId: String,
  system: {
    type: Boolean,
    default: false
  },
  systemType: String,
  nonce: String,
  flags: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  tts: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Middleware لتحديث آخر رسالة في القناة
messageSchema.post('save', async function() {
  try {
    const Channel = mongoose.model('Channel');
    await Channel.findByIdAndUpdate(this.channel, {
      lastMessage: this._id,
      $inc: { messageCount: 1 }
    });

    // تحديث إحصائيات الخادم
    const channel = await Channel.findById(this.channel).select('server');
    if (channel && channel.server) {
      const Server = mongoose.model('Server');
      await Server.findByIdAndUpdate(channel.server, {
        $inc: { 'stats.messageCount': 1 }
      });
    }
  } catch (error) {
    console.error('Error updating channel last message:', error);
  }
});

// Method لإضافة رد فعل
messageSchema.methods.addReaction = async function(emoji, userId) {
  const reactionIndex = this.reactions.findIndex(r => r.emoji === emoji);
  
  if (reactionIndex > -1) {
    const reaction = this.reactions[reactionIndex];
    
    // التحقق إذا كان المستخدم قد تفاعل مسبقاً
    const hasReacted = reaction.users.some(id => id.toString() === userId.toString());
    if (!hasReacted) {
      reaction.users.push(userId);
      reaction.count++;
      await this.save();
      return { added: true, reaction };
    }
    return { added: false, message: 'لقد تفاعلت مسبقاً' };
  } else {
    // إضافة رد فعل جديد
    this.reactions.push({
      emoji,
      users: [userId],
      count: 1
    });
    await this.save();
    return { added: true, reaction: this.reactions[this.reactions.length - 1] };
  }
};

// Method لإزالة رد فعل
messageSchema.methods.removeReaction = async function(emoji, userId) {
  const reactionIndex = this.reactions.findIndex(r => r.emoji === emoji);
  
  if (reactionIndex > -1) {
    const reaction = this.reactions[reactionIndex];
    const userIndex = reaction.users.findIndex(id => id.toString() === userId.toString());
    
    if (userIndex > -1) {
      reaction.users.splice(userIndex, 1);
      reaction.count--;
      
      if (reaction.count === 0) {
        this.reactions.splice(reactionIndex, 1);
      }
      
      await this.save();
      return { removed: true };
    }
  }
  
  return { removed: false, message: 'لم تجد رد الفعل' };
};

// Virtual field for formatted time
messageSchema.virtual('formattedTime').get(function() {
  return this.timestamp.toLocaleTimeString('ar-SA', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
});

messageSchema.virtual('formattedDate').get(function() {
  return this.timestamp.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Indexes for better query performance
messageSchema.index({ channel: 1, timestamp: -1 });
messageSchema.index({ author: 1 });
messageSchema.index({ pinned: 1 });
messageSchema.index({ 'mentions': 1 });
messageSchema.index({ timestamp: -1 });
messageSchema.index({ 'reactions.emoji': 1 });

module.exports = mongoose.model('Message', userSchema);
