<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import axios from "axios";
import { authState, logout as authLogout } from "./store/auth";

const router = useRouter();
const route = useRoute();

const isDark = ref(false);
const showGameDropdown = ref(false);
const hasToken = ref(!!localStorage.getItem("token"));

// Luôn kiểm tra trạng thái đăng nhập từ cả authState lẫn localStorage để không bao giờ mất Navbar khi F5
const isUserLoggedIn = computed(() => {
  return Boolean(authState.isAuthenticated || authState.user || hasToken.value);
});

watch(
  () => route.path,
  () => {
    hasToken.value = !!localStorage.getItem("token");
    showGameDropdown.value = false;
    isProfileOpen.value = false;
  }
);

const GAME_MENU_ITEMS = [
  { name: "Game 1: Wordle", path: "/wordle", active: true },
  { name: "Game 2: Songless", path: "/songless", active: true },
  { name: "Game 3: Soul Guard", path: "/soul-guard", active: true },
  { name: "Game 4: Tower Stack", path: "/tower-stack", active: true },
  { name: "Game 5 (Sắp ra mắt)", path: "", active: false }
];

// State quản lý việc đóng/mở widget và Modal
const isProfileOpen = ref(false);
const activeModal = ref(null); // 'name' | 'password' | null
const currentUser = computed(() => authState.user);

const toggleGameDropdown = () => {
  showGameDropdown.value = !showGameDropdown.value;
  if (showGameDropdown.value) {
    isProfileOpen.value = false;
  }
};

const closeGameDropdown = () => {
  showGameDropdown.value = false;
};

function toggleProfile() {
  isProfileOpen.value = !isProfileOpen.value;
  if (isProfileOpen.value) {
    showGameDropdown.value = false;
  }
}

function closeProfile() {
  isProfileOpen.value = false;
}

function closeAllMenus() {
  isProfileOpen.value = false;
  showGameDropdown.value = false;
}

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

// Mở Modal
function openModal(type) {
  isProfileOpen.value = false;
  showGameDropdown.value = false;
  activeModal.value = type;
  if (type === "name") {
    newName.value = currentUser.value?.fullName || "";
    nameMsg.value = { text: "", isError: false };
  } else if (type === "password") {
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
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const { data } = await axios.put(
      "http://localhost:5000/api/auth/profile",
      { fullName: newName.value },
      { headers }
    );
    if (data.success) {
      if (authState.user) {
        authState.user.fullName = data.user.fullName;
      }
      const saved = JSON.parse(localStorage.getItem("user") || "{}");
      saved.fullName = data.user.fullName;
      localStorage.setItem("user", JSON.stringify(saved));

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
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const { data } = await axios.put(
      "http://localhost:5000/api/auth/password",
      {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
        confirmNewPassword: confirmNewPassword.value
      },
      { headers }
    );
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
  hasToken.value = !!localStorage.getItem("token");
  const saved = localStorage.getItem("mindgarden_theme");
  isDark.value = saved === "dark";
  applyTheme(isDark.value);
});

async function handleLogout() {
  isProfileOpen.value = false;
  showGameDropdown.value = false;
  hasToken.value = false;
  await authLogout();
  router.push("/login");
}
</script>

<template>
  <div class="app-shell" @click="closeAllMenus">
    <!-- 1. THANH NAVIGATION BAR LUÔN HIỂN THỊ CỐ ĐỊNH Ở TRÊN CÙNG -->
    <header
      v-if="isUserLoggedIn && !['/login', '/register'].includes(route.path)"
      class="navbar glass"
    >
      <div class="navbar-brand" @click="router.push('/void')" style="cursor: pointer;">
        <span class="logo-icon"></span>
        <span class="logo-text">MindGarden</span>
      </div>

      <div class="nav-links">
        <router-link to="/void" class="nav-link" @click="closeGameDropdown">
          The Void
        </router-link>

        <!-- Menu Dropdown chứa 5 Game -->
        <div class="nav-dropdown-wrapper" @click.stop>
          <button
            type="button"
            class="nav-link dropdown-trigger"
            :class="{ 'router-link-active': ['/wordle', '/songless', '/soul-guard', '/tower-stack'].includes(route.path) }"
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

        <router-link to="/leaderboard" class="nav-link" @click="closeGameDropdown">
          Bảng xếp hạng
        </router-link>

        <router-link to="/chat" class="nav-link" @click="closeGameDropdown">
          Chat
        </router-link>
      </div>

      <div class="navbar-actions">
        <button class="theme-toggle" @click.stop="toggleTheme" aria-label="Toggle theme">
          {{ isDark ? "🌙" : "☀️" }}
        </button>

        <div class="user-menu" @click.stop>
          <button class="user-icon-btn" @click="toggleProfile">
            👤
          </button>

          <div v-if="isProfileOpen" class="profile-widget glass">
            <div class="profile-header">
              <span class="profile-name">{{ currentUser?.fullName || "User" }}</span>
              <span class="profile-email">{{ currentUser?.email }}</span>
            </div>

            <hr class="widget-divider" />

            <div class="widget-actions">
              <button
                v-if="authState.isAuthenticated"
                class="widget-btn"
                @click="router.push('/admin'); closeProfile()"
              >
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

    <!-- 2. KHUNG NỘI DUNG CHÍNH BÊN DƯỚI NAVBAR -->
    <main class="app-content">
      <router-view />
    </main>

    <!-- 3. MODAL ĐỔI TÊN HIỂN THỊ & ĐỔI MẬT KHẨU -->
    <div v-if="activeModal" class="modal-overlay" @click.self="closeModal">
      <!-- Modal Đổi tên -->
      <div v-if="activeModal === 'name'" class="modal-card glass">
        <h3>Đổi tên hiển thị</h3>
        <form class="modal-form" @submit.prevent="handleUpdateName">
          <div class="modal-input-group">
            <label>Tên hiển thị mới</label>
            <input
              type="text"
              v-model="newName"
              placeholder="Nhập tên hiển thị mới..."
            />
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

      <!-- Modal Đổi mật khẩu -->
      <div v-if="activeModal === 'password'" class="modal-card glass">
        <h3>Đổi mật khẩu</h3>
        <form class="modal-form" @submit.prevent="handleChangePassword">
          <div class="modal-input-group">
            <label>Mật khẩu hiện tại</label>
            <input type="password" v-model="currentPassword" placeholder="Nhập mật khẩu hiện tại" />
          </div>
          <div class="modal-input-group">
            <label>Mật khẩu mới</label>
            <input type="password" v-model="newPassword" placeholder="Tối thiểu 8 ký tự" />
          </div>
          <div class="modal-input-group">
            <label>Xác nhận mật khẩu mới</label>
            <input type="password" v-model="confirmNewPassword" placeholder="Nhập lại mật khẩu mới" />
          </div>
          <p v-if="passMsg.text" :class="passMsg.isError ? 'msg-error' : 'msg-success'">
            {{ passMsg.text }}
          </p>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeModal">Hủy</button>
            <button type="submit" class="btn-save" :disabled="isSubmittingPass">
              {{ isSubmittingPass ? "Đang lưu..." : "Cập nhật" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style>
/* Khóa khung ứng dụng cố định vào cửa sổ trình duyệt để không trang nào đẩy mất Navbar */
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
}

.app-shell {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

/* Thanh Navbar luôn nằm cố định trên cùng */
header.navbar {
  flex: 0 0 auto !important;
  position: relative !important;
  z-index: 9999 !important;
  overflow: visible !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.7rem 1.5rem;
  margin: 0.65rem 1rem 0.25rem;
  border-radius: 16px;
}

/* Khung nội dung bên dưới tự động cuộn mượt mà */
main.app-content {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  width: 100% !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  position: relative !important;
  z-index: 1 !important;
  display: flex;
  flex-direction: column;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text-primary, #f8fafc);
}

.logo-icon {
  font-size: 1.4rem;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.nav-link {
  flex-shrink: 0;
  color: var(--text-secondary, #cbd5e1);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.92rem;
  padding: 0.45rem 0.8rem;
  border-radius: 8px;
  transition: background 0.2s ease, color 0.2s ease;
}

.nav-link:hover {
  background: var(--surface-strong, rgba(255, 255, 255, 0.08));
  color: var(--text-primary, #ffffff);
}

.nav-link.router-link-active {
  color: var(--accent, #60a5fa);
  background: var(--surface-strong, rgba(15, 23, 42, 0.65));
}

.nav-dropdown-wrapper {
  position: relative;
}

.dropdown-trigger {
  background: transparent;
  border: none;
  font-family: inherit;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.caret {
  font-size: 0.75rem;
  opacity: 0.85;
}

/* Menu xổ xuống của 5 Game & Menu User */
.games-dropdown-menu,
.profile-widget {
  position: absolute !important;
  z-index: 10000 !important;
  background: #0f172a !important;
  backdrop-filter: none !important;
  border: 1px solid rgba(255, 255, 255, 0.16) !important;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.75) !important;
}

.games-dropdown-menu {
  top: calc(100% + 8px);
  left: 0;
  min-width: 210px;
  border-radius: 12px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
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

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.theme-toggle,
.user-icon-btn {
  background: var(--surface-strong, rgba(30, 41, 59, 0.8));
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

.theme-toggle:hover,
.user-icon-btn:hover {
  background: var(--border-color, rgba(255, 255, 255, 0.15));
}

.user-menu {
  position: relative;
}

.profile-widget {
  top: calc(100% + 10px);
  right: 0;
  width: 240px;
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
}

.profile-header {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.5rem;
}

.profile-name {
  font-weight: 700;
  font-size: 1rem;
  color: #f8fafc;
}

.profile-email {
  font-size: 0.8rem;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.widget-divider {
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  margin: 0.5rem 0;
}

.widget-actions {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.widget-btn {
  background: transparent;
  border: none;
  text-align: left;
  padding: 0.6rem;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.2s;
}

.widget-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.logout-btn {
  color: #ef4444;
}

.logout-btn:hover {
  background: #ef4444;
  color: white;
}

/* Modal Đổi tên / Mật khẩu */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 1rem;
  box-sizing: border-box;
}

.modal-card {
  width: 100%;
  max-width: 380px;
  padding: 1.5rem;
  border-radius: 16px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.modal-card h3 {
  margin: 0 0 1.2rem;
  color: #f8fafc;
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
  color: #cbd5e1;
}

.modal-input-group input {
  padding: 0.65rem 0.9rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(30, 41, 59, 0.9);
  color: #f8fafc;
  font-size: 0.95rem;
}

.msg-error {
  color: #ef4444;
  font-size: 0.85rem;
  margin: 0;
}

.msg-success {
  color: #10b981;
  font-size: 0.85rem;
  margin: 0;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

.btn-cancel {
  padding: 0.55rem 1rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
  font-weight: 600;
}

.btn-save {
  padding: 0.55rem 1.2rem;
  border-radius: 8px;
  border: none;
  background: #2563eb;
  color: #fff;
  cursor: pointer;
  font-weight: 600;
}

.btn-save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 640px) {
  header.navbar {
    padding: 0.55rem 0.85rem;
    margin: 0.4rem 0.5rem;
  }
  .nav-links {
    gap: 4px;
  }
  .nav-link {
    padding: 5px 8px;
    font-size: 0.82rem;
  }
}
</style>