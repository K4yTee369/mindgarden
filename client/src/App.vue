<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import axios from "axios";
import { authState, logout as authLogout } from "./store/auth";

const router = useRouter();
const route = useRoute();

// 3 Trạng thái cảm xúc theo yêu cầu của giảng viên
const MOOD_OPTIONS = [
  {
    key: "joy",
    label: "Vui",
    hint: "Không gian nắng sớm tươi mới"
  },
  {
    key: "calm",
    label: "Bình thường",
    hint: "Không gian tán lá dịu mắt, cân bằng"
  },
  {
    key: "low",
    label: "Buồn",
    hint: "Không gian mưa đêm trầm ấm, vỗ về"
  }
];

const currentMood = ref("calm");
const showGameDropdown = ref(false);
const hasToken = ref(!!localStorage.getItem("token"));

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
  { name: "Game 5: Rhythm Pulse", path: "/rhythm-pulse", active: true }
];

const isProfileOpen = ref(false);
const activeModal = ref(null);

const currentUser = computed(() => {
  if (authState.user) return authState.user;
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
});

// Áp dụng Tâm trạng lên thẻ <html> và phát sự kiện cho các trang con
function applyMood(moodKey) {
  const validMood = ["joy", "calm", "low"].includes(moodKey) ? moodKey : "calm";
  currentMood.value = validMood;
  const root = document.documentElement;
  root.setAttribute("data-mood", validMood);

  // Giữ tương thích với class dark-mode cũ khi ở trạng thái Buồn
  if (validMood === "low") {
    root.classList.add("dark-mode");
  } else {
    root.classList.remove("dark-mode");
  }

  localStorage.setItem("mindgarden_mood", validMood);
  window.dispatchEvent(new CustomEvent("mindgarden-mood-change", { detail: validMood }));
}

const toggleGameDropdown = () => {
  showGameDropdown.value = !showGameDropdown.value;
  if (showGameDropdown.value) isProfileOpen.value = false;
};

const closeGameDropdown = () => {
  showGameDropdown.value = false;
};

function toggleProfile() {
  isProfileOpen.value = !isProfileOpen.value;
  if (isProfileOpen.value) showGameDropdown.value = false;
}

function closeProfile() {
  isProfileOpen.value = false;
}

function closeAllMenus() {
  isProfileOpen.value = false;
  showGameDropdown.value = false;
}

// State cho Form Đổi tên & Mật khẩu
const newName = ref("");
const nameMsg = ref({ text: "", isError: false });
const isSubmittingName = ref(false);

const currentPassword = ref("");
const newPassword = ref("");
const confirmNewPassword = ref("");
const passMsg = ref({ text: "", isError: false });
const isSubmittingPass = ref(false);

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

async function handleUpdateName() {
  if (!newName.value.trim()) {
    nameMsg.value = { text: "Vui lòng nhập tên hiển thị mới.", isError: true };
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
      if (authState.user) authState.user.fullName = data.user.fullName;
      const saved = JSON.parse(localStorage.getItem("user") || "{}");
      saved.fullName = data.user.fullName;
      localStorage.setItem("user", JSON.stringify(saved));

      nameMsg.value = { text: "Đã lưu tên hiển thị mới.", isError: false };
      setTimeout(() => closeModal(), 900);
    }
  } catch (err) {
    nameMsg.value = {
      text: err.response?.data?.message || "Không thể lưu tên lúc này.",
      isError: true
    };
  } finally {
    isSubmittingName.value = false;
  }
}

async function handleChangePassword() {
  if (!currentPassword.value || !newPassword.value || !confirmNewPassword.value) {
    passMsg.value = { text: "Vui lòng điền đủ ba ô mật khẩu.", isError: true };
    return;
  }
  if (newPassword.value.length < 8) {
    passMsg.value = { text: "Mật khẩu mới cần ít nhất 8 ký tự.", isError: true };
    return;
  }
  if (newPassword.value !== confirmNewPassword.value) {
    passMsg.value = { text: "Mật khẩu xác nhận chưa khớp.", isError: true };
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
      passMsg.value = { text: "Đã cập nhật mật khẩu mới.", isError: false };
      setTimeout(() => closeModal(), 1100);
    }
  } catch (err) {
    passMsg.value = {
      text: err.response?.data?.message || "Mật khẩu hiện tại chưa đúng.",
      isError: true
    };
  } finally {
    isSubmittingPass.value = false;
  }
}

onMounted(() => {
  hasToken.value = !!localStorage.getItem("token");
  const savedMood = localStorage.getItem("mindgarden_mood") || "calm";
  applyMood(savedMood);
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
    <!-- THANH ĐIỀU HƯỚNG TÍCH HỢP BỘ CHỌN CẢM XÚC -->
    <header
      v-if="!['/login', '/register'].includes($route.path)"
      class="navbar"
    >
      <div class="navbar-brand" @click="router.push('/void')">
        <span class="brand-mark"></span>
        <span class="logo-text">MindGarden</span>
      </div>

      <nav class="nav-links" aria-label="Điều hướng chính">
        <router-link to="/void" class="nav-link" @click="closeGameDropdown">
          The Void
        </router-link>

        <div class="nav-dropdown-wrapper" @click.stop>
          <button
            type="button"
            class="nav-link dropdown-trigger"
            :class="{
              'router-link-active': [
                '/wordle',
                '/songless',
                '/soul-guard',
                '/tower-stack',
                '/rhythm-pulse'
              ].includes(route.path)
            }"
            @click="toggleGameDropdown"
          >
            Trò chơi <span class="caret">▾</span>
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
          Trò chuyện
        </router-link>
      </nav>

      <!-- BỘ CHUYỂN ĐỔI GIAO DIỆN THEO 3 CẢM XÚC (VUI / BÌNH THƯỜNG / BUỒN) -->
      <div class="navbar-actions">
        <div class="mood-switcher" role="group" aria-label="Chọn tâm trạng giao diện" @click.stop>
          <span class="mood-caption">Tâm trạng:</span>
          <button
            v-for="m in MOOD_OPTIONS"
            :key="m.key"
            type="button"
            class="mood-pill"
            :class="{ active: currentMood === m.key }"
            :title="m.hint"
            @click="applyMood(m.key)"
          >
            <span class="mood-dot" :class="`dot-${m.key}`"></span>
            {{ m.label }}
          </button>
        </div>

        <div class="user-menu" @click.stop>
          <button class="user-avatar-btn" @click="toggleProfile" title="Tài khoản">
            {{ (currentUser?.fullName || "U").charAt(0).toUpperCase() }}
          </button>

          <div v-if="isProfileOpen" class="profile-widget">
            <div class="profile-header">
              <span class="profile-name">{{ currentUser?.fullName || "Thành viên" }}</span>
              <span class="profile-email">{{ currentUser?.email }}</span>
            </div>

            <hr class="widget-divider" />

            <div class="widget-actions">
              <button
                v-if="currentUser?.role === 'admin'"
                class="widget-btn"
                @click="router.push('/admin'); closeProfile()"
              >
                Quản trị hệ thống
              </button>
              <button class="widget-btn" @click="openModal('name')">Đổi tên hiển thị</button>
              <button class="widget-btn" @click="openModal('password')">Đổi mật khẩu</button>
              <button class="widget-btn logout-btn" @click="handleLogout">Đăng xuất</button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- KHUNG NỘI DUNG CHÍNH -->
    <main class="app-content">
      <router-view />
    </main>

    <!-- MODAL ĐỔI TÊN & ĐỔI MẬT KHẨU -->
    <div v-if="activeModal" class="modal-overlay" @click.self="closeModal">
      <div v-if="activeModal === 'name'" class="modal-card">
        <h3>Đổi tên hiển thị</h3>
        <form class="modal-form" @submit.prevent="handleUpdateName">
          <div class="modal-input-group">
            <label>Tên hiển thị của bạn</label>
            <input type="text" v-model="newName" placeholder="Nhập tên mới..." />
          </div>
          <p v-if="nameMsg.text" :class="nameMsg.isError ? 'msg-error' : 'msg-success'">
            {{ nameMsg.text }}
          </p>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeModal">Đóng</button>
            <button type="submit" class="btn-save" :disabled="isSubmittingName">
              {{ isSubmittingName ? "Đang lưu..." : "Lưu tên mới" }}
            </button>
          </div>
        </form>
      </div>

      <div v-if="activeModal === 'password'" class="modal-card">
        <h3>Đổi mật khẩu</h3>
        <form class="modal-form" @submit.prevent="handleChangePassword">
          <div class="modal-input-group">
            <label>Mật khẩu hiện tại</label>
            <input type="password" v-model="currentPassword" placeholder="Nhập mật khẩu đang dùng" />
          </div>
          <div class="modal-input-group">
            <label>Mật khẩu mới</label>
            <input type="password" v-model="newPassword" placeholder="Tối thiểu 8 ký tự" />
          </div>
          <div class="modal-input-group">
            <label>Nhập lại mật khẩu mới</label>
            <input type="password" v-model="confirmNewPassword" placeholder="Xác nhận mật khẩu mới" />
          </div>
          <p v-if="passMsg.text" :class="passMsg.isError ? 'msg-error' : 'msg-success'">
            {{ passMsg.text }}
          </p>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeModal">Đóng</button>
            <button type="submit" class="btn-save" :disabled="isSubmittingPass">
              {{ isSubmittingPass ? "Đang lưu..." : "Lưu mật khẩu" }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style>
/* ==========================================================================
   1. BA THẾ GIỚI CẢM XÚC RÕ RỆT (DISTINCT EMOTIONAL PALETTES)
   ========================================================================== */

/* TÂM TRẠNG 1: VUI (Nắng Vàng Ban Mai — Ấm áp, Tươi sáng, Giàu năng lượng) */
:root[data-mood="joy"] {
  --bg-color: #FDF3DF;
  --bg-ambient: radial-gradient(circle at 15% 10%, #FFF9EE 0%, #FCEFD4 55%, #F7E2BC 100%);
  --surface-card: #FFFDF8;
  --surface-elevated: #FFFFFF;
  --surface-sub: #F7ECD8;        /* Nền các ô thống kê, thẻ độ khó, ô nhạc */
  --surface-strong: #EFE0C4;     /* Nền các nút phụ, thanh tab */
  --surface-input: #FFFDF9;
  --surface-active: #FDE6D8;     /* Nền thẻ độ khó khi đang chọn */
  --text-primary: #2C1810;       /* Nâu Espresso đậm nét */
  --text-secondary: #6E4735;     /* Nâu Hổ phách */
  --text-muted: #9C735E;
  --accent: #D95326;             /* Cam San Hô rực rỡ */
  --accent-hover: #B84018;
  --accent-soft: rgba(217, 83, 38, 0.14);
  --accent-contrast: #FFFFFF;
  --badge-bg: #FAD7C8;
  --badge-text: #9E3310;
  --border-color: #E6CCA5;
  --border-strong: #D9B482;
  --danger: #C93B3B;
  --card-shadow: 0 8px 28px rgba(110, 65, 25, 0.08);
}

/* TÂM TRẠNG 2: BÌNH THƯỜNG (Vườn Ngọc Bích — Dịu mát, Cân bằng, Tĩnh tại) */
:root,
:root[data-mood="calm"] {
  --bg-color: #DCECE6;
  --bg-ambient: linear-gradient(155deg, #E8F4F0 0%, #D4E7E0 100%);
  --surface-card: #F6FBF9;
  --surface-elevated: #FFFFFF;
  --surface-sub: #E5F1EC;        /* Nền xanh ngọc nhạt cho các ô con */
  --surface-strong: #D3E6DF;     /* Nền nút phụ */
  --surface-input: #FFFFFF;
  --surface-active: #D0EDE4;     /* Nền thẻ độ khó đang chọn */
  --text-primary: #102A22;       /* Xanh Rừng thông đậm */
  --text-secondary: #395B50;     /* Xanh Lá trà */
  --text-muted: #64877C;
  --accent: #0D7463;             /* Xanh Ngọc Lục Bảo */
  --accent-hover: #09594C;
  --accent-soft: rgba(13, 116, 99, 0.14);
  --accent-contrast: #FFFFFF;
  --badge-bg: #BCE3D8;
  --badge-text: #084C40;
  --border-color: #B9D8CD;
  --border-strong: #94C2B2;
  --danger: #C84B4B;
  --card-shadow: 0 6px 24px rgba(16, 42, 34, 0.07);
}

/* TÂM TRẠNG 3: BUỒN (Đêm Sao Tĩnh Lặng — Trầm ấm, Dịu mắt, Vỗ về) */
:root[data-mood="low"] {
  --bg-color: #0E1525;
  --bg-ambient: radial-gradient(circle at 50% 0%, #1B2742 0%, #0E1525 72%);
  --surface-card: #172236;
  --surface-elevated: #1F2D46;
  --surface-sub: #111A2B;        /* Nền ô con trầm sâu */
  --surface-strong: #24334F;     /* Nền nút phụ */
  --surface-input: #101827;
  --surface-active: #233354;     /* Nền thẻ độ khó đang chọn */
  --text-primary: #E6EEF8;       /* Trắng Ánh sao */
  --text-secondary: #9FB0C9;     /* Xám Mưa đêm */
  --text-muted: #6B7F9E;
  --accent: #7C93F5;             /* Xanh Oải hương dịu */
  --accent-hover: #93A7F8;
  --accent-soft: rgba(124, 147, 245, 0.18);
  --accent-contrast: #0B111E;
  --badge-bg: rgba(124, 147, 245, 0.22);
  --badge-text: #BAC8FF;
  --border-color: #293854;
  --border-strong: #3B4F73;
  --danger: #E05A5A;
  --card-shadow: 0 10px 32px rgba(4, 8, 16, 0.5);
}

/* ==========================================================================
   2. NỀN TẢNG TYPOGRAPHY & BỐ CỤC KHUNG CHÍNH
   ========================================================================== */
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  font-family: "Be Vietnam Pro", -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg-ambient) !important;
  color: var(--text-primary) !important;
  transition: background 0.45s cubic-bezier(0.22, 1, 0.36, 1), color 0.3s ease;
  -webkit-font-smoothing: antialiased;
}

h1, h2, .logo-text {
  font-family: "Newsreader", Georgia, serif;
  letter-spacing: -0.015em;
  color: var(--text-primary) !important;
}

.app-shell {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  background: var(--bg-ambient) !important;
}

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

/* ==========================================================================
   3. ĐỒNG BỘ TOÀN DIỆN 5 GAME, BẢNG XẾP HẠNG, THE VOID & ADMIN
   ========================================================================== */

/* 3.1. Các tấm thẻ chính (Cards & Panels) */
.glass,
.void-left-column,
.post-card,
.left-panel,
.right-panel,
.header-card,
.my-summary-card,
.board-card,
.auth-card {
  background: var(--surface-card) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: var(--card-shadow) !important;
  backdrop-filter: none !important;
  transition: background-color 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
}

/* 3.2. Sửa lỗi tiêu đề h1, h2, h3 và phụ đề bị chìm màu trắng */
.title-group h1,
.header-card h1,
.my-summary-top h2,
.column-header h1,
.modal-card h2,
.modal-card h3,
.diff-name,
.game-title,
.player-name {
  color: var(--text-primary) !important;
}

.subtitle,
.section-note,
.diff-desc,
.stat-label,
.hud-label,
.game-played,
.mini-bottom,
.click-hint {
  color: var(--text-secondary) !important;
  text-transform: none !important;
}

.section-title {
  color: var(--text-primary) !important;
  font-weight: 700 !important;
}

/* 3.3. Các khối thông số phụ bên trong 5 Game & Leaderboard (Không còn bị màu xám đen) */
.stats-bar,
.hud-bar,
.widescreen-header,
.orb-legend-list,
.rules-summary-box,
.judg-box,
.feedback-banner,
.ai-hint-box,
.audio-card,
.mini-game-card,
.rank-badge-box,
.result-summary-box,
.comment-item {
  background: var(--surface-sub) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: none !important;
}

.orb-row,
.rule-row,
.header-stat,
.summary-line,
.audio-status-row,
.attempt-text {
  color: var(--text-primary) !important;
}

.stat-value,
.hud-val,
.score-num,
.total-pts,
.rank-Badge-box strong {
  color: var(--accent) !important;
}

/* 3.4. Thẻ chọn Độ khó / Chủ đề nhạc / Mốc thời gian (Difficulty & Category Cards) */
.diff-card,
.milestone-row,
.guess-slot {
  background: var(--surface-sub) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
  transition: all 0.2s ease !important;
}

.diff-card:hover {
  border-color: var(--border-strong) !important;
  background: var(--surface-strong) !important;
}

/* Trạng thái Đang chọn (Active) rõ nét, độ tương phản cao ở cả 3 tâm trạng */
.diff-card.active,
.milestone-row.current,
.guess-slot.active-slot {
  background: var(--surface-active) !important;
  border: 2px solid var(--accent) !important;
  color: var(--text-primary) !important;
}

.diff-card.active .diff-name,
.diff-card.active .diff-desc {
  color: var(--text-primary) !important;
}

.diff-summary,
.grade-badge {
  background: var(--badge-bg) !important;
  color: var(--badge-text) !important;
  font-weight: 600 !important;
}

/* 3.5. Các nút bấm điều khiển trong Game (Buttons & Tabs) */
.text-btn,
.dpad-btn,
.secondary-btn,
.inspect-btn,
.clear-search-btn,
.upload-btn {
  background: var(--surface-strong) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
}

.text-btn:hover,
.dpad-btn:hover,
.inspect-btn:hover {
  background: var(--border-color) !important;
}

.text-btn.primary,
.primary-btn,
.drop-action-btn,
.restart-top-btn,
.submit-guess-btn,
.post-btn,
.send-comment-btn {
  background: var(--accent) !important;
  color: var(--accent-contrast) !important;
  border-color: var(--accent) !important;
}

.text-btn.primary:hover,
.primary-btn:hover,
.drop-action-btn:hover:not(:disabled) {
  background: var(--accent-hover) !important;
}

/* 3.6. Ô tìm kiếm bài hát (Songless) & Ô nhập liệu */
.search-input,
.void-input-box textarea,
.hashtag-input-wrapper,
.search-hashtag-input,
.comment-input-area input {
  background: var(--surface-input) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-strong) !important;
}

.search-input::placeholder,
.void-input-box textarea::placeholder,
.search-hashtag-input::placeholder {
  color: var(--text-muted) !important;
}

.autocomplete-List {
  background: var(--surface-elevated) !important;
  border: 1px solid var(--border-strong) !important;
}

.song-option {
  color: var(--text-primary) !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.song-option:hover {
  background: var(--accent-soft) !important;
}

/* 3.7. Bàn phím & Ô chữ trong Game 1: Wordle */
.tile {
  background: var(--surface-input) !important;
  border: 2px solid var(--border-strong) !important;
  color: var(--text-primary) !important;
}

.tile.filled {
  border-color: var(--accent) !important;
}

.tile.correct {
  background: #16a34a !important;
  border-color: #16a34a !important;
  color: #ffffff !important;
}

.tile.present {
  background: #d97706 !important;
  border-color: #d97706 !important;
  color: #ffffff !important;
}

.tile.absent {
  background: var(--surface-strong) !important;
  border-color: var(--border-color) !important;
  color: var(--text-muted) !important;
}

.key-btn {
  background: var(--surface-strong) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
}

/* 3.8. Bảng Xếp Hạng (Leaderboard Table & Tabs) */
.tab-row {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
}

.tab-btn {
  color: var(--text-secondary) !important;
}

.tab-btn.active {
  background: var(--accent) !important;
  color: var(--accent-contrast) !important;
}

.table-wrapper {
  border: 1px solid var(--border-color) !important;
  background: var(--surface-card) !important;
}

.leaderboard-table th {
  background: var(--surface-sub) !important;
  color: var(--text-secondary) !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.leaderboard-table td {
  color: var(--text-primary) !important;
  border-bottom: 1px solid var(--border-color) !important;
}

.player-row:hover {
  background: var(--accent-soft) !important;
}

.rank- badge-box.highlight {
  background: var(--surface-active) !important;
  border-color: var(--accent) !important;
}

/* Giữ nguyên màu tối cho màn hình Canvas chơi game (Soul Guard, Tower Stack, Rhythm Pulse) */
.canvas-overlay h3 {
  color: #f8fafc !important;
}
.canvas-overlay p {
  color: #cbd5e1 !important;
}

/* ==========================================================================
   4. THANH ĐIỀU HƯỚNG & BỘ CHỌN TÂM TRẠNG (MOOD SWITCHER)
   ========================================================================== */
header.navbar {
  flex: 0 0 auto !important;
  position: relative !important;
  z-index: 9999 !important;
  overflow: visible !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.65rem 1.4rem;
  margin: 0.65rem 1.25rem 0.25rem;
  border-radius: 12px;
  background: var(--surface-card) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: var(--card-shadow) !important;
}

.navbar-brand {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  cursor: pointer;
}

.brand-mark {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px var(--accent-soft);
}

.logo-text {
  font-size: 1.28rem;
  font-weight: 600;
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.nav-link {
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.9rem;
  padding: 0.45rem 0.85rem;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.nav-link:hover {
  background: var(--surface-sub);
  color: var(--text-primary);
}

.nav-link.router-link-active {
  color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
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
  opacity: 0.8;
}

.navbar-actions {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.mood-switcher {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border-radius: 999px;
  background: var(--surface-sub);
  border: 1px solid var(--border-color);
}

.mood-caption {
  font-size: 0.78rem;
  color: var(--text-secondary);
  padding: 0 6px 0 8px;
  font-weight: 500;
}

.mood-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mood-pill:hover {
  color: var(--text-primary);
}

.mood-pill.active {
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
}

.mood-pill.active .mood-dot {
  background: #ffffff !important;
}

.mood-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.dot-joy { background: #D95326; }
.dot-calm { background: #0D7463; }
.dot-low { background: #7C93F5; }

.user-menu {
  position: relative;
}

.user-avatar-btn {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.games-dropdown-menu,
.profile-widget {
  position: absolute !important;
  z-index: 10000 !important;
  background: var(--surface-elevated) !important;
  border: 1px solid var(--border-strong) !important;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18) !important;
  border-radius: 12px;
}

.games-dropdown-menu {
  top: calc(100% + 8px);
  left: 0;
  min-width: 215px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dropdown-game-item {
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--text-primary);
  text-decoration: none;
  font-size: 0.86rem;
  font-weight: 500;
  transition: background 0.15s;
  text-align: left;
}

.dropdown-game-item:hover {
  background: var(--accent-soft);
  color: var(--accent);
}

.profile-widget {
  top: calc(100% + 10px);
  right: 0;
  width: 235px;
  padding: 0.95rem;
  display: flex;
  flex-direction: column;
}

.profile-header {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.4rem;
}

.profile-name {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.profile-email {
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.widget-divider {
  border: 0;
  border-top: 1px solid var(--border-color);
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
  padding: 0.55rem 0.65rem;
  border-radius: 7px;
  font-size: 0.86rem;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
}

.widget-btn:hover {
  background: var(--surface-sub);
  color: var(--text-primary);
}

.logout-btn {
  color: var(--danger);
}

.logout-btn:hover {
  background: var(--danger);
  color: #ffffff;
}

/* Modal chung */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 1rem;
}

.modal-card {
  width: 100%;
  max-width: 480px;
  padding: 1.5rem;
  border-radius: 14px;
  background: var(--surface-elevated) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-strong) !important;
  box-shadow: var(--card-shadow) !important;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.modal-input-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.modal-input-group label {
  font-size: 0.84rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.modal-input-group input {
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--surface-input);
  color: var(--text-primary);
  font-size: 0.92rem;
}

.msg-error { color: var(--danger); font-size: 0.84rem; margin: 0; }
.msg-success { color: var(--accent); font-size: 0.84rem; margin: 0; font-weight: 600; }

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.55rem;
  margin-top: 0.4rem;
}

.btn-cancel {
  padding: 0.5rem 0.95rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 500;
}

.btn-save {
  padding: 0.5rem 1.15rem;
  border-radius: 8px;
  border: none;
  background: var(--accent);
  color: var(--accent-contrast);
  cursor: pointer;
  font-weight: 600;
}

@media (max-width: 820px) {
  header.navbar {
    flex-wrap: wrap;
    padding: 0.6rem 0.9rem;
    margin: 0.4rem 0.5rem;
  }
  .mood-caption {
    display: none;
  }
}
/* ==========================================================================
   5. ĐỒNG BỘ CHÍNH XÁC CLASS CỦA LEADERBOARD, SONGLESS & WORDLE
   ========================================================================== */

/* --- 5.1. TRANG BẢNG XẾP HẠNG (LeaderboardView.vue) --- */
.page-header,
.my-vault-section,
.ranking-section {
  background: var(--surface-card) !important;
  border: 1px solid var(--border-color) !important;
  box-shadow: var(--card-shadow) !important;
}

.vault-note,
.click-hint,
.empty-state,
.modal-sub {
  color: var(--text-secondary) !important;
}

/* 2 Hộp Thứ hạng chung & Tổng điểm 5 Game góc phải trên */
.summary-box {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
}

.summary-box .label {
  color: var(--text-secondary) !important;
  text-transform: none !important;
  font-weight: 600 !important;
}

.summary-box .value {
  color: var(--text-primary) !important;
}

.summary-box.highlight {
  background: var(--surface-active) !important;
  border: 1.5px solid var(--accent) !important;
}

.summary-box.highlight .value {
  color: var(--accent) !important;
}

/* 5 Thẻ điểm từng Game (.game-score-card) */
.game-score-card {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 12px !important;
  box-shadow: none !important;
}

.game-score-card .game-title {
  color: var(--text-primary) !important;
  font-weight: 700 !important;
}

.game-score-card .game-matches {
  color: var(--text-secondary) !important;
}

.game-score-card .game-points {
  color: var(--accent) !important;
  font-weight: 800 !important;
}

.game-score-card .game-points span {
  color: var(--text-secondary) !important;
  font-weight: 500 !important;
}

.game-score-card .game-meta {
  border-top: 1px solid var(--border-color) !important;
  color: var(--text-secondary) !important;
}

/* Thanh Tab lọc (.filter-tabs & .filter-btn) */
.filter-tabs {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
}

.filter-btn {
  background: transparent !important;
  color: var(--text-secondary) !important;
  font-weight: 600 !important;
}

.filter-btn:hover {
  color: var(--text-primary) !important;
}

.filter-btn.active {
  background: var(--accent) !important;
  color: var(--accent-contrast) !important;
}

/* Bảng xếp hạng (.ranking-table) — Phủ nền sáng đồng bộ cho toàn bộ các hàng */
.table-responsive,
.ranking-table,
.ranking-table tbody {
  background: var(--surface-card) !important;
  border-color: var(--border-color) !important;
}

.table-responsive {
  border: 1px solid var(--border-color) !important;
  border-radius: 12px !important;
  overflow: hidden !important;
}

.ranking-table thead tr,
.ranking-table th {
  background: var(--surface-sub) !important;
  color: var(--text-secondary) !important;
  border-bottom: 1px solid var(--border-color) !important;
}

/* Các hàng người chơi thông thường (#2, #3...) */
.ranking-table tbody tr,
.player-row {
  background: var(--surface-card) !important;
  border-bottom: 1px solid var(--border-color) !important;
  transition: background-color 0.15s ease !important;
}

/* Hàng của chính bạn (#1 K4yTee Bạn) nổi bật hơn */
.ranking-table tbody tr.current-user-row,
.player-row.current-user-row {
  background: var(--surface-active) !important;
}

/* Hiệu ứng khi di chuột qua bất kỳ hàng nào */
.ranking-table tbody tr:hover,
.player-row:hover {
  background: var(--surface-sub) !important;
}

.ranking-table td {
  background: transparent !important;
  color: var(--text-primary) !important;
  border-bottom: 1px solid var(--border-color) !important;
}

/* Huy hiệu Hạng #1, #2, #3 rõ nét */
.rank-chip {
  background: var(--surface-strong) !important;
  color: var(--text-primary) !important;
  font-weight: 700 !important;
}

.rank-chip.top-1 {
  background: #FEF3C7 !important;
  color: #92400E !important;
  border: 1px solid #F59E0B !important;
}

.rank-chip.top-2 {
  background: #E2E8F0 !important;
  color: #1E293B !important;
  border: 1px solid #94A3B8 !important;
}

.rank-chip.top-3 {
  background: #FFEDD5 !important;
  color: #9A3412 !important;
  border: 1px solid #F97316 !important;
}

/* Modal chi tiết kho điểm người chơi */
.detail-row {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
}

.detail-game-info strong {
  color: var(--text-primary) !important;
}

.detail-game-info span {
  color: var(--text-secondary) !important;
}

.detail-game-score,
.detail-total-footer strong {
  color: var(--accent) !important;
  font-weight: 800 !important;
}

.detail-total-footer {
  border-top: 1px solid var(--border-color) !important;
  color: var(--text-primary) !important;
}

.close-btn {
  background: var(--surface-strong) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-color) !important;
}

/* --- 5.2. TRANG SONGLESS (SonglessView.vue) --- */
/* Cột trái: Thẻ chủ đề nhạc (.cat-card) */
.cat-card {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
}

.cat-card .cat-name {
  color: var(--text-primary) !important;
  font-weight: 700 !important;
}

.cat-card .cat-desc {
  color: var(--text-secondary) !important;
}

.cat-card.active {
  background: var(--surface-active) !important;
  border: 2px solid var(--accent) !important;
}

/* Cột trái: Mốc thời gian & Điểm thưởng (.step-pill) */
.step-pill {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
}

.step-pill .step-time {
  color: var(--text-primary) !important;
  font-weight: 500 !important;
}

.step-pill .step-pts {
  color: var(--accent) !important;
  font-weight: 700 !important;
}

.step-pill.current-step {
  background: var(--surface-active) !important;
  border: 2px solid var(--accent) !important;
}

/* Cột phải: Khung trình phát nhạc (.player-section) */
.player-section {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
  border-radius: 12px !important;
}

.player-status-header,
.player-status-header span {
  color: var(--text-secondary) !important;
}

.player-status-header strong {
  color: var(--text-primary) !important;
  font-weight: 700 !important;
}

/* 5 Ô phân đoạn thời gian (0.5s, 1.5s, 3.5s, 8.0s, 15s) */
.segment-item {
  background: var(--surface-card) !important;
  border: 1px solid var(--border-strong) !important;
}

.segment-item .segment-label {
  color: var(--text-secondary) !important;
  font-weight: 600 !important;
}

.segment-item.unlocked {
  background: var(--surface-strong) !important;
}

.segment-item.unlocked .segment-label {
  color: var(--text-primary) !important;
}

.segment-item.active-segment {
  background: var(--surface-active) !important;
  border: 2px solid var(--accent) !important;
}

.segment-item.active-segment .segment-label {
  color: var(--accent) !important;
  font-weight: 800 !important;
}

/* Thanh chạy thời gian nhạc */
.realtime-progress-track {
  background: var(--border-color) !important;
}

.realtime-progress-fill {
  background: var(--accent) !important;
}

/* Nút Phát nhạc & Bỏ qua */
.play-btn {
  background: #16a34a !important;
  color: #ffffff !important;
}

.skip-btn {
  background: var(--surface-strong) !important;
  color: var(--text-primary) !important;
  border: 1px solid var(--border-strong) !important;
}

/* Ô tìm kiếm bài hát (.song-input) & Gợi ý xổ xuống */
.song-input {
  background: var(--surface-input) !important;
  border: 1.5px solid var(--border-strong) !important;
  color: var(--text-primary) !important;
}

.song-input::placeholder {
  color: var(--text-muted) !important;
}

.suggestions-list {
  background: var(--surface-elevated) !important;
  border: 1px solid var(--border-strong) !important;
  box-shadow: var(--card-shadow) !important;
}

.suggestion-item {
  border-bottom: 1px solid var(--border-color) !important;
}

.suggestion-item:hover {
  background: var(--surface-active) !important;
}

.sug-title {
  color: var(--text-primary) !important;
  font-weight: 600 !important;
}

.sug-artist {
  color: var(--text-secondary) !important;
}

/* 5 Lượt đoán bài hát (.guess-slot) */
.guess-slot {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
}

.guess-slot.current-slot {
  background: var(--surface-active) !important;
  border: 1.5px solid var(--accent) !important;
}

.slot-number {
  color: var(--accent) !important;
  font-weight: 700 !important;
}

.slot-text {
  color: var(--text-primary) !important;
}

.color-legend,
.legend-item span {
  color: var(--text-secondary) !important;
}

.color-rules-box,
.song-reveal-card,
.points-summary {
  background: var(--surface-sub) !important;
  border: 1px solid var(--border-color) !important;
  color: var(--text-primary) !important;
}

.reveal-title {
  color: var(--text-primary) !important;
}

.reveal-artist,
.reveal-album {
  color: var(--text-secondary) !important;
}

/* --- 5.3. BẢNG Ô CHỮ WORDLE --- */
.tile {
  background: var(--surface-input) !important;
  border: 2px solid var(--border-strong) !important;
  color: var(--text-primary) !important;
}

.tile.filled {
  background: var(--surface-active) !important;
  border-color: var(--accent) !important;
  color: var(--text-primary) !important;
}

</style>