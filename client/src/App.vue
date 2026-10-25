<script setup>
import { ref, onMounted, computed } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import { authState, logout as authLogout } from "./store/auth";

const router = useRouter();
const isDark = ref(false);
const showGameDropdown = ref(false);

const GAME_MENU_ITEMS = [
  { name: 'Game 1: Wordle', path: '/wordle', active: true },
  { name: 'Game 2: Songless', path: '/songless', active: true },
  { name: 'Game 3: Soul Guard', path: '/soul-guard', active: true },
  { name: 'Game 4 (Sắp ra mắt)', path: '', active: false },
  { name: 'Game 5 (Sắp ra mắt)', path: '', active: false }
];

const toggleGameDropdown = () => {
  showGameDropdown.value = !showGameDropdown.value;
};

const closeGameDropdown = () => {
  showGameDropdown.value = false;
};

// State quản lý việc đóng/mở widget và Modal
const isProfileOpen = ref(false);
const activeModal = ref(null); // 'name' | 'password' | null
const currentUser = computed(() => authState.user);

// State cho Form Đổi tên
const newName = ref("");
const nameMsg = ref({ text: "", isError: false });
const isSubmittingName = ref(false);

// State cho Form Đổi mật khẩu
const currentPassword = ref("");
const newPassword = ref("");
const confirmNewPassword = ref("");
const passMsg = ref({ text: "", isError: false });
const isSubmittingPass = ref(false);

function toggleProfile() {
  isProfileOpen.value = !isProfileOpen.value;
}

function closeProfile() {
  isProfileOpen.value = false;
}

// Mở Modal
function openModal(type) {
  isProfileOpen.value = false;
  activeModal.value = type;
  if (type === 'name') {
    newName.value = currentUser.value?.fullName || "";
    nameMsg.value = { text: "", isError: false };
  } else if (type === 'password') {
    currentPassword.value = "";
    newPassword.value = "";
    confirmNewPassword.value = "";
    passMsg.value = { text: "", isError: false };
  }
}

function closeModal() {
  activeModal.value = null;
}

// Xử lý gọi API Đổi tên
async function handleUpdateName() {
  if (!newName.value.trim()) {
    nameMsg.value = { text: "Tên không được để trống.", isError: true };
    return;
  }
  isSubmittingName.value = true;
  nameMsg.value = { text: "", isError: false };

  try {
    const { data } = await axios.put("http://localhost:5000/api/auth/profile", {
      fullName: newName.value
    });
    if (data.success) {
      authState.user.fullName = data.user.fullName; // Cập nhật ngay lập tức trên UI
      nameMsg.value = { text: "Đổi tên thành công!", isError: false };
      setTimeout(() => closeModal(), 1000);
    }
  } catch (err) {
    nameMsg.value = { 
      text: err.response?.data?.message || "Lỗi khi cập nhật tên.", 
      isError: true 
    };
  } finally {
    isSubmittingName.value = false;
  }
}

// Xử lý gọi API Đổi mật khẩu
async function handleChangePassword() {
  if (!currentPassword.value || !newPassword.value || !confirmNewPassword.value) {
    passMsg.value = { text: "Vui lòng nhập đầy đủ các trường.", isError: true };
    return;
  }
  if (newPassword.value.length < 8) {
    passMsg.value = { text: "Mật khẩu mới phải từ 8 ký tự trở lên.", isError: true };
    return;
  }
  if (newPassword.value !== confirmNewPassword.value) {
    passMsg.value = { text: "Xác nhận mật khẩu mới không khớp.", isError: true };
    return;
  }

  isSubmittingPass.value = true;
  passMsg.value = { text: "", isError: false };

  try {
    const { data } = await axios.put("http://localhost:5000/api/auth/password", {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
      confirmNewPassword: confirmNewPassword.value
    });
    if (data.success) {
      passMsg.value = { text: "Đổi mật khẩu thành công!", isError: false };
      setTimeout(() => closeModal(), 1200);
    }
  } catch (err) {
    passMsg.value = { 
      text: err.response?.data?.message || "Lỗi khi đổi mật khẩu.", 
      isError: true 
    };
  } finally {
    isSubmittingPass.value = false;
  }
}

function applyTheme(dark) {
  const root = document.documentElement;
  if (dark) {
    root.classList.add("dark-mode");
  } else {
    root.classList.remove("dark-mode");
  }
}

function toggleTheme() {
  isDark.value = !isDark.value;
  localStorage.setItem("mindgarden_theme", isDark.value ? "dark" : "light");
  applyTheme(isDark.value);
}

onMounted(() => {
  const saved = localStorage.getItem("mindgarden_theme");
  isDark.value = saved === "dark";
  applyTheme(isDark.value);
});

async function handleLogout() {
  isProfileOpen.value = false;
  await authLogout(); 
}
</script>

<template>
  <div id="app" @click="closeAllMenus">
    <header
      v-if="authState.isAuthenticated"
      class="navbar glass"
      style="position: relative; z-index: 9999; overflow: visible;"
    >
      <div class="navbar-brand" @click="$router.push('/void')" style="cursor: pointer;">
        <span class="logo-icon"></span>
        <span class="logo-text">MindGarden</span>
      </div>

      <div class="nav-links">
        <!-- 1. The Void đặt làm tính năng chính đầu tiên -->
        <router-link to="/void" class="nav-link" @click="closeGameDropdown">
          The Void
        </router-link>

        <!-- 2. Menu Dropdown chứa 5 Game -->
        <div class="nav-dropdown-wrapper" @click.stop>
          <button
            type="button"
            class="nav-link dropdown-trigger"
            :class="{ 'router-link-active': ['/wordle', '/songless', '/soul-guard'].includes($route?.path) }"
            @click="toggleGameDropdown"
          >
            Games <span class="caret">▾</span>
          </button>

          <div v-if="showGameDropdown" class="games-dropdown-menu">
            <template v-for="(g, idx) in GAME_MENU_ITEMS" :key="idx">
              <router-link
                v-if="g.active"
                :to="g.path"
                class="dropdown-game-item"
                @click="closeGameDropdown"
              >
                {{ g.name }}
              </router-link>
              <span v-else class="dropdown-game-item disabled">
                {{ g.name }}
              </span>
            </template>
          </div>
        </div>

        <!-- 3. Bảng xếp hạng 5 Game -->
        <router-link to="/leaderboard" class="nav-link" @click="closeGameDropdown">
          Bảng xếp hạng
        </router-link>

        <!-- 4. AI Chat -->
        <router-link to="/chat" class="nav-link" @click="closeGameDropdown">
          Chat
        </router-link>
      </div>

      <div class="navbar-actions">
        <button class="theme-toggle" @click.stop="toggleTheme" :aria-label="'Toggle theme'">
          {{ isDark ? "🌙" : "☀️" }}
        </button>
        
        <div class="user-menu" @click.stop>
          <button class="user-icon-btn" @click="toggleProfile">
            👤
          </button>

          <div v-if="isProfileOpen" class="profile-widget glass">
            <div class="profile-header">
              <span class="profile-name">{{ currentUser?.fullName || 'User' }}</span>
              <span class="profile-email">{{ currentUser?.email }}</span>
            </div>
            
            <hr class="widget-divider" />
            
            <div class="widget-actions">
              <button v-if="currentUser?.role === 'admin'" class="widget-btn" @click="$router.push('/admin'); closeProfile()">
                Quản trị viên
              </button>
              <button class="widget-btn" @click="openModal('name')">Đổi tên hiển thị</button>
              <button class="widget-btn" @click="openModal('password')">Đổi mật khẩu</button>
              <button class="widget-btn logout-btn" @click="handleLogout">Đăng xuất</button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="app-content">
      <router-view />
    </main>

    <!-- MODAL ĐỔI TÊN HIỂN THỊ -->
    <div v-if="activeModal === 'name'" class="modal-overlay" @click="closeModal">
      <div class="modal-card glass" @click.stop>
        <h3>Đổi tên hiển thị</h3>
        <form @submit.prevent="handleUpdateName" class="modal-form">
          <div class="modal-input-group">
            <label>Tên mới của bạn</label>
            <input v-model="newName" type="text" placeholder="Nhập tên hiển thị..." :disabled="isSubmittingName" />
          </div>
          <p v-if="nameMsg.text" :class="nameMsg.isError ? 'msg-error' : 'msg-success'">
            {{ nameMsg.text }}
          </p>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeModal">Hủy</button>
            <button type="submit" class="btn-save" :disabled="isSubmittingName">
              {{ isSubmittingName ? "Đang lưu..." : "Lưu thay đổi" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL ĐỔI MẬT KHẨU -->
    <div v-if="activeModal === 'password'" class="modal-overlay" @click="closeModal">
      <div class="modal-card glass" @click.stop>
        <h3>Đổi mật khẩu</h3>
        <form @submit.prevent="handleChangePassword" class="modal-form">
          <div class="modal-input-group">
            <label>Mật khẩu hiện tại</label>
            <input v-model="currentPassword" type="password" placeholder="Nhập mật khẩu cũ" :disabled="isSubmittingPass" />
          </div>
          <div class="modal-input-group">
            <label>Mật khẩu mới</label>
            <input v-model="newPassword" type="password" placeholder="Tối thiểu 8 ký tự" :disabled="isSubmittingPass" />
          </div>
          <div class="modal-input-group">
            <label>Xác nhận mật khẩu mới</label>
            <input v-model="confirmNewPassword" type="password" placeholder="Nhập lại mật khẩu mới" :disabled="isSubmittingPass" />
          </div>
          <p v-if="passMsg.text" :class="passMsg.isError ? 'msg-error' : 'msg-success'">
            {{ passMsg.text }}
          </p>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeModal">Hủy</button>
            <button type="submit" class="btn-save" :disabled="isSubmittingPass">
              {{ isSubmittingPass ? "Đang xử lý..." : "Cập nhật" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style>

.navbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  margin: 0.75rem;
  border-radius: 16px;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.logo-icon { font-size: 1.4rem; }

.navbar-links {
  display: flex;
  gap: 1.25rem;
  overflow-x: auto;
  white-space: nowrap;
  flex: 1;
  margin: 0 1rem;
  scrollbar-width: none;
}
.navbar-links::-webkit-scrollbar { display: none; }

.nav-link {
  flex-shrink: 0;
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  padding: 0.4rem 0.6rem;
  border-radius: 8px;
  transition: background 0.2s ease, color 0.2s ease;
}
.nav-link:hover { background: var(--surface-strong); color: var(--text-primary); }
.nav-link.router-link-active { color: var(--accent); background: var(--surface-strong); }

.navbar-actions { display: flex; align-items: center; gap: 0.75rem; }

.theme-toggle, .user-icon-btn {
  background: var(--surface-strong);
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  cursor: pointer;
  transition: background 0.2s;
}
.theme-toggle:hover, .user-icon-btn:hover { background: var(--border-color); }

.app-content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

.user-menu { position: relative; }

.profile-widget {
  position: absolute;
  top: 130%;
  right: 0;
  width: 240px;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  z-index: 100;
  background: var(--bg-color);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
}

.profile-header { display: flex; flex-direction: column; margin-bottom: 0.5rem; }
.profile-name { font-weight: 700; font-size: 1rem; color: var(--text-primary); }
.profile-email { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.widget-divider { border: 0; border-top: 1px solid var(--border-color); margin: 0.5rem 0; }
.widget-actions { display: flex; flex-direction: column; gap: 0.2rem; }

.widget-btn {
  background: transparent;
  border: none;
  text-align: left;
  padding: 0.6rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}
.widget-btn:hover { background: var(--surface-strong); color: var(--text-primary); }
.logout-btn { color: var(--danger, #ef4444); }
.logout-btn:hover { background: var(--danger, #ef4444); color: white; }

/* --- CSS MỚI CHO MODAL --- */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  padding: 1rem;
}

.modal-card {
  width: 100%;
  max-width: 380px;
  padding: 1.5rem;
  border-radius: 16px;
  background: var(--bg-color);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.modal-card h3 {
  margin: 0 0 1.2rem;
  color: var(--text-primary);
  font-size: 1.2rem;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.modal-input-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.modal-input-group input {
  padding: 0.65rem 0.9rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--surface-strong);
  color: var(--text-primary);
  font-size: 0.95rem;
}

.msg-error { color: #ef4444; font-size: 0.85rem; margin: 0; }
.msg-success { color: #10b981; font-size: 0.85rem; margin: 0; font-weight: 600; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

.btn-cancel {
  padding: 0.55rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 600;
}

.btn-save {
  padding: 0.55rem 1.2rem;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-weight: 600;
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* QUAN TRỌNG: Đặt z-index cao cho toàn bộ thanh Header/Navbar để menu con luôn nằm trên cùng */
header, .navbar, .app-header {
  position: relative !important;
  z-index: 1000 !important;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.nav-dropdown-wrapper {
  position: relative;
}

.dropdown-trigger {
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 8px;
}

.caret {
  font-size: 0.75rem;
  opacity: 0.8;
}

/* Menu xổ xuống của 5 Game & Menu User luôn nổi lên trên mọi thành phần */
.games-dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 200px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.65);
  z-index: 9999;
}

.dropdown-game-item {
  padding: 9px 12px;
  border-radius: 8px;
  color: #e2e8f0;
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 600;
  transition: background 0.15s;
  text-align: left;
}

.dropdown-game-item:hover {
  background: rgba(59, 130, 246, 0.25);
  color: #ffffff;
}

.dropdown-game-item.disabled {
  color: #64748b;
  cursor: not-allowed;
  font-weight: 500;
}

/* Tối ưu hiển thị trên màn hình điện thoại hẹp */
@media (max-width: 640px) {
  .nav-links {
    gap: 4px;
  }
  .nav-item, .dropdown-trigger {
    padding: 5px 8px;
    font-size: 0.82rem;
  }
}

/* Ép thanh điều hướng luôn nằm ở tầng cao nhất trên toàn trang web */
header.navbar {
  position: relative !important;
  z-index: 9999 !important;
  overflow: visible !important;
}

/* Đảm bảo cả menu Games và menu Tài khoản đều có nền đặc, không bị xuyên thấu */
.games-dropdown-menu,
.profile-widget {
  position: absolute !important;
  z-index: 10000 !important;
  background: #0f172a !important;
  backdrop-filter: none !important;
  border: 1px solid rgba(255, 255, 255, 0.16) !important;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.75) !important;
}
</style>