<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const fullName = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const errorMsg = ref('');
const isLoading = ref(false);

const validateForm = () => {
  if (!fullName.value || !email.value || !password.value || !confirmPassword.value) {
    return 'Vui lòng điền đầy đủ thông tin.';
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.value)) {
    return 'Định dạng email không hợp lệ.';
  }
  
  if (password.value.length < 8) {
    return 'Mật khẩu phải có ít nhất 8 ký tự.';
  }
  
  if (password.value !== confirmPassword.value) {
    return 'Mật khẩu xác nhận không khớp.';
  }
  
  return '';
};

const handleRegister = async () => {
  errorMsg.value = validateForm();
  if (errorMsg.value) return;

  isLoading.value = true;
  try {
    const { data } = await axios.post('http://localhost:5000/api/auth/register', {
      fullName: fullName.value,
      email: email.value,
      password: password.value,
      confirmPassword: confirmPassword.value
    });

    if (data.success) {
      alert('Đăng ký thành công! Vui lòng đăng nhập.');
      router.push('/login');
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
      <h2>Tạo tài khoản mới</h2>
      <p class="subtitle">Bắt đầu hành trình chăm sóc tâm trí của bạn.</p>

      <form @submit.prevent="handleRegister" class="auth-form">
        <div class="input-group">
          <label>Họ và Tên</label>
          <input v-model="fullName" type="text" placeholder="Vd: Nguyễn Văn A" :disabled="isLoading" />
        </div>

        <div class="input-group">
          <label>Email</label>
          <input v-model="email" type="email" placeholder="Nhập email của bạn" :disabled="isLoading" />
        </div>

        <div class="input-group">
          <label>Mật khẩu</label>
          <input v-model="password" type="password" placeholder="Tối thiểu 8 ký tự" :disabled="isLoading" />
        </div>

        <div class="input-group">
          <label>Xác nhận mật khẩu</label>
          <input v-model="confirmPassword" type="password" placeholder="Nhập lại mật khẩu" :disabled="isLoading" />
        </div>

        <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>

        <button type="submit" class="submit-btn" :disabled="isLoading">
          {{ isLoading ? 'Đang tạo...' : 'Đăng ký' }}
        </button>
      </form>

      <p class="switch-mode">
        Đã có tài khoản? 
        <router-link to="/login">Đăng nhập ngay</router-link>
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Tái sử dụng toàn bộ CSS từ trang Login */
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
  overflow-y: auto;
  max-height: 90vh;
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