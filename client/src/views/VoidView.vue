<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { authState } from '../store/auth';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

const posts = ref([]);
const newPostContent = ref('');
const customTagInput = ref('General');
const isAnonymous = ref(false);
const selectedFiles = ref([]);
const previewUrls = ref([]);
const isSubmitting = ref(false);

// Bộ lọc và tìm kiếm Hashtag
const QUICK_SUGGESTED_TAGS = ['Academic', 'Relationships', 'Burnout', 'Anxiety', 'Family', 'General'];
const selectedFilterTag = ref('All');
const searchHashtagQuery = ref('');

// Modal chi tiết & Bình luận
const selectedPost = ref(null);
const newCommentText = ref('');
const isSendingComment = ref(false);

const cleanTagString = (raw) => {
  if (!raw) return 'General';
  const cleaned = String(raw).trim().replace(/^#+/, '').trim();
  return cleaned || 'General';
};

// Xử lý đường dẫn ảnh tương thích cả localhost lẫn Render
const getImageUrl = (imgPath) => {
  if (!imgPath) return '';
  if (imgPath.startsWith('data:') || imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
    return imgPath;
  }
  const cleanPath = imgPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${API_BASE_URL}/${cleanPath}`;
};

// Tự động tổng hợp mọi Hashtag xuất hiện trên Feed
const availableHashtags = computed(() => {
  const tagSet = new Set(QUICK_SUGGESTED_TAGS);
  if (Array.isArray(posts.value)) {
    posts.value.forEach((p) => {
      if (p.tag) tagSet.add(cleanTagString(p.tag));
    });
  }
  return Array.from(tagSet);
});

// Lọc bài viết theo nút Hashtag và ô tìm kiếm
const filteredPosts = computed(() => {
  if (!Array.isArray(posts.value)) return [];
  return posts.value.filter((post) => {
    const postTag = cleanTagString(post.tag).toLowerCase();
    const postContent = (post.content || '').toLowerCase();

    const matchBtn =
      selectedFilterTag.value === 'All' ||
      postTag === cleanTagString(selectedFilterTag.value).toLowerCase();

    const rawQuery = searchHashtagQuery.value.trim().replace(/^#+/, '').toLowerCase();
    const matchQuery =
      !rawQuery ||
      postTag.includes(rawQuery) ||
      postContent.includes(`#${rawQuery}`);

    return matchBtn && matchQuery;
  });
});

const filterByClickingTag = (tagValue) => {
  const clean = cleanTagString(tagValue);
  selectedFilterTag.value = clean;
  searchHashtagQuery.value = `#${clean}`;
};

const clearHashtagFilter = () => {
  selectedFilterTag.value = 'All';
  searchHashtagQuery.value = '';
};

const fetchPosts = async () => {
  try {
    const { data } = await axios.get('http://localhost:5000/api/void');
    posts.value = Array.isArray(data) ? data : (data.posts || []);
  } catch (error) {
    console.error('Lỗi tải bài viết The Void:', error);
  }
};

const handleFileSelect = (e) => {
  const files = Array.from(e.target.files || []);
  selectedFiles.value.push(...files);
  files.forEach((file) => {
    previewUrls.value.push(URL.createObjectURL(file));
  });
  e.target.value = '';
};

const removeImage = (index) => {
  selectedFiles.value.splice(index, 1);
  previewUrls.value.splice(index, 1);
};

const submitPost = async () => {
  if (!newPostContent.value.trim() && selectedFiles.value.length === 0) return;
  isSubmitting.value = true;

  try {
    const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const token = localStorage.getItem('token');
    const formData = new FormData();

    formData.append('content', newPostContent.value);
    formData.append('tag', cleanTagString(customTagInput.value));
    formData.append('isAnonymous', String(isAnonymous.value));
    if (savedUser.fullName) formData.append('authorName', savedUser.fullName);
    if (savedUser._id || savedUser.id) formData.append('userId', savedUser._id || savedUser.id);

    selectedFiles.value.forEach((file) => {
      formData.append('images', file);
    });

    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const { data } = await axios.post('http://localhost:5000/api/void', formData, { headers });

    if (data.status === 'pending') {
      alert(data.message || 'Bài viết của bạn đang chờ quản trị viên phê duyệt.');
    }

    newPostContent.value = '';
    customTagInput.value = 'General';
    selectedFiles.value = [];
    previewUrls.value = [];
    await fetchPosts();
  } catch (error) {
    console.error('Lỗi đăng bài:', error);
    alert(error.response?.data?.message || 'Không thể đăng bài lúc này.');
  } finally {
    isSubmitting.value = false;
  }
};

const openModal = (post) => {
  selectedPost.value = post;
};

const closeModal = () => {
  selectedPost.value = null;
  newCommentText.value = '';
};

const submitComment = async () => {
  if (!newCommentText.value.trim() || !selectedPost.value) return;
  isSendingComment.value = true;

  try {
    const savedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const token = localStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const payload = {
      text: newCommentText.value,
      content: newCommentText.value,
      authorName: savedUser.fullName || 'Người dùng'
    };

    const { data } = await axios.post(
      `http://localhost:5000/api/void/${selectedPost.value._id}/comment`,
      payload,
      { headers }
    );

    const updatedPost = data.post || data;
    if (updatedPost && updatedPost.comments) {
      selectedPost.value.comments = updatedPost.comments;
    } else {
      selectedPost.value.comments = selectedPost.value.comments || [];
      selectedPost.value.comments.push({
        ...payload,
        createdAt: new Date().toISOString()
      });
    }

    newCommentText.value = '';
    await fetchPosts();
  } catch (error) {
    console.error('Lỗi gửi bình luận:', error);
  } finally {
    isSendingComment.value = false;
  }
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Lấy đúng số thứ tự bài đăng (#45, #46...)
const getPostBadgeNumber = (post) => {
  return post?.postId ?? post?.postNumber ?? post?.number ?? null;
};

// Lấy đúng tên người đăng từ Database
const getPostAuthorName = (post) => {
  if (!post || post.isAnonymous) return 'Ẩn danh';
  if (typeof post.author === 'string' && post.author.trim()) return post.author;
  if (post.author?.fullName) return post.author.fullName;
  if (post.authorName) return post.authorName;
  if (post.user?.fullName) return post.user.fullName;
  return 'Ẩn danh';
};

// Lấy đúng tên người bình luận
const getCommentAuthorName = (cmt) => {
  if (!cmt) return 'Ẩn danh';
  if (typeof cmt.author === 'string' && cmt.author.trim()) return cmt.author;
  if (cmt.author?.fullName) return cmt.author.fullName;
  if (cmt.authorName) return cmt.authorName;
  return 'Ẩn danh';
};

onMounted(() => {
  fetchPosts();
});
</script>

<template>
  <div class="void-scroll-wrapper">
    <div class="void-split-layout">
      
      <!-- CỘT TRÁI: ĐĂNG BÀI MỚI & BỘ LỌC TÌM KIẾM HASHTAG -->
      <aside class="void-left-column glass">
        <div class="column-header">
          <h1>The Void</h1>
          <p class="subtitle">Chia sẻ tâm sự, suy nghĩ và kết nối cùng cộng đồng</p>
        </div>

        <!-- 1. Khung tạo bài đăng -->
        <div class="void-input-box">
          <textarea
            v-model="newPostContent"
            rows="4"
            placeholder="Chia sẻ suy nghĩ của bạn..."
          ></textarea>

          <!-- Preview ảnh đính kèm trước khi đăng -->
          <div v-if="previewUrls.length > 0" class="image-preview-container">
            <div v-for="(url, idx) in previewUrls" :key="idx" class="preview-item">
              <img :src="url" alt="Preview" />
              <button type="button" class="remove-img-btn" @click="removeImage(idx)">×</button>
            </div>
          </div>

          <!-- Khu vực tự nhập Hashtag & Gợi ý nhanh -->
          <div class="custom-hashtag-box">
            <div class="hashtag-input-wrapper">
              <span class="hash-prefix">#</span>
              <input
                type="text"
                v-model="customTagInput"
                class="hashtag-input"
                placeholder="Tự nhập hashtag (VD: Academic, TamSu, Deadline...)"
                maxlength="30"
              />
            </div>

            <div class="quick-tags-row">
              <span class="quick-label">Gợi ý:</span>
              <button
                v-for="sug in QUICK_SUGGESTED_TAGS"
                :key="sug"
                type="button"
                class="quick-tag-chip"
                :class="{ active: cleanTagString(customTagInput).toLowerCase() === sug.toLowerCase() }"
                @click="customTagInput = sug"
              >
                #{{ sug }}
              </button>
            </div>
          </div>

          <!-- Nút Ẩn danh, Thêm Ảnh & Gửi đi -->
          <div class="void-input-footer">
            <div class="footer-left">
              <label class="anon-toggle">
                <input type="checkbox" v-model="isAnonymous" />
                <span>Ẩn danh</span>
              </label>

              <label class="upload-btn">
                Thêm Ảnh
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  style="display: none"
                  @change="handleFileSelect"
                />
              </label>
            </div>

            <button
              class="post-btn"
              :disabled="isSubmitting || (!newPostContent.trim() && selectedFiles.length === 0)"
              @click="submitPost"
            >
              {{ isSubmitting ? 'Đang gửi...' : 'Gửi đi' }}
            </button>
          </div>
        </div>

        <hr class="divider" />

        <!-- 2. Thanh tìm kiếm & lọc bài viết theo Hashtag -->
        <div class="void-search-filter-bar">
          <div class="search-hashtag-box">
            <input
              type="text"
              v-model="searchHashtagQuery"
              class="search-hashtag-input"
              placeholder="Tìm bài đăng theo #hashtag (VD: #Burnout)..."
            />
            <button
              v-if="searchHashtagQuery || selectedFilterTag !== 'All'"
              class="clear-search-btn"
              @click="clearHashtagFilter"
            >
              Xóa lọc
            </button>
          </div>

          <div class="filter-tags-scroll">
            <button
              class="filter-pill"
              :class="{ active: selectedFilterTag === 'All' && !searchHashtagQuery }"
              @click="clearHashtagFilter"
            >
              Tất cả ({{ posts.length }})
            </button>
            <button
              v-for="tagItem in availableHashtags"
              :key="tagItem"
              class="filter-pill"
              :class="{ active: selectedFilterTag.toLowerCase() === tagItem.toLowerCase() }"
              @click="selectedFilterTag = tagItem; searchHashtagQuery = ''"
            >
              #{{ tagItem }}
            </button>
          </div>
        </div>
      </aside>

      <!-- CỘT PHẢI: LUỒNG BÀI VIẾT (STATUS FEED) RỘNG RÃI -->
      <main class="void-right-feed">
        <div v-if="filteredPosts.length === 0" class="empty-feed glass">
          Chưa có bài viết nào khớp với bộ lọc hiện tại.
        </div>

        <div
          v-for="post in filteredPosts"
          :key="post._id"
          class="post-card glass"
          @click="openModal(post)"
        >
          <div class="post-header">
            <span v-if="getPostBadgeNumber(post)" class="post-id-badge">
              #{{ getPostBadgeNumber(post) }}
            </span>
            <span class="post-author">{{ getPostAuthorName(post) }}</span>
            <span
              class="post-tag"
              @click.stop="filterByClickingTag(post.tag)"
              title="Nhấn để lọc theo hashtag này"
            >
              #{{ cleanTagString(post.tag) }}
            </span>
          </div>

          <p class="post-text">{{ post.content }}</p>

          <!-- Ảnh đính kèm thu nhỏ -->
          <div v-if="post.images && post.images.length > 0" class="post-thumbnail-wrapper">
            <img :src="getImageUrl(post.images[0])" alt="Post image" class="thumbnail-img" />
            <div v-if="post.images.length > 1" class="more-images-overlay">
              +{{ post.images.length - 1 }}
            </div>
          </div>

          <div class="post-footer">
            <span class="post-timestamp">{{ formatDate(post.createdAt) }}</span>
            <span class="comment-prompt">
              💬 {{ post.comments ? post.comments.length : 0 }} Bình luận (Nhấn để xem)
            </span>
          </div>
        </div>
      </main>

    </div>

    <!-- MODAL CHI TIẾT BÀI VIẾT & BÌNH LUẬN -->
    <div v-if="selectedPost" class="modal-overlay" @click.self="closeModal">
      <div class="post-modal glass">
        <button class="close-modal-btn" @click="closeModal">×</button>

        <div class="modal-body">
          <div class="modal-header">
            <span v-if="getPostBadgeNumber(selectedPost)" class="post-id-badge">
              #{{ getPostBadgeNumber(selectedPost) }}
            </span>
            <span class="post-author">{{ getPostAuthorName(selectedPost) }}</span>
            <span class="post-tag">#{{ cleanTagString(selectedPost.tag) }}</span>
          </div>

          <p class="modal-text">{{ selectedPost.content }}</p>

          <!-- Lưới ảnh trong Modal -->
          <div
            v-if="selectedPost.images && selectedPost.images.length > 0"
            class="modal-image-grid"
            :class="`grid-${Math.min(selectedPost.images.length, 4)}`"
          >
            <a
              v-for="(img, i) in selectedPost.images"
              :key="i"
              :href="getImageUrl(img)"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img :src="getImageUrl(img)" alt="Full attachment" class="full-img" />
            </a>
          </div>

          <hr class="divider" />

          <!-- Danh sách bình luận -->
          <div class="comments-list">
            <div v-if="!selectedPost.comments || selectedPost.comments.length === 0" class="no-comments">
              Chưa có bình luận nào. Hãy gửi lời động viên đầu tiên!
            </div>

            <div
              v-for="(cmt, cIdx) in selectedPost.comments"
              :key="cIdx"
              class="comment-item"
            >
              <span class="comment-author">{{ getCommentAuthorName(cmt) }}</span>
              <span class="comment-text">{{ cmt.text || cmt.content }}</span>
              <span class="comment-time">{{ formatDate(cmt.createdAt) }}</span>
            </div>
          </div>
        </div>

        <!-- Ô nhập bình luận ở đáy Modal -->
        <div class="comment-input-area">
          <input
            type="text"
            v-model="newCommentText"
            placeholder="Viết bình luận chia sẻ..."
            @keydown.enter.prevent="submitComment"
          />
          <button
            class="send-comment-btn"
            :disabled="!newCommentText.trim() || isSendingComment"
            @click="submitComment"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Khung cuộn 2 cột toàn màn hình */
.void-scroll-wrapper {
  width: 100%;
  height: calc(100vh - 64px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px 40px;
  box-sizing: border-box;
}

.void-split-layout {
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 22px;
  align-items: start;
}

/* Cột trái cố định khi cuộn cột phải trên máy tính */
.void-left-column {
  position: sticky;
  top: 0;
  padding: 20px;
  border-radius: 14px;
  background: rgba(30, 41, 59, 0.78);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.column-header h1 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary, #f8fafc);
}

.subtitle {
  margin: 4px 0 0;
  font-size: 0.84rem;
  color: var(--text-secondary, #94a3b8);
}

/* Cột phải chứa danh sách bài đăng trải dài */
.void-right-feed {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.empty-feed {
  padding: 40px 20px;
  text-align: center;
  border-radius: 12px;
  color: var(--text-secondary, #94a3b8);
}

/* Khung nhập bài đăng */
.void-input-box {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.void-input-box textarea {
  resize: none;
  padding: 0.75rem;
  width: 100%;
  box-sizing: border-box;
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.14);
  color: var(--text-primary, #f8fafc);
  border-radius: 10px;
  font-family: inherit;
  font-size: 0.92rem;
  outline: none;
}

.void-input-box textarea:focus {
  border-color: #3b82f6;
}

/* Upload Ảnh */
.image-preview-container {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.preview-item {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.preview-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.remove-img-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  border: none;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.void-input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.25rem;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.anon-toggle {
  font-size: 0.85rem;
  color: var(--text-secondary, #cbd5e1);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.upload-btn {
  cursor: pointer;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-primary, #e2e8f0);
  background: rgba(51, 65, 85, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 0.4rem 0.75rem;
  border-radius: 8px;
}

.post-btn {
  padding: 0.5rem 1.15rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}

.post-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Khung tự nhập Hashtag khi đăng bài */
.custom-hashtag-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 4px 0;
}

.hashtag-input-wrapper {
  display: flex;
  align-items: center;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  padding: 0 12px;
  transition: border-color 0.2s;
}

.hashtag-input-wrapper:focus-within {
  border-color: #3b82f6;
}

.hash-prefix {
  color: #60a5fa;
  font-weight: 800;
  font-size: 1rem;
  margin-right: 4px;
}

.hashtag-input {
  width: 100%;
  padding: 9px 4px;
  background: transparent;
  border: none;
  color: #f8fafc;
  font-size: 0.86rem;
  outline: none;
}

.quick-tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-label {
  font-size: 0.76rem;
  color: #94a3b8;
  margin-right: 2px;
}

.quick-tag-chip {
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.6);
  color: #cbd5e1;
  font-size: 0.76rem;
  cursor: pointer;
  transition: all 0.15s;
}

.quick-tag-chip.active,
.quick-tag-chip:hover {
  background: #3b82f6;
  color: #ffffff;
  border-color: #60a5fa;
}

/* Thanh tìm kiếm & lọc Hashtag */
.void-search-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search-hashtag-box {
  display: flex;
  gap: 8px;
}

.search-hashtag-input {
  flex: 1;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(15, 23, 42, 0.75);
  color: #f8fafc;
  font-size: 0.85rem;
  outline: none;
}

.search-hashtag-input:focus {
  border-color: #3b82f6;
}

.clear-search-btn {
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(51, 65, 85, 0.7);
  color: #e2e8f0;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.filter-tags-scroll {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  max-height: 150px;
  overflow-y: auto;
}

.filter-pill {
  padding: 5px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.75);
  color: #cbd5e1;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-pill.active {
  background: #60a5fa;
  color: #0f172a;
  border-color: #60a5fa;
}

/* Thẻ bài viết bên cột phải */
.post-card {
  padding: 1.15rem;
  border-radius: 14px;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.post-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
}

.post-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.post-id-badge {
  background: #ef4444;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
}

.post-author {
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--text-primary, #f8fafc);
}

.post-tag {
  margin-left: auto;
  font-size: 0.8rem;
  color: #60a5fa;
  font-weight: 600;
}

.post-tag:hover {
  text-decoration: underline;
}

.post-text {
  margin: 0;
  color: var(--text-primary, #f1f5f9);
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.post-thumbnail-wrapper {
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: 10px;
  overflow: hidden;
  margin-top: 0.35rem;
}

.thumbnail-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.more-images-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: bold;
}

.post-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.35rem;
}

.post-timestamp {
  font-size: 0.76rem;
  color: var(--text-muted, #94a3b8);
}

.comment-prompt {
  font-size: 0.8rem;
  color: var(--text-secondary, #cbd5e1);
  font-weight: 600;
  padding: 0.3rem 0.7rem;
  background: rgba(15, 23, 42, 0.55);
  border-radius: 999px;
}

/* MODAL CHI TIẾT */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
  box-sizing: border-box;
}

.post-modal {
  width: 100%;
  max-width: 620px;
  max-height: 85vh;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  position: relative;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.close-modal-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(148, 163, 184, 0.2);
  border: none;
  font-size: 1.2rem;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #f8fafc;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding-right: 2rem;
}

.modal-text {
  font-size: 1rem;
  line-height: 1.55;
  color: #f8fafc;
  white-space: pre-wrap;
  margin: 0;
}

.modal-image-grid {
  display: grid;
  gap: 6px;
  border-radius: 10px;
  overflow: hidden;
  margin-top: 0.25rem;
  flex-shrink: 0;
}

.grid-1 { grid-template-columns: 1fr; }
.grid-2 { grid-template-columns: 1fr 1fr; }
.grid-3 { grid-template-columns: 1fr 1fr; }
.grid-3 a:first-child { grid-column: span 2; }
.grid-4 { grid-template-columns: 1fr 1fr; }

.full-img {
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  display: block;
}

.divider {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin: 4px 0;
}

/* Bình luận */
.comments-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comment-item {
  background: rgba(30, 41, 59, 0.8);
  padding: 0.8rem 1rem;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.comment-author {
  font-weight: 700;
  font-size: 0.84rem;
  color: #60a5fa;
}

.comment-text {
  font-size: 0.92rem;
  color: #f1f5f9;
}

.comment-time {
  font-size: 0.7rem;
  color: #94a3b8;
  align-self: flex-end;
}

.no-comments {
  text-align: center;
  color: #94a3b8;
  font-size: 0.88rem;
  padding: 12px 0;
}

.comment-input-area {
  padding: 0.9rem 1.2rem;
  background: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  align-items: center;
  display: flex;
  gap: 0.6rem;
  flex-shrink: 0;
}

.comment-input-area input {
  flex: 1;
  padding: 0.7rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(30, 41, 59, 0.9);
  color: #f8fafc;
  outline: none;
}

.send-comment-btn {
  background: #3b82f6;
  color: white;
  border: none;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-comment-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Tự động xếp thành 1 cột gọn gàng khi mở trên điện thoại */
@media (max-width: 920px) {
  .void-split-layout {
    grid-template-columns: 1fr;
  }
  .void-left-column {
    position: static;
  }
}
</style>