const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes
exports.protect = async (req, res, next) => {
  try {
    let token;
    
    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Check if token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'غير مصرح لك بالوصول إلى هذا المسار'
      });
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      req.user = await User.findById(decoded.userId).select('-password');
      
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'المستخدم غير موجود'
        });
      }
      
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'توكن غير صالح'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في المصادقة'
    });
  }
};

// Check user role
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'المستخدم غير مصرح له'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `دور المستخدم ${req.user.role} غير مصرح له بالوصول إلى هذا المسار`
      });
    }
    
    next();
  };
};

// Check server ownership
exports.checkServerOwner = async (req, res, next) => {
  try {
    const serverId = req.params.id || req.params.serverId;
    
    if (!serverId) {
      return next();
    }
    
    const Server = require('../models/Server');
    const server = await Server.findById(serverId);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check if user is server owner
    if (server.owner.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية للقيام بهذا الإجراء'
      });
    }
    
    req.server = server;
    next();
  } catch (error) {
    console.error('Check server owner error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في التحقق من صلاحية الخادم'
    });
  }
};

// Check server admin
exports.checkServerAdmin = async (req, res, next) => {
  try {
    const serverId = req.params.id || req.params.serverId;
    
    if (!serverId) {
      return next();
    }
    
    const Server = require('../models/Server');
    const server = await Server.findById(serverId);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Find user in server members
    const member = server.members.find(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!member) {
      return res.status(403).json({
        success: false,
        error: 'أنت لست عضوًا في هذا الخادم'
      });
    }
    
    // Check if user is admin or owner
    if (member.role !== 'admin' && member.role !== 'owner') {
      return res.status(403).json({
        success: false,
        error: 'ليس لديك صلاحية للقيام بهذا الإجراء'
      });
    }
    
    req.server = server;
    req.member = member;
    next();
  } catch (error) {
    console.error('Check server admin error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في التحقق من صلاحية الخادم'
    });
  }
};

// Check server member
exports.checkServerMember = async (req, res, next) => {
  try {
    const serverId = req.params.id || req.params.serverId || req.query.serverId;
    
    if (!serverId) {
      return next();
    }
    
    const Server = require('../models/Server');
    const server = await Server.findById(serverId);
    
    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'الخادم غير موجود'
      });
    }
    
    // Check if user is a member
    const isMember = server.members.some(
      m => m.user.toString() === req.user.id.toString()
    );
    
    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: 'أنت لست عضوًا في هذا الخادم'
      });
    }
    
    req.server = server;
    next();
  } catch (error) {
    console.error('Check server member error:', error);
    res.status(500).json({
      success: false,
      error: 'حدث خطأ في التحقق من عضوية الخادم'
    });
  }
};
