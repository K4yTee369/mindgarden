const express = require('express');
const router = express.Router();
const { 
  getAllUsers, deleteUser, deleteVoidPost, updateUserRole, getAllAdminVoidPosts, approveVoidPost 
} = require('../controllers/admin.controller');

const { authenticate } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');

router.use(authenticate, requireAdmin);

router.get('/users', getAllUsers);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/role', updateUserRole);

router.delete('/void/:id', deleteVoidPost);
// Định nghĩa chuẩn xác route /void/all
router.get('/void/all', getAllAdminVoidPosts); 
router.put('/void/:id/approve', approveVoidPost);

module.exports = router;