import { createRouter, createWebHistory } from "vue-router";
import { checkAuth, authState } from "../store/auth"; // Import Global State

import LoginView from "../views/LoginView.vue";
import RegisterView from "../views/RegisterView.vue"; // Thêm trang Đăng ký
import ChatView from "../views/ChatView.vue";
import VoidView from "../views/VoidView.vue";
import AdminView from "../views/AdminView.vue";
import WordleView from '../views/WordleView.vue';
import LeaderboardView from '../views/LeaderboardView.vue';
import SonglessView from '../views/SonglessView.vue';
import SoulGuardView from '../views/SoulGuardView.vue';


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
  { path: "/chat", name: "chat", component: ChatView, meta: { requiresAuth: true } },
  { path: "/void", name: "void", component: VoidView, meta: { requiresAuth: true } },
  { path: "/admin", name: "admin", component: AdminView, meta: { requiresAuth: true, requiresAdmin: true } },
  {
  path: '/wordle',
  name: 'wordle',
  component: WordleView
},
{
  path: '/leaderboard',
  name: 'leaderboard',
  component: LeaderboardView
},
{
  path: '/songless',
  name: 'songless',
  component: SonglessView
},
{
  path: '/soul-guard',
  name: 'soul-guard',
  component: SoulGuardView
}
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guard bảo vệ Route an toàn hơn
router.beforeEach(async (to, from, next) => {
  if (!authState.isAuthLoaded) {
    await checkAuth();
  }

  const isAuth = authState.isAuthenticated;
  const isAdmin = authState.user?.role === 'admin'; // Kiểm tra quyền admin

  // 1. Cần đăng nhập nhưng chưa đăng nhập -> Đẩy về Login
  if (to.meta.requiresAuth && !isAuth) {
    next({ name: "login" });
  } 
  // 2. Cần quyền Admin nhưng không phải Admin -> Đẩy về Void (Khóa cửa)
  else if (to.meta.requiresAdmin && !isAdmin) {
    alert("Bạn không có đặc quyền truy cập khu vực này!");
    next({ name: "void" });
  }
  // 3. Đã đăng nhập nhưng cố vào lại Login/Register -> Đẩy về Chat
  else if (to.meta.guestOnly && isAuth) {
    next({ name: "chat" });
  } 
  // 4. Hợp lệ -> Cho qua
  else {
    next();
  }
});

export default router;