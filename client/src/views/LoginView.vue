<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { authState } from '../store/auth';

const router = useRouter();
const email = ref('');
const password = ref('');
const errorMsg = ref('');
const isLoading = ref(false);

const handleLogin = async () => {
  errorMsg.value = '';
  
  if (!email.value || !password.value) {
    errorMsg.value = 'Vui lòng nhập Email và Mật khẩu.';
    return;
  }

  isLoading.value = true;
  try {
    const { data } = await axios.post('http://localhost:5000/api/auth/login', {
      email: email.value,
      password: password.value
    });

    if (data.success) {
      localStorage.setItem('token', data.token);
      authState.isAuthenticated = true;
      authState.user = data.user;
      router.push('/chat');
    }
  } catch (err) {
    errorMsg.value = err.response?.data?.message || 'Lỗi kết nối đến máy chủ.';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="auth-wrapper">
    <div class="auth-card glass">
      <h2>Chào mừng trở lại</h2>
      <p class="subtitle">Khu vườn tâm trí luôn mở cửa đón bạn.</p>

      <form @submit.prevent="handleLogin" class="auth-form">
        <div class="input-group">
          <label>Email</label>
          <input v-model="email" type="email" placeholder="Nhập email của bạn" :disabled="isLoading" />
        </div>

        <div class="input-group">
          <label>Mật khẩu</label>
          <input v-model="password" type="password" placeholder="Nhập mật khẩu" :disabled="isLoading" />
        </div>

        <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>

        <button type="submit" class="submit-btn" :disabled="isLoading">
          {{ isLoading ? 'Đang vào vườn...' : 'Đăng nhập' }}
        </button>
      </form>

      <p class="switch-mode">
        Chưa có tài khoản? 
        <router-link to="/register">Đăng ký ngay</router-link>
      </p>
    </div>
  </div>
</template>

<style scoped>
.auth-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  height: 100%;
  overflow: hidden;
}

.auth-card {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  border-radius: 16px;
  background: var(--surface-strong, rgba(255, 255, 255, 0.1));
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.auth-card h2 {
  margin: 0 0 0.5rem;
  text-align: center;
  color: var(--text-primary);
}

.subtitle {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.9rem;
  margin-bottom: 2rem;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.input-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.input-group input {
  padding: 0.75rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-color);
  color: var(--text-primary);
  font-size: 1rem;
}

.error-text {
  color: #ef4444;
  font-size: 0.85rem;
  margin: 0;
  text-align: center;
}

.submit-btn {
  padding: 0.85rem;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  font-weight: bold;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.3s;
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.submit-btn:hover:not(:disabled) {
  background: var(--accent-hover, #4f46e5);
}

.switch-mode {
  margin-top: 1.5rem;
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.switch-mode a {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
</style>