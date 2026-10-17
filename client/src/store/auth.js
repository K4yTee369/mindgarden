import { reactive } from 'vue';
import axios from 'axios';

export const authState = reactive({
  isAuthenticated: false,
  user: null,
  isAuthLoaded: false // Dùng để tránh chuyển trang trước khi check xong token
});

// Cấu hình mặc định cho Axios để luôn gửi Token nếu có
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const checkAuth = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    authState.isAuthenticated = false;
    authState.user = null;
    authState.isAuthLoaded = true;
    return false;
  }

  try {
    const { data } = await axios.get('http://localhost:5000/api/auth/me');
    if (data.success) {
      authState.isAuthenticated = true;
      authState.user = data.user;
    }
  } catch (error) {
    localStorage.removeItem('token');
    authState.isAuthenticated = false;
    authState.user = null;
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
    authState.isAuthenticated = false;
    authState.user = null;
    window.location.href = '/login';
  }
};