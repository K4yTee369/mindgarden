const User = require('../models/User');
const VoidPost = require('../models/VoidPost');

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi tải người dùng" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (userId === req.user.userId) return res.status(400).json({ success: false, message: "Không thể tự xóa!" });
    await User.findByIdAndDelete(userId);
    res.json({ success: true, message: "Đã xóa" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi xóa người dùng" });
  }
};

const deleteVoidPost = async (req, res) => {
  try {
    await VoidPost.findOneAndDelete({ id: req.params.id });
    res.json({ success: true, message: "Đã xóa bài" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi xóa bài" });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    res.json({ success: true, role: user.role });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi cập nhật quyền" });
  }
};

// Hàm lấy TOÀN BỘ bài đăng
const getAllAdminVoidPosts = async (req, res) => {
  try {
    const posts = await VoidPost.find().sort({ createdAt: -1 });
    res.json({ success: true, posts });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi tải bài viết" });
  }
};

const approveVoidPost = async (req, res) => {
  try {
    const post = await VoidPost.findOneAndUpdate(
      { id: req.params.id }, 
      { status: 'admin_approved' }, 
      { new: true }
    );
    res.json({ success: true, post });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi duyệt bài" });
  }
};

module.exports = { 
  getAllUsers, deleteUser, deleteVoidPost, updateUserRole, getAllAdminVoidPosts, approveVoidPost 
};