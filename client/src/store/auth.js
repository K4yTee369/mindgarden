import { reactive } from 'vue';
import axios from 'axios';

const getSavedUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};

export const authState = reactive({
  isAuthenticated: Boolean(localStorage.getItem('token')),
  user: getSavedUser(),
  isAuthLoaded: false
});

// Luôn đính kèm Bearer Token vào mọi request gửi lên Server
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const checkAuth = async () => {
  const token = localStorage.getItem('token');
  const savedUser = getSavedUser();

  // Nếu không có token trong máy -> Chưa đăng nhập
  if (!token) {
    authState.isAuthenticated = false;
    authState.user = null;
    authState.isAuthLoaded = true;
    return false;
  }

  // Khôi phục ngay lập tức thông tin User/Admin từ localStorage
  authState.isAuthenticated = true;
  if (savedUser) {
    authState.user = savedUser;
  }

  try {
    const { data } = await axios.get('http://localhost:5000/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (data.success && data.user) {
      const mergedUser = {
        ...(savedUser || {}),
        ...data.user,
        role: data.user.role || savedUser?.role || 'user'
      };
      authState.user = mergedUser;
      localStorage.setItem('user', JSON.stringify(mergedUser));
    }
  } catch (error) {
    // QUAN TRỌNG: Không xóa token/user khi /api/auth/me báo 401, giữ nguyên thông tin từ lúc Login
    console.warn('Giữ phiên đăng nhập từ localStorage.');
  } finally {
    authState.isAuthLoaded = true;
  }

  return authState.isAuthenticated;
};

export const logout = async () => {
  try {
    await axios.post('http://localhost:5000/api/auth/logout');
  } catch (err) {
    console.error(err);
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    authState.isAuthenticated = false;
    authState.user = null;
    authState.isAuthLoaded = false;
    window.location.href = '/login';
  }
};