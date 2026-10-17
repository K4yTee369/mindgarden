const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const register = async (req, res) => {
  try {
    const { fullName, email, password, confirmPassword } = req.body;

    // Backend Validation
    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: "Please fill in all the information.." });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Confirm password does not match." });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long." });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "This email is already in use!" });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullName,
      email,
      passwordHash
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: "Registration successful",
      user: { id: newUser._id, fullName: newUser.fullName, email: newUser.email }
    });
  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please enter Email and Password." });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid Email or Password." });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Invalid Email or Password." });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET || 'secret_key_tam_thoi',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: { id: user._id, fullName: user.fullName, email: user.email }
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    res.json({
      success: true,
      user: { id: user._id, fullName: user.fullName, email: user.email, role: user.role } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const logout = (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
};


const updateProfile = async (req, res) => {
  try {
    const { fullName } = req.body;
    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: "Tên hiển thị không được để trống." });
    }
    if (fullName.trim().length < 2) {
      return res.status(400).json({ success: false, message: "Tên hiển thị phải có ít nhất 2 ký tự." });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.userId,
      { fullName: fullName.trim() },
      { new: true }
    ).select('-passwordHash');

    res.json({
      success: true,
      message: "Cập nhật tên thành công!",
      user: { id: updatedUser._id, fullName: updatedUser.fullName, email: updatedUser.email }
    });
  } catch (err) {
    console.error("Update Profile Error:", err);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi cập nhật tên." });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({ success: false, message: "Vui lòng điền đầy đủ thông tin." });
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ success: false, message: "Mật khẩu mới xác nhận không khớp." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "Mật khẩu mới phải có ít nhất 8 ký tự." });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy người dùng." });
    }

    // Kiểm tra mật khẩu cũ có đúng không
    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Mật khẩu hiện tại không chính xác." });
    }

    // Mã hóa và lưu mật khẩu mới
    const salt = await bcrypt.genSalt(12);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ success: true, message: "Đổi mật khẩu thành công!" });
  } catch (err) {
    console.error("Change Password Error:", err);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi đổi mật khẩu." });
  }
};

// Cập nhật lại dòng module.exports ở cuối file:
module.exports = { register, login, getMe, logout, updateProfile, changePassword };