<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const activeTab = ref('overview');

const stats = ref({ users: 0, posts: 0, comments: 0 });
const usersList = ref([]);
const voidPosts = ref([]);
const isLoading = ref(true);

// Cấu hình chung cho header chứa Token
const getAuthConfig = () => {
  const token = localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

// Hàm tự động kiểm tra và nối URL chính xác
const getImageUrl = (imgPath) => {
  if (!imgPath) return '';
  // Nếu ảnh đã là chuỗi Base64 hoặc link http đầy đủ thì giữ nguyên
  if (imgPath.startsWith('data:') || imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
    return imgPath;
  }
  // Xóa dấu / thừa ở đầu nếu có rồi nối với API_BASE_URL
  const cleanPath = imgPath.replace(/^\/+/, '');
  return `${API_BASE_URL}/${cleanPath}`;
};

const fetchAdminData = async () => {
  isLoading.value = true;
  try {
    const config = getAuthConfig();

    // 1. Gọi API lấy bài viết
    const { data: postsRes } = await axios.get('http://localhost:5000/api/admin/void/all', config);
    if (postsRes.success) {
      voidPosts.value = postsRes.posts;
      
      // Tính số bài pending
      stats.value.posts = postsRes.posts.filter(p => p.status === 'pending').length; 
      // Tính tổng số bình luận
      stats.value.comments = postsRes.posts.reduce((acc, post) => acc + (post.comments?.length || 0), 0);
    }

    // 2. Gọi API lấy người dùng
    const { data: usersRes } = await axios.get('http://localhost:5000/api/admin/users', config);
    if (usersRes.success) {
      // Đã sửa: usersList thay vì users
      usersList.value = usersRes.users;
      stats.value.users = usersList.value.length;
    }

  } catch (error) {
    console.error("Lỗi lấy dữ liệu admin:", error);
    if (error.response?.status === 401 || error.response?.status === 403) {
      alert("Phiên đăng nhập hết hạn hoặc bạn không có quyền Admin!");
    }
  } finally {
    isLoading.value = false;
  }
};

const handleDeleteUser = async (userId) => {
  if (confirm('Bạn có chắc chắn muốn xóa người dùng này vĩnh viễn?')) {
    try {
      // Đã thêm config token
      await axios.delete(`http://localhost:5000/api/admin/users/${userId}`, getAuthConfig());
      usersList.value = usersList.value.filter(u => u._id !== userId);
      stats.value.users--;
    } catch (error) {
      alert(error.response?.data?.message || "Lỗi khi xóa người dùng.");
    }
  }
};

const handleDeletePost = async (postId) => {
  if (confirm('Bạn có chắc chắn muốn gỡ bài đăng này khỏi hệ thống?')) {
    try {
      // Đã thêm config token
      await axios.delete(`http://localhost:5000/api/admin/void/${postId}`, getAuthConfig());
      voidPosts.value = voidPosts.value.filter(p => p.id !== postId);
      
      // Tính lại số bài pending
      stats.value.posts = voidPosts.value.filter(p => p.status === 'pending').length;
    } catch (error) {
      alert("Lỗi khi xóa bài đăng.");
    }
  }
};

const handleApprovePost = async (postId) => {
  if (confirm('Cho phép bài đăng này hiển thị trên The Void?')) {
    try {
      // Đã thêm config token
      await axios.put(
        `http://localhost:5000/api/admin/void/${postId}/approve`, 
        {}, 
        getAuthConfig()
      );
      
      const post = voidPosts.value.find(p => p.id === postId);
      if (post) post.status = 'admin_approved';
      
      stats.value.posts = voidPosts.value.filter(p => p.status === 'pending').length;
    } catch (error) {
      console.error(error);
      alert("Lỗi khi duyệt bài.");
    }
  }
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('vi-VN');
};

onMounted(() => {
  fetchAdminData();
});
</script>

<template>
  <div class="admin-container">
    <!-- Sidebar Quản trị -->
    <aside class="admin-sidebar glass">
      <h2 class="sidebar-title">Admin Panel</h2>
      <nav class="sidebar-nav">
        <button 
          class="nav-btn" 
          :class="{ active: activeTab === 'overview' }" 
          @click="activeTab = 'overview'"
        >
          Tổng quan
        </button>
        <button 
          class="nav-btn" 
          :class="{ active: activeTab === 'users' }" 
          @click="activeTab = 'users'"
        >
          Người dùng
        </button>
        <button 
          class="nav-btn" 
          :class="{ active: activeTab === 'void' }" 
          @click="activeTab = 'void'"
        >
          Kiểm duyệt Void
        </button>
      </nav>
    </aside>

    <!-- Nội dung chính -->
    <main class="admin-main glass">
      
      <!-- TAB TỔNG QUAN -->
      <section v-if="activeTab === 'overview'" class="tab-content">
        <h3 class="section-title">Thống kê hệ thống</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-icon"></span>
            <div class="stat-info">
              <h4>Người dùng</h4>
              <p class="stat-number">{{ stats.users }}</p>
            </div>
          </div>
          <div class="stat-card">
            <span class="stat-icon"></span>
            <div class="stat-info">
              <h4>Bài đăng</h4>
              <p class="stat-number">{{ stats.posts }}</p>
            </div>
          </div>
          <div class="stat-card">
            <span class="stat-icon"></span>
            <div class="stat-info">
              <h4>Bình luận</h4>
              <p class="stat-number">{{ stats.comments }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- TAB NGƯỜI DÙNG -->
      <section v-if="activeTab === 'users'" class="tab-content">
        <h3 class="section-title">Quản lý Người dùng</h3>
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Phân quyền</th>
                <th>Ngày tham gia</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="user in usersList" :key="user._id">
                <td class="font-bold">{{ user.fullName }}</td>
                <td>{{ user.email }}</td>
                <td>
                  <span class="role-badge" :class="user.role">{{ user.role }}</span>
                </td>
                <td>{{ formatDate(user.createdAt) }}</td>
                <td>
                  <button class="action-btn delete-btn" @click="handleDeleteUser(user._id)" :disabled="user.role === 'admin'">
                    Xóa
                  </button>
                </td>
              </tr>
              <tr v-if="usersList.length === 0">
                <td colspan="5" class="text-center">Không có dữ liệu</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- TAB KIỂM DUYỆT VOID -->
      <section v-if="activeTab === 'void'" class="tab-content">
        <h3 class="section-title">Kiểm duyệt Nội dung (The Void)</h3>
        <div class="table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Tác giả</th>
                <th>Nội dung</th>
                <th>Trạng thái</th>
                <th>Ảnh</th>
                <th>Hành động</th>
              </tr>
            </thead>
          <tbody>
          <tr v-for="post in voidPosts" :key="post.id">
            <td>#{{ post.id }}</td>
            <td>{{ post.author }}</td>
            <td class="content-cell">{{ post.content || '(Không có nội dung)' }}</td>
            
            <!-- Hiển thị Trạng thái -->
            <td>
              <span class="status-badge" :class="post.status">
                {{ 
                  post.status === 'ai_approved' || post.status === 'approved' ? 'AI Duyệt' : 
                  post.status === 'admin_approved' ? 'Admin Duyệt' : 'Bị từ chối' 
                }}
              </span>
            </td>

<!-- Hiển thị Ảnh dưới dạng Thumbnail -->
            <td>
              <div v-if="post.images && post.images.length > 0" class="admin-image-gallery">
                <a
                  v-for="(img, idx) in post.images"
                  :key="idx"
                  :href="getImageUrl(img)"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Nhấn để xem ảnh lớn"
                >
                  <img :src="getImageUrl(img)" alt="Void Attachment" class="admin-thumb" />
                </a>
              </div>
              <span v-else class="text-gray">0 ảnh</span>
            </td>
            
            <!-- Nút Hành động logic -->
            <td>
              <div class="action-buttons">
                <!-- Nút duyệt CHỈ HIỆN khi trạng thái là pending -->
                <button 
                  v-if="post.status === 'pending'" 
                  class="action-btn promote-btn" 
                  @click="handleApprovePost(post.id)">
                  Duyệt thủ công
                </button>
                <!-- Nút xóa (gỡ) luôn hiện để admin có quyền xóa bất cứ bài nào -->
                <button class="action-btn delete-btn" @click="handleDeletePost(post.id)">
                  Xóa (Gỡ)
                </button>
              </div>
            </td>
          </tr>
        </tbody>
          </table>
        </div>
      </section>

    </main>
  </div>
</template>

<style scoped>
/* Container Layout Flexbox 100% chiều cao */
.admin-container {
  display: flex;
  height: 100%;
  padding: 1rem;
  gap: 1rem;
  overflow: hidden;
}

/* Sidebar Quản trị */
.admin-sidebar {
  width: 250px;
  flex-shrink: 0;
  border-radius: 12px;
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
}

.sidebar-title {
  margin: 0 0 1.5rem 0;
  color: var(--text-primary);
  font-size: 1.25rem;
  text-align: center;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.nav-btn {
  background: transparent;
  border: none;
  text-align: left;
  padding: 0.8rem 1rem;
  border-radius: 8px;
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}

.nav-btn:hover {
  background: var(--surface-strong);
  color: var(--text-primary);
}

.nav-btn.active {
  background: var(--accent);
  color: white;
}

/* Nội dung chính */
.admin-main {
  flex: 1;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* Không scroll toàn thẻ main */
}

.tab-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.section-title {
  margin: 0 0 1.5rem 0;
  color: var(--text-primary);
  font-size: 1.5rem;
}

/* Lưới Thống kê */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  background: var(--surface-strong);
  border: 1px solid var(--border-color);
  padding: 1.5rem;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.stat-icon {
  font-size: 2.5rem;
}

.stat-info h4 {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.stat-number {
  margin: 0;
  font-size: 1.5rem;
  font-weight: bold;
  color: var(--text-primary);
}

/* Bảng Dữ liệu */
.table-container {
  flex: 1;
  overflow-y: auto; /* Chỉ scroll nội dung bảng */
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-color);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.admin-table th, .admin-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.admin-table th {
  background: var(--surface-strong);
  position: sticky;
  top: 0;
  font-weight: 600;
  z-index: 1;
}

.font-bold {
  font-weight: 600;
}

.truncate-text {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.text-center {
  text-align: center;
}

/* Badges & Buttons */
.role-badge {
  padding: 0.3rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: bold;
  text-transform: uppercase;
}

.role-badge.admin {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.role-badge.user {
  background: rgba(99, 102, 241, 0.2);
  color: #6366f1;
}

.action-btn {
  padding: 0.4rem 0.8rem;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  font-size: 0.8rem;
}

.delete-btn {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
  border: 1px solid #ef4444;
}

.delete-btn:hover:not(:disabled) {
  background: #ef4444;
  color: white;
}

.delete-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  border-color: var(--text-muted);
  color: var(--text-muted);
}

.status-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
}

.status-badge.ai_approved, .status-badge.approved {
  background: rgba(46, 204, 113, 0.15); color: #2ecc71;
}
.status-badge.admin_approved {
  background: rgba(52, 152, 219, 0.15); color: #3498db;
}
.status-badge.pending {
  background: rgba(231, 76, 60, 0.15); color: #e74c3c;
}

.admin-image-gallery {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  max-width: 120px; /* Giới hạn độ rộng cột */
}
.admin-thumb {
  width: 35px;
  height: 35px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  transition: transform 0.2s ease;
  cursor: zoom-in;
}
.admin-thumb:hover {
  transform: scale(1.5);
  border-color: #3498db;
}
.text-gray {
  color: #888;
  font-size: 0.9em;
}
</style>