const express = require('express');
const router = express.Router();
const { 
  register, 
  login, 
  getMe, 
  logout, 
  updateProfile, 
  changePassword 
} = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authenticate, getMe);

// 2 Route mới cho người dùng cập nhật thông tin
router.put('/profile', authenticate, updateProfile);
router.put('/password', authenticate, changePassword);

module.exports = router;