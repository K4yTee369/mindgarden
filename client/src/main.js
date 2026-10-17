import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import "./style.css";
import axios from 'axios';

// Tự động nhận diện môi trường: Trên mây dùng VITE_API_URL, ở máy dùng localhost:5000
const PROD_API_URL = import.meta.env.VITE_API_URL;


if (PROD_API_URL) {
  axios.interceptors.request.use((config) => {
    if (config.url && config.url.includes('http://localhost:5000')) {
      config.url = config.url.replace('http://localhost:5000', PROD_API_URL.replace(/\/$/, ''));
    }
    return config;
  });
}

createApp(App).use(router).mount("#app");
