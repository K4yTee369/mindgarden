import { createRouter, createWebHistory } from "vue-router";
import { checkAuth, authState } from "../store/auth";

import LoginView from "../views/LoginView.vue";
import RegisterView from "../views/RegisterView.vue";
import ChatView from "../views/ChatView.vue";
import VoidView from "../views/VoidView.vue";
import AdminView from "../views/AdminView.vue";
import WordleView from "../views/WordleView.vue";
import LeaderboardView from "../views/LeaderboardView.vue";
import SonglessView from "../views/SonglessView.vue";
import SoulGuardView from "../views/SoulGuardView.vue";
import TowerStackView from "../views/TowerStackView.vue";
import RhythmPulseView from "../views/RhythmPulseView.vue";

const routes = [
  { path: "/", redirect: "/void" },

  // --- Các route chỉ dành cho khách (Guest-only) ---
  {
    path: "/login",
    name: "login",
    component: LoginView,
    meta: { guestOnly: true }
  },
  {
    path: "/register",
    name: "register",
    component: RegisterView,
    meta: { guestOnly: true }
  },

  // --- Các route yêu cầu đăng nhập (Protected Routes) ---
  { path: "/void", name: "void", component: VoidView, meta: { requiresAuth: true } },
  { path: "/chat", name: "chat", component: ChatView, meta: { requiresAuth: true } },
  { path: "/admin", name: "admin", component: AdminView, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: "/wordle", name: "wordle", component: WordleView, meta: { requiresAuth: true } },
  { path: "/songless", name: "songless", component: SonglessView, meta: { requiresAuth: true } },
  { path: "/soul-guard", name: "soul-guard", component: SoulGuardView, meta: { requiresAuth: true } },
  { path: "/tower-stack", name: "tower-stack", component: TowerStackView, meta: { requiresAuth: true } },
  { path: "/leaderboard", name: "leaderboard", component: LeaderboardView, meta: { requiresAuth: true } },
  { path: "/rhythm-pulse", name: "rhythm-pulse", component: RhythmPulseView, meta: { requiresAuth: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
  const token = localStorage.getItem("token");

  // Nếu có token nhưng chưa tải thông tin user (hoặc vừa mới đăng nhập xong) -> gọi checkAuth()
  if (token && (!authState.isAuthLoaded || !authState.user)) {
    await checkAuth();
  } else if (!token) {
    authState.isAuthenticated = false;
    authState.user = null;
    authState.isAuthLoaded = true;
  }

  let savedUser = null;
  try {
    savedUser = JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    savedUser = null;
  }

  const isAuth = Boolean(authState.isAuthenticated || token);
  const isAdmin =
    authState.user?.role === "admin" ||
    savedUser?.role === "admin";

  // 1. Cần đăng nhập nhưng chưa đăng nhập -> Đẩy về Login
  if (to.meta.requiresAuth && !isAuth) {
    return next({ name: "login" });
  }
  // 2. Cần quyền Admin nhưng không phải Admin -> Đẩy về Void
  if (to.meta.requiresAdmin && !isAdmin) {
    alert("Bạn không có đặc quyền truy cập khu vực này!");
    return next({ name: "void" });
  }
  // 3. Đã đăng nhập nhưng vào lại Login/Register -> Đẩy về The Void
  if (to.meta.guestOnly && isAuth) {
    return next({ name: "void" });
  }

  next();
});

export default router;