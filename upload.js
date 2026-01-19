const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const createUploadsDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/';
    
    // Determine upload directory based on file type
    if (file.fieldname === 'avatar') {
      uploadPath = 'uploads/avatars/';
    } else if (file.fieldname === 'serverIcon') {
      uploadPath = 'uploads/servers/';
    } else if (file.fieldname === 'attachment') {
      uploadPath = 'uploads/attachments/';
    }
    
    createUploadsDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('نوع الملف غير مسموح به'), false);
  }
};

// Configure upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 // 5MB default
  },
  fileFilter: fileFilter
});

// Middleware for single file upload
exports.uploadSingle = (fieldName) => {
  return upload.single(fieldName);
};

// Middleware for multiple files upload
exports.uploadMultiple = (fieldName, maxCount = 10) => {
  return upload.array(fieldName, maxCount);
};

// Middleware for handling upload errors
exports.handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'حجم الملف كبير جداً'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'تم تجاوز الحد الأقصى لعدد الملفات'
      });
    }
    return res.status(400).json({
      success: false,
      error: 'حدث خطأ في رفع الملف'
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
  next();
};

// Delete file middleware
exports.deleteFile = (filePath) => {
  return (req, res, next) => {
    if (req.file && req.file.path) {
      // Store old file path for deletion after successful update
      req.oldFilePath = req.file.path;
    }
    next();
  };
};

// Clean up old file after successful update
exports.cleanupOldFile = async (req, res, next) => {
  try {
    if (req.oldFilePath && fs.existsSync(req.oldFilePath)) {
      fs.unlinkSync(req.oldFilePath);
    }
    next();
  } catch (error) {
    console.error('Error cleaning up old file:', error);
    next();
  }
};
