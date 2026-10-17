<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const HIDE_RULES_STORAGE_KEY = 'mindgarden_songless_hide_rules';

// 5 Mốc thời gian mở khóa (giây) và Số điểm tương ứng
const SNIPPET_STEPS = [
  { step: 1, duration: 0.5, points: 150, label: '0.5s' },
  { step: 2, duration: 1.5, points: 120, label: '1.5s' },
  { step: 3, duration: 3.5, points: 90,  label: '3.5s' },
  { step: 4, duration: 8.0, points: 60,  label: '8.0s' },
  { step: 5, duration: 15.0, points: 30, label: '15s' }
];

const CATEGORIES = [
  { key: 'all', label: 'Tất cả (Mix 300+ bài)', desc: 'Trộn ngẫu nhiên V-Pop, US-UK và K-Pop/Indie' },
  { key: 'vpop', label: 'V-Pop (Nhạc Việt)', desc: 'Sơn Tùng M-TP, Đen, Vũ., HIEUTHUHAI, tlinh, MCK, Soobin...' },
  { key: 'usuk', label: 'US-UK Hits', desc: 'Taylor Swift, The Weeknd, Bruno Mars, Twenty One Pilots, Glass Animals...' },
  { key: 'kpop_indie', label: 'K-Pop & Indie Chill', desc: 'BTS, BLACKPINK, NewJeans, IU, keshi, Joji, wave to earth...' }
];

const selectedCategory = ref('all');
const isLoading = ref(false);
const totalSongsInPool = ref(0);
const targetSong = ref(null);
const songCatalog = ref([]);

// Trạng thái ván đấu
const currentAttempt = ref(0); // 0 -> 4 (5 lượt)
const guesses = ref([]); // Lưu 5 lượt: { title, artist, status: 'empty' | 'wrong' | 'artist' | 'correct' | 'skipped' }
const gameStatus = ref('playing'); // 'playing' | 'won' | 'lost'
const earnedPoints = ref(0);
const toastMessage = ref('');

// Trạng thái Ô tìm kiếm Autocomplete
const searchQuery = ref('');
const selectedCandidate = ref(null);
const showDropdown = ref(false);

// Trạng thái phát nhạc (Audio Engine)
const audioRef = ref(null);
const isPlaying = ref(false);
const currentPlayTime = ref(0);
let playbackInterval = null;

// Modal
const showHelpModal = ref(false);
const dontShowRulesAgain = ref(false);
const showResultModal = ref(false);

// Thống kê cá nhân đồng bộ với Kho điểm chung (gameKey: 'game2')
const playerStats = ref({
  rank: null,
  gameScore: 0,
  overallScore: 0,
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0
});

// Thời lượng tối đa được phép nghe ở lượt hiện tại
const unlockedDuration = computed(() => {
  if (gameStatus.value !== 'playing') return 30;
  return SNIPPET_STEPS[currentAttempt.value]?.duration || 0.5;
});

const potentialPoints = computed(() => {
  return SNIPPET_STEPS[currentAttempt.value]?.points || 30;
});

// Lọc danh sách bài hát gợi ý khi người chơi gõ tìm kiếm
const filteredCatalog = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];
  return songCatalog.value
    .filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.artist.toLowerCase().includes(q)
    )
    .slice(0, 8);
});

const getAuthConfig = () => {
  const token = localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : null;
};

const showToast = (msg, duration = 2500) => {
  toastMessage.value = msg;
  setTimeout(() => {
    if (toastMessage.value === msg) toastMessage.value = '';
  }, duration);
};

// Đồng bộ điểm của Game 2 từ Kho điểm Server
const syncStatsFromProfile = (profile) => {
  if (!profile) return;
  const g2 = profile.games?.game2 || {};
  playerStats.value = {
    rank: profile.rank || null,
    gameScore: g2.score || 0,
    overallScore: profile.totalScore || 0,
    played: g2.played || 0,
    won: g2.won || 0,
    currentStreak: g2.currentStreak || 0,
    maxStreak: g2.maxStreak || 0
  };
};

const fetchMyStats = async () => {
  const config = getAuthConfig();
  if (!config) return;
  try {
    const { data } = await axios.get('http://localhost:5000/api/games/my-stats', config);
    if (data.success && data.profile) {
      syncStatsFromProfile(data.profile);
    }
  } catch (error) {
    console.error("Không thể tải thống kê cá nhân:", error);
  }
};

const saveScoreToServer = async (isWin, points) => {
  try {
    const config = getAuthConfig() || {};
    const savedUser = JSON.parse(localStorage.getItem('user') || '{}');

    const { data } = await axios.post(
      'http://localhost:5000/api/games/score',
      {
        gameKey: 'game2',
        won: isWin,
        points,
        userId: savedUser._id || savedUser.id,
        fullName: savedUser.fullName || savedUser.username,
        email: savedUser.email
      },
      config
    );
    if (data.success && data.profile) {
      syncStatsFromProfile(data.profile);
    }
  } catch (error) {
    console.error("Lỗi lưu điểm Songless:", error);
  }
};

// Quản lý phát nhạc theo đúng số giây mở khóa
const stopAudio = () => {
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
  if (audioRef.value) {
    audioRef.value.pause();
    audioRef.value.currentTime = 0;
  }
  isPlaying.value = false;
  currentPlayTime.value = 0;
};

const playCurrentSnippet = () => {
  if (!targetSong.value?.previewUrl) return;

  if (!audioRef.value) {
    audioRef.value = new Audio(targetSong.value.previewUrl);
  }

  // Nếu đang phát thì bấm lần nữa sẽ dừng
  if (isPlaying.value) {
    stopAudio();
    return;
  }

  const maxLimit = unlockedDuration.value;
  audioRef.value.currentTime = 0;
  currentPlayTime.value = 0;
  isPlaying.value = true;

  audioRef.value.play().catch((err) => {
    console.error("Lỗi phát âm thanh:", err);
    isPlaying.value = false;
    showToast("Không thể phát âm thanh, vui lòng thử lại.");
  });

  playbackInterval = setInterval(() => {
    if (!audioRef.value) return;
    currentPlayTime.value = audioRef.value.currentTime;

    if (audioRef.value.currentTime >= maxLimit || audioRef.value.ended) {
      stopAudio();
    }
  }, 40);
};

// Khởi tạo ván mới
const startNewRound = async (catKey = selectedCategory.value) => {
  stopAudio();
  selectedCategory.value = catKey;
  isLoading.value = true;
  gameStatus.value = 'playing';
  currentAttempt.value = 0;
  earnedPoints.value = 0;
  searchQuery.value = '';
  selectedCandidate.value = null;
  showDropdown.value = false;
  showResultModal.value = false;

  guesses.value = Array.from({ length: 5 }, () => ({
    title: '',
    artist: '',
    displayLabel: '',
    status: 'empty'
  }));

  try {
    const { data } = await axios.get(`http://localhost:5000/api/games/songless/new-round?category=${catKey}`);
    if (data.success && data.targetSong) {
      targetSong.value = data.targetSong;
      songCatalog.value = data.catalog || [];
      totalSongsInPool.value = data.totalSongsInPool || songCatalog.value.length;
      audioRef.value = new Audio(data.targetSong.previewUrl);
    }
  } catch (error) {
    console.error("Lỗi lấy bài hát mới:", error);
    showToast("Lỗi tải kho nhạc. Hãy kiểm tra kết nối mạng!");
  } finally {
    isLoading.value = false;
  }
};

// Chọn 1 bài hát từ danh sách gợi ý
const selectSongFromDropdown = (songItem) => {
  selectedCandidate.value = songItem;
  searchQuery.value = songItem.displayLabel;
  showDropdown.value = false;
};

const onSearchInput = () => {
  selectedCandidate.value = null;
  showDropdown.value = searchQuery.value.trim().length > 0;
};

// So sánh chuỗi đã chuẩn hóa
const normalizeStr = (str = '') => str.trim().toLowerCase();

// Nộp đáp án
const submitGuess = () => {
  if (gameStatus.value !== 'playing' || !targetSong.value) return;

  // Nếu người dùng gõ mà chưa click vào dòng gợi ý, tự động khớp bài đầu tiên trong danh sách lọc
  let candidate = selectedCandidate.value;
  if (!candidate && filteredCatalog.value.length > 0) {
    candidate = filteredCatalog.value[0];
  }

  if (!candidate) {
    showToast("Vui lòng gõ và chọn một bài hát trong danh sách gợi ý!");
    return;
  }

  stopAudio();

  const isSameSong =
    candidate.id === targetSong.value.id ||
    (normalizeStr(candidate.title) === normalizeStr(targetSong.value.title) &&
     normalizeStr(candidate.artist) === normalizeStr(targetSong.value.artist));

  const isSameArtist =
    normalizeStr(candidate.artist).includes(normalizeStr(targetSong.value.artist)) ||
    normalizeStr(targetSong.value.artist).includes(normalizeStr(candidate.artist));

  let status = 'wrong'; // Đỏ: Sai cả bài và nghệ sĩ
  if (isSameSong) {
    status = 'correct'; // Xanh lá: Chính xác
  } else if (isSameArtist) {
    status = 'artist'; // Vàng: Đúng nghệ sĩ, sai bài hát
  }

  guesses.value[currentAttempt.value] = {
    title: candidate.title,
    artist: candidate.artist,
    displayLabel: candidate.displayLabel,
    status
  };

  searchQuery.value = '';
  selectedCandidate.value = null;
  showDropdown.value = false;

  if (status === 'correct') {
    handleRoundEnd(true);
  } else if (currentAttempt.value + 1 >= 5) {
    handleRoundEnd(false);
  } else {
    currentAttempt.value++;
    if (status === 'artist') {
      showToast(`Đúng nghệ sĩ (${candidate.artist}) nhưng chưa đúng bài hát! Đã mở khóa ${unlockedDuration.value}s.`);
    } else {
      showToast(`Chưa chính xác! Đã mở khóa ${unlockedDuration.value} giây.`);
    }
  }
};

// Bỏ qua lượt hiện tại để nghe dài hơn (Skip / Next)
const skipCurrentStep = () => {
  if (gameStatus.value !== 'playing') return;
  stopAudio();

  guesses.value[currentAttempt.value] = {
    title: 'Đã bỏ qua lượt',
    artist: '',
    displayLabel: `Đã bỏ qua mốc ${SNIPPET_STEPS[currentAttempt.value].label}`,
    status: 'skipped'
  };

  if (currentAttempt.value + 1 >= 5) {
    handleRoundEnd(false);
  } else {
    currentAttempt.value++;
    showToast(`Đã mở khóa đoạn nhạc ${unlockedDuration.value} giây`);
  }
};

// Kết thúc ván đấu
const handleRoundEnd = async (isWin) => {
  gameStatus.value = isWin ? 'won' : 'lost';

  if (isWin) {
    earnedPoints.value = SNIPPET_STEPS[currentAttempt.value]?.points || 30;
    showToast(`Chính xác! Bạn nhận được +${earnedPoints.value} điểm`);
  } else {
    earnedPoints.value = 5;
    showToast(`Hết lượt! Đáp án là "${targetSong.value.title}". Cộng +5 điểm khích lệ`);
  }

  await saveScoreToServer(isWin, earnedPoints.value);

  setTimeout(() => {
    showResultModal.value = true;
    // Tự động phát nhạc nền bài hát khi mở bảng kết quả
    playCurrentSnippet();
  }, 650);
};

// Đóng / Mở bảng Luật chơi
const closeHelpModal = () => {
  if (dontShowRulesAgain.value) {
    localStorage.setItem(HIDE_RULES_STORAGE_KEY, 'true');
  } else {
    localStorage.removeItem(HIDE_RULES_STORAGE_KEY);
  }
  showHelpModal.value = false;
};

const openHelpModalManually = () => {
  dontShowRulesAgain.value = localStorage.getItem(HIDE_RULES_STORAGE_KEY) === 'true';
  showHelpModal.value = true;
};

onMounted(() => {
  const hideRules = localStorage.getItem(HIDE_RULES_STORAGE_KEY) === 'true';
  if (!hideRules) {
    showHelpModal.value = true;
  }
  fetchMyStats();
  startNewRound('all');
});

onUnmounted(() => {
  stopAudio();
});
</script>

<template>
  <div class="songless-scroll-wrapper">
    <div class="songless-layout">
      <!-- CỘT TRÁI: THỐNG KÊ, CHỦ ĐỀ NHẠC & THANG ĐIỂM -->
      <aside class="left-panel glass">
        <div class="title-group">
          <h1>MindGarden Songless</h1>
          <p class="subtitle">Nghe đoạn nhạc ngắn và đoán tên bài hát trong 5 lượt</p>
        </div>

        <!-- Thanh thống kê cá nhân -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">Hạng chung</span>
            <strong class="stat-value">{{ playerStats.rank ? `#${playerStats.rank}` : '--' }}</strong>
          </div>
          <div class="stat-item">
            <span class="stat-label">Điểm Game 2</span>
            <strong class="stat-value">{{ playerStats.gameScore }}</strong>
          </div>
          <div class="stat-item">
            <span class="stat-label">Chuỗi thắng</span>
            <strong class="stat-value">{{ playerStats.currentStreak }}</strong>
          </div>
          <div class="stat-item">
            <span class="stat-label">Kỷ lục</span>
            <strong class="stat-value">{{ playerStats.maxStreak }}</strong>
          </div>
        </div>

        <div class="action-group">
          <button class="text-btn" @click="router.push('/leaderboard')">Bảng xếp hạng</button>
          <button class="text-btn" @click="openHelpModalManually">Luật chơi</button>
          <button class="text-btn primary" @click="startNewRound(selectedCategory)" :disabled="isLoading">
            Đổi bài mới
          </button>
        </div>

        <!-- Chọn chủ đề âm nhạc -->
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">Chọn chủ đề âm nhạc</span>
            <span class="section-note">Đã nạp tự động {{ totalSongsInPool }} bài hát vào kho</span>
          </div>

          <div class="category-list">
            <button
              v-for="cat in CATEGORIES"
              :key="cat.key"
              class="cat-card"
              :class="{ active: selectedCategory === cat.key }"
              @click="startNewRound(cat.key)"
            >
              <div class="cat-top">
                <span class="cat-name">{{ cat.label }}</span>
              </div>
              <p class="cat-desc">{{ cat.desc }}</p>
            </button>
          </div>
        </div>

        <!-- Bảng quy đổi thời gian & điểm thưởng -->
        <div class="section-block">
          <span class="section-title">Mốc thời gian & Điểm thưởng</span>
          <div class="steps-grid">
            <div
              v-for="(st, idx) in SNIPPET_STEPS"
              :key="st.step"
              class="step-pill"
              :class="{ 'current-step': currentAttempt === idx && gameStatus === 'playing' }"
            >
              <span class="step-time">Lượt {{ st.step }} ({{ st.label }})</span>
              <strong class="step-pts">+{{ st.points }} điểm</strong>
            </div>
          </div>
        </div>
      </aside>

      <!-- CỘT PHẢI: TRÌNH PHÁT NHẠC, Ô TÌM KIẾM & 5 LƯỢT ĐOÁN -->
      <main class="right-panel glass">
        <transition name="fade">
          <div v-if="toastMessage" class="toast-alert">{{ toastMessage }}</div>
        </transition>

        <div v-if="isLoading" class="loading-box">
          <p>Đang tải dữ liệu bài hát từ kho nhạc...</p>
        </div>

        <template v-else>
          <!-- 1. Thanh tiến trình 5 phân đoạn (Segmented Bar) -->
          <div class="player-section">
            <div class="player-status-header">
              <span>
                Lượt hiện tại: <strong>{{ Math.min(currentAttempt + 1, 5) }} / 5</strong>
              </span>
              <span>
                Thời lượng mở khóa: <strong>{{ unlockedDuration }} giây</strong>
                (Thắng lượt này: <strong>+{{ potentialPoints }} điểm</strong>)
              </span>
            </div>

            <div class="segmented-bar">
              <div
                v-for="(stepObj, idx) in SNIPPET_STEPS"
                :key="stepObj.step"
                class="segment-item"
                :class="[
                  guesses[idx]?.status || 'empty',
                  {
                    'unlocked': idx <= currentAttempt,
                    'active-segment': idx === currentAttempt && gameStatus === 'playing'
                  }
                ]"
              >
                <span class="segment-label">{{ stepObj.label }}</span>
              </div>
            </div>

            <!-- Thanh chạy thời gian thực khi đang phát -->
            <div class="realtime-progress-track">
              <div
                class="realtime-progress-fill"
                :style="{ width: `${Math.min((currentPlayTime / unlockedDuration) * 100, 100)}%` }"
              ></div>
            </div>

            <!-- Cụm nút Play & Skip -->
            <div class="audio-controls">
              <button class="play-btn" @click="playCurrentSnippet">
                {{ isPlaying ? 'Dừng phát' : `Phát đoạn nhạc (${unlockedDuration}s)` }}
              </button>

              <button
                v-if="gameStatus === 'playing'"
                class="skip-btn"
                @click="skipCurrentStep"
              >
                {{ currentAttempt < 4 ? `Bỏ qua (+Mở mốc ${SNIPPET_STEPS[currentAttempt + 1].label})` : 'Bỏ qua (Xem đáp án)' }}
              </button>
            </div>
          </div>

          <!-- 2. Ô Nhập liệu tìm kiếm bài hát (Autocomplete) -->
          <div class="search-section" v-if="gameStatus === 'playing'">
            <div class="autocomplete-wrapper">
              <input
                type="text"
                v-model="searchQuery"
                class="song-input"
                placeholder="Nhập tên bài hát hoặc tên nghệ sĩ để tìm kiếm..."
                @input="onSearchInput"
                @focus="showDropdown = searchQuery.trim().length > 0"
                @keydown.enter.prevent="submitGuess"
              />

              <!-- Danh sách gợi ý xổ xuống -->
              <ul v-if="showDropdown && filteredCatalog.length > 0" class="suggestions-list">
                <li
                  v-for="item in filteredCatalog"
                  :key="item.id"
                  class="suggestion-item"
                  @click="selectSongFromDropdown(item)"
                >
                  <span class="sug-title">{{ item.title }}</span>
                  <span class="sug-artist">{{ item.artist }}</span>
                </li>
              </ul>
            </div>

            <button class="submit-guess-btn" @click="submitGuess">
              Gửi đáp án
            </button>
          </div>

          <!-- 3. Bảng 5 Lượt Đoán & Phản hồi 3 màu -->
          <div class="guesses-list">
            <div
              v-for="(g, idx) in guesses"
              :key="idx"
              class="guess-slot"
              :class="[
                g.status,
                { 'current-slot': idx === currentAttempt && gameStatus === 'playing' }
              ]"
            >
              <span class="slot-number">#{{ idx + 1 }}</span>
              <span class="slot-text">
                {{ g.displayLabel || (idx === currentAttempt && gameStatus === 'playing' ? 'Đang chờ câu trả lời của bạn...' : 'Chưa sử dụng') }}
              </span>
              <span class="slot-badge" v-if="g.status !== 'empty'">
                {{
                  g.status === 'correct' ? 'Chính xác' :
                  g.status === 'artist' ? 'Đúng nghệ sĩ' :
                  g.status === 'wrong' ? 'Sai bài & nghệ sĩ' : 'Đã bỏ qua'
                }}
              </span>
            </div>
          </div>

          <!-- Chú thích màu sắc -->
          <div class="color-legend">
            <div class="legend-item">
              <span class="legend-dot wrong"></span>
              <span>Sai nghệ sĩ & bài hát</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot artist"></span>
              <span>Đúng nghệ sĩ, sai bài hát</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot correct"></span>
              <span>Chính xác</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot skipped"></span>
              <span>Bỏ qua lượt</span>
            </div>
          </div>
        </template>
      </main>
    </div>

    <!-- MODAL 1: LUẬT CHƠI (TỰ ĐỘNG HIỆN + CÓ TÙY CHỌN KHÔNG NHẮC LẠI) -->
    <div v-if="showHelpModal" class="modal-overlay" @click.self="closeHelpModal">
      <div class="modal-card glass">
        <h2>Luật Chơi MindGarden Songless</h2>
        <p class="modal-intro">
          Lắng nghe đoạn trích âm thanh và đoán chính xác tên bài hát trong tối đa <strong>5 lượt thử</strong>.
        </p>

        <ol class="rule-steps">
          <li>
            <strong>Lắng nghe (Listen):</strong> Nhấn nút Phát nhạc. Bạn bắt đầu với <strong>0.5 giây</strong> và có thể bấm nghe lại bao nhiêu lần tùy thích.
          </li>
          <li>
            <strong>Đoán tên bài hát (Make a guess):</strong> Gõ tên bài hát hoặc tên ca sĩ vào ô tìm kiếm, chọn kết quả phù hợp từ danh sách gợi ý và nhấn <strong>Gửi đáp án</strong>.
          </li>
          <li>
            <strong>Mở khóa thêm thời gian (Need more?):</strong> Mỗi khi bạn nhấn <strong>Bỏ qua</strong> hoặc đoán sai, đoạn nhạc sẽ dài thêm theo các mốc: <strong>0.5s ➔ 1.5s ➔ 3.5s ➔ 8s ➔ 15s</strong>.
          </li>
        </ol>

        <div class="color-rules-box">
          <div class="color-rule-row">
            <span class="rule-swatch wrong"></span>
            <span><strong>Màu Đỏ:</strong> Sai cả tên bài hát và tên nghệ sĩ.</span>
          </div>
          <div class="color-rule-row">
            <span class="rule-swatch artist"></span>
            <span><strong>Màu Vàng:</strong> Đúng tên nghệ sĩ thể hiện, nhưng sai tên bài hát.</span>
          </div>
          <div class="color-rule-row">
            <span class="rule-swatch correct"></span>
            <span><strong>Màu Xanh lá:</strong> Đoán chính xác bài hát!</span>
          </div>
        </div>

        <div class="modal-footer">
          <label class="checkbox-label">
            <input type="checkbox" v-model="dontShowRulesAgain" />
            <span>Không tự động hiển thị lại vào lần sau</span>
          </label>
          <button class="primary-btn" @click="closeHelpModal">Bắt đầu chơi</button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: KẾT QUẢ VÁN ĐẤU -->
    <div v-if="showResultModal && targetSong" class="modal-overlay" @click.self="stopAudio(); showResultModal = false">
      <div class="modal-card glass text-center">
        <h2>{{ gameStatus === 'won' ? 'Tuyệt vời! Bạn đã đoán đúng' : 'Hết lượt đoán' }}</h2>
        <p v-if="gameStatus === 'won'">
          Bạn nhận diện được bài hát ở mốc <strong>{{ SNIPPET_STEPS[currentAttempt]?.label }}</strong> (Lượt {{ currentAttempt + 1 }}/5).
        </p>
        <p v-else>Đừng nản lòng, hãy thưởng thức giai điệu của bài hát này nhé.</p>

        <div class="song-reveal-card">
          <img v-if="targetSong.artwork" :src="targetSong.artwork" alt="Album Cover" class="album-cover" />
          <div class="song-details">
            <div class="reveal-title">{{ targetSong.title }}</div>
            <div class="reveal-artist">{{ targetSong.artist }}</div>
            <div v-if="targetSong.album" class="reveal-album">Album: {{ targetSong.album }}</div>
          </div>
        </div>

        <div class="points-summary">
          Điểm cộng vào Kho điểm (Game 2): <strong>+{{ earnedPoints }} điểm</strong>
        </div>

        <div class="modal-actions">
          <button class="primary-btn" @click="startNewRound(selectedCategory)">Chơi bài tiếp theo</button>
          <button class="secondary-btn" @click="stopAudio(); router.push('/leaderboard')">
            Xem Bảng xếp hạng
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.songless-scroll-wrapper {
  width: 100%;
  height: calc(100vh - 64px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px 36px;
  box-sizing: border-box;
  color: #f1f5f9;
}

.songless-layout {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 920px) {
  .songless-layout {
    grid-template-columns: 1fr;
  }
}

.glass {
  background: rgba(30, 41, 59, 0.78);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}

/* Cột trái */
.left-panel {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.title-group h1 {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 700;
  color: #f8fafc;
}

.subtitle {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: rgba(15, 23, 42, 0.65);
  padding: 10px 12px;
  border-radius: 10px;
  gap: 8px;
  text-align: center;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 0.7rem;
  color: #94a3b8;
  text-transform: uppercase;
}

.stat-value {
  font-size: 1.05rem;
  color: #60a5fa;
}

.action-group {
  display: flex;
  gap: 8px;
}

.text-btn {
  flex: 1;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(51, 65, 85, 0.5);
  color: #e2e8f0;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.text-btn:hover {
  background: rgba(71, 85, 105, 0.8);
}

.text-btn.primary {
  background: #2563eb;
  border-color: #3b82f6;
  color: #ffffff;
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #cbd5e1;
}

.section-note {
  font-size: 0.78rem;
  color: #34d399;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cat-card {
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.55);
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.18s ease;
}

.cat-card.active {
  background: rgba(37, 99, 235, 0.22);
  border-color: #3b82f6;
  color: #ffffff;
}

.cat-name {
  font-weight: 700;
  font-size: 0.9rem;
}

.cat-desc {
  margin: 4px 0 0;
  font-size: 0.76rem;
  color: #94a3b8;
}

.steps-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.step-pill {
  display: flex;
  justify-content: space-between;
  padding: 7px 12px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.55);
  font-size: 0.82rem;
  color: #94a3b8;
  border: 1px solid transparent;
}

.step-pill.current-step {
  border-color: #3b82f6;
  color: #f8fafc;
  background: rgba(37, 99, 235, 0.18);
}

.step-pts {
  color: #60a5fa;
}

/* Cột phải */
.right-panel {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
}

.toast-alert {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 700;
  font-size: 0.86rem;
  padding: 8px 16px;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.player-section {
  background: rgba(15, 23, 42, 0.65);
  padding: 18px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.player-status-header {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.86rem;
  color: #cbd5e1;
}

/* Thanh 5 phân đoạn kiểu Songless */
.segmented-bar {
  display: grid;
  grid-template-columns: 1fr 1.4fr 2fr 3fr 4.5fr;
  gap: 6px;
}

.segment-item {
  height: 34px;
  border-radius: 6px;
  background: #1e293b;
  border: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.76rem;
  font-weight: 700;
  color: #64748b;
  transition: all 0.2s;
}

.segment-item.unlocked {
  color: #e2e8f0;
  border-color: #475569;
}

.segment-item.active-segment {
  border-color: #60a5fa;
  background: rgba(59, 130, 246, 0.25);
  color: #ffffff;
}

.realtime-progress-track {
  width: 100%;
  height: 6px;
  background: #1e293b;
  border-radius: 999px;
  overflow: hidden;
}

.realtime-progress-fill {
  height: 100%;
  background: #22c55e;
  transition: width 0.05s linear;
}

.audio-controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.play-btn {
  flex: 1.5;
  padding: 12px 18px;
  border-radius: 10px;
  border: none;
  background: #22c55e;
  color: #052e16;
  font-weight: 800;
  font-size: 0.92rem;
  cursor: pointer;
  transition: filter 0.15s;
}

.play-btn:hover {
  filter: brightness(1.08);
}

.skip-btn {
  flex: 1;
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(51, 65, 85, 0.65);
  color: #f1f5f9;
  font-weight: 600;
  font-size: 0.86rem;
  cursor: pointer;
}

.skip-btn:hover {
  background: rgba(71, 85, 105, 0.9);
}

/* Ô tìm kiếm Autocomplete */
.search-section {
  display: flex;
  gap: 10px;
}

.autocomplete-wrapper {
  position: relative;
  flex: 1;
}

.song-input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #475569;
  background: rgba(15, 23, 42, 0.85);
  color: #f8fafc;
  font-size: 0.9rem;
  outline: none;
}

.song-input:focus {
  border-color: #3b82f6;
}

.suggestions-list {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 10px;
  margin: 0;
  padding: 6px;
  list-style: none;
  z-index: 50;
  max-height: 240px;
  overflow-y: auto;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
}

.suggestion-item {
  padding: 9px 12px;
  border-radius: 7px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.suggestion-item:hover {
  background: rgba(37, 99, 235, 0.25);
}

.sug-title {
  font-weight: 600;
  color: #f8fafc;
  font-size: 0.88rem;
}

.sug-artist {
  font-size: 0.8rem;
  color: #94a3b8;
}

.submit-guess-btn {
  padding: 0 22px;
  border-radius: 10px;
  border: none;
  background: #2563eb;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.submit-guess-btn:hover {
  background: #1d4ed8;
}

/* 5 Ô lịch sử đoán & Hệ màu Đỏ / Vàng / Xanh / Xám */
.guesses-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.guess-slot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.55);
  border: 1px solid #334155;
  font-size: 0.88rem;
}

.guess-slot.current-slot {
  border-color: #60a5fa;
}

.slot-number {
  font-weight: 700;
  color: #64748b;
  min-width: 24px;
}

.slot-text {
  flex: 1;
  color: #cbd5e1;
  font-weight: 500;
}

.slot-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
}

/* 4 Màu phản hồi chuẩn Songless */
.segment-item.wrong, .guess-slot.wrong, .legend-dot.wrong, .rule-swatch.wrong {
  background-color: rgba(220, 38, 38, 0.22) !important;
  border-color: #ef4444 !important;
  color: #fca5a5;
}

.segment-item.artist, .guess-slot.artist, .legend-dot.artist, .rule-swatch.artist {
  background-color: rgba(202, 138, 4, 0.24) !important;
  border-color: #eab308 !important;
  color: #fde047;
}

.segment-item.correct, .guess-slot.correct, .legend-dot.correct, .rule-swatch.correct {
  background-color: rgba(22, 163, 74, 0.25) !important;
  border-color: #22c55e !important;
  color: #86efac;
}

.segment-item.skipped, .guess-slot.skipped, .legend-dot.skipped {
  background-color: rgba(71, 85, 105, 0.35) !important;
  border-color: #64748b !important;
  color: #94a3b8;
}

.color-legend {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 0.78rem;
  color: #94a3b8;
  padding-top: 4px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid transparent;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-card {
  max-width: 520px;
  width: 100%;
  padding: 24px;
  color: #f8fafc;
}

.modal-card h2 {
  margin: 0 0 8px;
  font-size: 1.3rem;
}

.modal-intro {
  margin: 0 0 12px;
  font-size: 0.9rem;
  color: #cbd5e1;
}

.rule-steps {
  margin: 0 0 16px;
  padding-left: 18px;
  font-size: 0.86rem;
  color: #cbd5e1;
  line-height: 1.55;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.color-rules-box {
  background: rgba(15, 23, 42, 0.65);
  padding: 12px 14px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
  font-size: 0.84rem;
}

.color-rule-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rule-swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid transparent;
  flex-shrink: 0;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
  color: #cbd5e1;
  cursor: pointer;
}

.song-reveal-card {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(15, 23, 42, 0.8);
  padding: 14px;
  border-radius: 12px;
  margin: 16px 0;
  text-align: left;
}

.album-cover {
  width: 84px;
  height: 84px;
  border-radius: 8px;
  object-fit: cover;
}

.reveal-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #4ade80;
}

.reveal-artist {
  font-size: 0.95rem;
  color: #e2e8f0;
  margin-top: 2px;
}

.reveal-album {
  font-size: 0.78rem;
  color: #94a3b8;
  margin-top: 4px;
}

.points-summary {
  font-size: 0.92rem;
  color: #cbd5e1;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 18px;
}

.primary-btn {
  background: #2563eb;
  color: white;
  border: none;
  padding: 9px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}

.secondary-btn {
  background: #334155;
  color: #e2e8f0;
  border: none;
  padding: 9px 18px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
}

.text-center {
  text-align: center;
}

.loading-box {
  padding: 60px 20px;
  text-align: center;
  color: #94a3b8;
}
</style>