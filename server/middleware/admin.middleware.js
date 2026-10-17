const User = require('../models/User');

const requireAdmin = async (req, res, next) => {
  try {
    // req.user đã được tạo ra từ middleware authenticate trước đó
    const user = await User.findById(req.user.userId);
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ success: false, message: "Truy cập bị từ chối. Cần quyền Admin!" });
    }
    
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi kiểm tra quyền hạn." });
  }
};

module.exports = { requireAdmin };