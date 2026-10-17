<script setup>
import { ref, computed, onMounted } from "vue";
import axios from "axios";
import { authState } from "../store/auth";

const VOID_TAGS = ["Academic", "Relationships", "Burnout", "Anxiety", "Family", "General"];
const posts = ref([]);
const draft = ref("");
const isAnonymous = ref(true);
const isSubmitting = ref(false);
const selectedTag = ref(VOID_TAGS[0]);

const selectedImages = ref([]);
const imagePreviews = ref([]);

// Filter
const activeFilter = ref("All");
const filterOptions = ["All", ...VOID_TAGS];

// Modal chi tiết bài viết
const selectedPost = ref(null);
const commentDraft = ref("");
const isSubmittingComment = ref(false);
const isCommentAnonymous = ref(false);

const customTagInput = ref('General'); // Mặc định nếu người dùng để trống
const searchHashtagQuery = ref('');    // Từ khóa người dùng gõ vào ô Search
const selectedFilterTag = ref('All');  // Thẻ đang bấm lọc ('All' là Tất cả)

const QUICK_SUGGESTED_TAGS = ['Academic', 'Relationships', 'Burnout', 'Anxiety', 'Family', 'General'];

const cleanTagString = (raw) => {
  if (!raw) return 'General';
  const cleaned = raw.trim().replace(/^#+/, '').trim();
  return cleaned || 'General';
};

const availableHashtags = computed(() => {
  const tagSet = new Set(QUICK_SUGGESTED_TAGS);
  if (Array.isArray(posts.value)) {
    posts.value.forEach((p) => {
      if (p.tag) tagSet.add(cleanTagString(p.tag));
    });
  }
  return Array.from(tagSet);
});

const filteredPosts = computed(() => {
  if (!Array.isArray(posts.value)) return [];

  return posts.value.filter((post) => {
    const postTag = cleanTagString(post.tag).toLowerCase();
    const postContent = (post.content || '').toLowerCase();

    // 1. Lọc theo nút Tag đang chọn (nếu khác 'All')
    const matchSelectedBtn =
      selectedFilterTag.value === 'All' ||
      postTag === cleanTagString(selectedFilterTag.value).toLowerCase();

    // 2. Lọc theo ô Search Hashtag (người dùng có thể gõ #academic hoặc academic)
    const rawQuery = searchHashtagQuery.value.trim().replace(/^#+/, '').toLowerCase();
    const matchSearchInput =
      !rawQuery ||
      postTag.includes(rawQuery) ||
      postContent.includes(`#${rawQuery}`);

    return matchSelectedBtn && matchSearchInput;
  });
});

const filterByClickingTag = (tagValue) => {
  const clean = cleanTagString(tagValue);
  selectedFilterTag.value = clean;
  searchHashtagQuery.value = `#${clean}`;
};

// Xóa bộ lọc tìm kiếm
const clearHashtagFilter = () => {
  selectedFilterTag.value = 'All';
  searchHashtagQuery.value = '';
};

// const filteredPosts = computed(() => {
//   if (activeFilter.value === "All") return posts.value;
//   return posts.value.filter((p) => p.tag === activeFilter.value);
// });

function currentUserDisplayName() {
  return authState.user?.fullName || "Stranger";
}

// Xử lý chọn ảnh (Tối đa 4 ảnh)
function handleImageSelect(event) {
  const files = Array.from(event.target.files);
  if (files.length + selectedImages.value.length > 4) {
    alert("Chỉ được tải lên tối đa 4 hình ảnh.");
    return;
  }

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreviews.value.push(e.target.result); // Lưu chuỗi Base64
      selectedImages.value.push(file);
    };
    reader.readAsDataURL(file);
  });
  event.target.value = ''; // Reset input
}

function removeImage(index) {
  imagePreviews.value.splice(index, 1);
  selectedImages.value.splice(index, 1);
}

async function fetchPosts() {
  try {
    const { data } = await axios.get('http://localhost:5000/api/void');
    posts.value = data.map(p => ({
      ...p,
      text: p.content,
      timestamp: p.createdAt,
      images: p.images || [],
      comments: p.comments || []
    }));
  } catch (error) {
    console.error("Lỗi tải bảng tin:", error);
  }
}

// async function submitPost() {
//   const text = draft.value.trim();
//   if (!text && imagePreviews.value.length === 0) return;

//   isSubmitting.value = true;
//   try {
//     const payload = {
//       content: text,
//       author: isAnonymous.value ? "Stranger" : currentUserDisplayName(),
//       tag: selectedTag.value,
//       images: imagePreviews.value
//     };

//     const { data } = await axios.post('http://localhost:5000/api/void', payload);
//     const newPost = {
//       ...data.post,
//       text: data.post.content,
//       timestamp: data.post.createdAt,
//       images: data.post.images || [],
//       comments: []
//     };
    
//     posts.value.unshift(newPost);
//     draft.value = "";
//     selectedImages.value = [];
//     imagePreviews.value = [];
//   } catch (error) {
//     console.error("Lỗi đăng bài:", error);
//   } finally {
//     isSubmitting.value = false;
//   }
// }

async function submitPost() {
  const text = draft.value.trim();
  if (!text && selectedImages.value.length === 0) return;

  isSubmitting.value = true;
  try {
    const formData = new FormData();
    formData.append("content", text);
    formData.append("author", isAnonymous.value ? "Stranger" : currentUserDisplayName());
    formData.append('tag', cleanTagString(customTagInput.value));

    selectedImages.value.forEach(file => {
      formData.append("images", file);
    });

    const { data } = await axios.post('http://localhost:5000/api/void', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    // Nếu bài viết sạch (post có dữ liệu trả về)
    if (data.post) {
      const newPost = {
        ...data.post,
        text: data.post.content,
        timestamp: data.post.createdAt,
        images: data.post.images || [],
        comments: []
      };
      posts.value.unshift(newPost);
    } else {
      // Nếu bài viết bị AI đánh cờ (status: 'pending', post: null)
      alert(data.message);
    }
    
    // Reset form
    draft.value = "";
    selectedImages.value = [];
    imagePreviews.value = [];
  } catch (error) {
    console.error("Lỗi đăng bài:", error);
    // Nếu lỗi do spam (mã 429 từ rate-limit)
    if (error.response?.status === 429) {
      alert(error.response.data.message);
    } else {
      alert("Lỗi máy chủ. Vui lòng thử lại sau.");
    }
  } finally {
    isSubmitting.value = false;
  }
}

// Mở modal
function openPostDetails(post) {
  selectedPost.value = post;
}

function closePostDetails() {
  selectedPost.value = null;
  commentDraft.value = "";
}

// Gửi bình luận
async function submitComment() {
  if (!commentDraft.value.trim() || isSubmittingComment.value || !selectedPost.value) return;
  
  isSubmittingComment.value = true;
  try {
    const author = isCommentAnonymous.value ? "Stranger" : currentUserDisplayName();
    
    const { data } = await axios.post(`http://localhost:5000/api/void/${selectedPost.value.id}/comments`, {
      author,
      text: commentDraft.value.trim()
    });
    
    selectedPost.value.comments.push(data.comment);
    commentDraft.value = "";
  } catch (error) {
    console.error("Lỗi gửi bình luận:", error);
  } finally {
    isSubmittingComment.value = false;
  }
}

function formatTimestamp(date) {
  return new Date(date).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

onMounted(() => { fetchPosts(); });
</script>

<template>
  <div class="void-view">
    <!-- Khu vực nhập bài -->
    <div class="void-input-box glass">
      <textarea v-model="draft" rows="3" placeholder="Chia sẻ suy nghĩ của bạn..." :disabled="isSubmitting"></textarea>
      
      <!-- Hiển thị ảnh xem trước -->
      <div v-if="imagePreviews.length > 0" class="image-preview-container">
        <div v-for="(img, index) in imagePreviews" :key="index" class="preview-item">
          <img :src="img" />
          <button @click="removeImage(index)" class="remove-img-btn">×</button>
        </div>
      </div>

            <!-- 1. KHU VỰC NHẬP HASHTAG TỰ DO TRONG KHUNG ĐĂNG BÀI -->
      <div class="custom-hashtag-box">
        <div class="hashtag-input-wrapper">
          <span class="hash-prefix">#</span>
          <input
            type="text"
            v-model="customTagInput"
            class="hashtag-input"
            placeholder="Hashtag cho bài đăng của bạn"
            maxlength="30"
          />
        </div>

        <!-- Gợi ý nhanh nếu muốn bấm chọn -->
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

            <!-- 2. THANH TÌM KIẾM & LỌC BÀI VIẾT THEO HASHTAG -->
      <div class="void-search-filter-bar">
        <div class="search-hashtag-box">
          <input
            type="text"
            v-model="searchHashtagQuery"
            class="search-hashtag-input"
            placeholder="Tìm kiếm bài đăng theo #hashtag"
          />
          <button
            v-if="searchHashtagQuery || selectedFilterTag !== 'All'"
            class="clear-search-btn"
            @click="clearHashtagFilter"
          >
            Xóa lọc
          </button>
        </div>

        <!-- Danh sách các Hashtag phổ biến (Bao gồm cả các hashtag mới do người dùng tự tạo) -->
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

      <!-- <div class="tag-selector">
        <button v-for="tag in VOID_TAGS" :key="tag" type="button" class="tag-chip" :class="{ 'tag-chip-active': selectedTag === tag }" @click="selectedTag = tag">
          #{{ tag }}
        </button>
      </div> -->

      <div class="void-input-footer">
        <div class="footer-left">
          <label class="anon-toggle">
            <input type="checkbox" v-model="isAnonymous" /> Ẩn danh
          </label>
          <label class="upload-btn">
            Thêm Ảnh
            <input type="file" multiple accept="image/*" @change="handleImageSelect" hidden :disabled="imagePreviews.length >= 4" />
          </label>
        </div>
        <button class="post-btn" @click="submitPost" :disabled="isSubmitting || (!draft.trim() && imagePreviews.length === 0)">
          {{ isSubmitting ? "Đang gửi..." : "Gửi đi" }}
        </button>
      </div>
    </div>

    <!-- Thanh lọc
    <div class="filter-bar">
      <button v-for="option in filterOptions" :key="option" type="button" class="filter-chip" :class="{ 'filter-chip-active': activeFilter === option }" @click="activeFilter = option">
        {{ option === "All" ? "Tất cả" : `#${option}` }}
      </button>
    </div> -->

    <!-- Bảng tin -->
    <div class="void-feed">
      <div v-for="post in filteredPosts" :key="post.id" class="post-card glass" @click="openPostDetails(post)">
        <div class="post-header">
          <span class="post-id-badge">#{{ post.id }}</span>
          <span class="post-author">{{ post.author }}</span>
          <span class="post-tag">#{{ post.tag }}</span>
        </div>
        <p class="post-text">{{ post.text }}</p>
        
        <!-- Thumbnail Ảnh -->
        <div v-if="post.images && post.images.length > 0" class="post-thumbnail-wrapper">
          <img :src="post.images[0]" class="thumbnail-img" />
          <div v-if="post.images.length > 1" class="more-images-overlay">
            +{{ post.images.length - 1 }}
          </div>
        </div>

        <div class="post-footer">
          <span class="post-timestamp">{{ formatTimestamp(post.timestamp) }}</span>
          <div class="comment-prompt">💬 {{ post.comments?.length || 0 }} Bình luận (Nhấn để xem)</div>
        </div>
      </div>
      <p v-if="filteredPosts.length === 0" class="empty-state">Chưa có bài đăng nào.</p>
    </div>

    <!-- MODAL CHI TIẾT BÀI VIẾT -->
    <div v-if="selectedPost" class="modal-overlay" @click="closePostDetails">
      <div class="post-modal glass" @click.stop>
        <button class="close-modal-btn" @click="closePostDetails">×</button>
        
        <div class="modal-body">
          <!-- Chi tiết gốc -->
          <div class="modal-header">
            <span class="post-id-badge">#{{ selectedPost.id }}</span>
            <span class="post-author">{{ selectedPost.author }}</span>
            <span class="post-timestamp">{{ formatTimestamp(selectedPost.timestamp) }}</span>
          </div>
          <p class="modal-text">{{ selectedPost.text }}</p>
          
          <!-- Lưới ảnh đầy đủ -->
          <div v-if="selectedPost.images && selectedPost.images.length > 0" class="modal-image-grid" :class="'grid-' + selectedPost.images.length">
            <img v-for="(img, idx) in selectedPost.images" :key="idx" :src="img" class="full-img" />
          </div>

          <hr class="divider" />
          
          <!-- Danh sách bình luận -->
          <div class="comments-list">
            <div v-for="(cmt, idx) in selectedPost.comments" :key="idx" class="comment-item">
              <span class="comment-author">{{ cmt.author }}</span>
              <span class="comment-text">{{ cmt.text }}</span>
              <span class="comment-time">{{ formatTimestamp(cmt.createdAt) }}</span>
            </div>
            <p v-if="!selectedPost.comments || selectedPost.comments.length === 0" class="no-comments">Hãy là người đầu tiên bình luận.</p>
          </div>
        </div>


        <!-- Khung nhập bình luận -->
        <div class="comment-input-area">
          <label class="anon-toggle-comment">
            <input type="checkbox" v-model="isCommentAnonymous" /> Ẩn danh
          </label>
          <input 
            v-model="commentDraft" 
            type="text" 
            placeholder="Viết bình luận..." 
            @keyup.enter="submitComment" 
            :disabled="isSubmittingComment" 
          />
          <button class="send-comment-btn" @click="submitComment" :disabled="!commentDraft.trim() || isSubmittingComment">➤</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Layout chuẩn 100vh */
.void-view { flex: 1; display: flex; flex-direction: column; max-width: 700px; margin: 0 auto; padding: 0.75rem 1rem; overflow: hidden; height: 100%; }
.void-input-box { flex-shrink: 0; padding: 1rem; margin-bottom: 0.75rem; display: flex; flex-direction: column; gap: 0.6rem; border-radius: 12px; }
.void-input-box textarea { resize: none; padding: 0.7rem; width: 100%; background: transparent; border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 8px; }

/* Upload Ảnh */
.image-preview-container { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.preview-item { position: relative; width: 60px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); }
.preview-item img { width: 100%; height: 100%; object-fit: cover; }
.remove-img-btn { position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.6); color: white; border: none; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.footer-left { display: flex; align-items: center; gap: 1rem; }
.upload-btn { cursor: pointer; font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); background: var(--surface-strong); padding: 0.3rem 0.6rem; border-radius: 6px; }

/* Tags & Filters */
.tag-selector { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.tag-chip { padding: 0.3rem 0.7rem; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); background: var(--surface-strong); border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer; }
.tag-chip-active { background: var(--accent); color: #fff; border-color: var(--accent); }
.void-input-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; }
.anon-toggle { font-size: 0.85rem; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; gap: 0.3rem; }
.post-btn { padding: 0.5rem 1rem; background: var(--accent); color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
.post-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.filter-bar { flex-shrink: 0; display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.5rem; }
.filter-chip { padding: 0.35rem 0.8rem; font-size: 0.8rem; border-radius: 999px; background: var(--surface-strong); border: 1px solid var(--border-color); color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.filter-chip-active { background: var(--accent); color: white; }

/* Feed & Thẻ bài viết (Hiệu ứng Hover) */
.void-feed { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.75rem; padding-right: 0.2rem; }
.post-card { padding: 1rem; border-radius: 12px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; display: flex; flex-direction: column; gap: 0.5rem; }
.post-card:hover { transform: translateY(-3px); box-shadow: 0 6px 16px rgba(0,0,0,0.15); background: var(--surface-strong); }
.post-header { display: flex; align-items: center; gap: 0.6rem; }
.post-id-badge { background: var(--danger, #ef4444); color: #fff; font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 999px; }
.post-author { font-weight: 600; font-size: 0.9rem; color: var(--text-primary); }
.post-tag { margin-left: auto; font-size: 0.75rem; color: var(--accent); font-weight: 600; }
.post-text { margin: 0; color: var(--text-primary); line-height: 1.4; word-break: break-word; }

/* Thumbnail Thumbnail Ảnh */
.post-thumbnail-wrapper { position: relative; width: 100%; height: 120px; border-radius: 8px; overflow: hidden; margin-top: 0.5rem; }
.thumbnail-img { width: 100%; height: 100%; object-fit: cover; }
.more-images-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: bold; }

/* Footer thẻ */
.post-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem; }
.post-timestamp { font-size: 0.75rem; color: var(--text-muted); }
.comment-prompt { font-size: 0.8rem; color: var(--text-secondary); font-weight: 600; padding: 0.3rem 0.6rem; background: var(--bg-color); border-radius: 999px; }

/* MODAL CHI TIẾT (Theo mẫu tham khảo) */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
.post-modal { width: 100%; max-width: 600px; max-height: 85vh; border-radius: 12px; display: flex; flex-direction: column; position: relative; background: var(--bg-color); overflow: hidden; }
.close-modal-btn { position: absolute; top: 10px; right: 10px; background: rgba(128,128,128,0.2); border: none; font-size: 1.2rem; width: 30px; height: 30px; border-radius: 50%; color: var(--text-primary); cursor: pointer; z-index: 10; display: flex; align-items: center; justify-content: center; }
.modal-body { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.modal-header { display: flex; align-items: center; gap: 0.5rem; }
.modal-text { font-size: 1rem; line-height: 1.5; color: var(--text-primary); white-space: pre-wrap; margin: 0; }

/* Lưới ảnh trong Modal */
.modal-image-grid { display: grid; gap: 4px; border-radius: 8px; overflow: hidden; margin-top: 0.5rem; flex-shrink: 0; }
.grid-1 { grid-template-columns: 1fr; }
.grid-2 { grid-template-columns: 1fr 1fr; }
.grid-3 { grid-template-columns: 1fr 1fr; }
.grid-3 img:first-child { grid-column: span 2; }
.grid-4 { grid-template-columns: 1fr 1fr; }
.full-img { width: 100%; max-height: 300px; object-fit: cover; }

.divider { border: 0; border-top: 1px solid var(--border-color); margin: 0.5rem 0; }

/* Bình luận */
.comments-list { display: flex; flex-direction: column; gap: 0.8rem; }
.comment-item { background: var(--surface-strong); padding: 0.8rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.2rem; }
.comment-author { font-weight: 600; font-size: 0.85rem; color: var(--text-primary); }
.comment-text { font-size: 0.95rem; color: var(--text-primary); }
.comment-time { font-size: 0.7rem; color: var(--text-muted); align-self: flex-end; }
.no-comments { text-align: center; color: var(--text-muted); font-size: 0.9rem; }

/* Khung nhập bình luận ở đáy Modal */
.comment-input-area { padding: 1rem; background: var(--surface-strong); border-top: 1px solid var(--border-color); align-items: center; display: flex; gap: 0.5rem; flex-shrink: 0; }
.comment-input-area input { flex: 1; padding: 0.7rem 1rem; border-radius: 999px; border: 1px solid var(--border-color); background: var(--bg-color); color: var(--text-primary); outline: none; }
.send-comment-btn { background: var(--accent); color: white; border: none; width: 38px; height: 38px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.send-comment-btn:disabled { opacity: 0.5; cursor: not-allowed; }


/* Khung tự nhập Hashtag khi đăng bài */
.custom-hashtag-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 12px 0;
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
  font-size: 0.88rem;
  outline: none;
}

.quick-tags-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.quick-label {
  font-size: 0.78rem;
  color: #94a3b8;
  margin-right: 4px;
}

.quick-tag-chip {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.6);
  color: #cbd5e1;
  font-size: 0.78rem;
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
  margin: 16px 0;
}

.search-hashtag-box {
  display: flex;
  gap: 8px;
}

.search-hashtag-input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(15, 23, 42, 0.75);
  color: #f8fafc;
  font-size: 0.88rem;
  outline: none;
}

.search-hashtag-input:focus {
  border-color: #3b82f6;
}

.clear-search-btn {
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(51, 65, 85, 0.7);
  color: #e2e8f0;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.filter-tags-scroll {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-pill {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.75);
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-pill.active {
  background: #60a5fa;
  color: #0f172a;
  border-color: #60a5fa;
}

</style>