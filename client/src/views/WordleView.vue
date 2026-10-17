<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const HIDE_RULES_STORAGE_KEY = 'mindgarden_wordle_hide_rules';
const router = useRouter();

// Cấu hình 3 mức độ khó rõ ràng cho người mới
const DIFFICULTIES = {
  easy: {
    key: 'easy',
    label: 'Dễ (Chill)',
    maxAttempts: 10,
    multiplier: 1.0,
    summary: '10 lượt • x1.0 Điểm thưởng',
    desc: 'Từ vựng cơ bản không lặp chữ cái. Mở sẵn gợi ý từ AI và có 1 quyền mở ô chữ miễn phí.'
  },
  medium: {
    key: 'medium',
    label: 'Trung bình',
    maxAttempts: 7,
    multiplier: 1.5,
    summary: '7 lượt • x1.5 Điểm thưởng',
    desc: 'Từ thông dụng (có thể lặp chữ cái). Gợi ý từ AI sẽ tự động mở khóa ở lượt đoán thứ 5.'
  },
  hard: {
    key: 'hard',
    label: 'Khó (Master)',
    maxAttempts: 5,
    multiplier: 2.5,
    summary: '5 lượt • x2.5 Điểm thưởng',
    desc: 'Từ nâng cao, không có gợi ý. Bắt buộc phải sử dụng lại các chữ cái đã mở màu ở lượt tiếp theo.'
  }
};

// Trạng thái Game
const difficulty = ref('easy');
const isLoading = ref(false);
const targetWord = ref('');
const wordInfo = ref({ hint: '', meaning: '', topic: '', source: '' });

const board = ref([]);
const currentRow = ref(0);
const currentCol = ref(0);
const gameStatus = ref('playing'); // 'playing' | 'won' | 'lost'
const keyboardState = ref({});
const toastMessage = ref('');
const shakeRowIndex = ref(-1);

// Trạng thái trợ giúp & Modal
const freeLetterRevealed = ref(false);
const revealedPositionInfo = ref('');
const showHelpModal = ref(false);
const dontShowRulesAgain = ref(false);
const showResultModal = ref(false);
const earnedPoints = ref(0);

// Thống kê điểm đồng bộ với Kho điểm trên Server
const sessionStats = ref({ played: 0, won: 0, streak: 0, totalScore: 0 });
const playerStats = ref({
  userId: null,
  totalScore: 0,
  overallScore: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  currentStreak: 0,
  maxStreak: 0,
  rank: null
});

const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'XÓA']
];

const currentConfig = computed(() => DIFFICULTIES[difficulty.value]);

// Kích thước ô vuông tự động co giãn theo số lượt để không đẩy mất bàn phím
const tileSizePx = computed(() => {
  if (difficulty.value === 'easy') return '40px'; // 10 hàng
  if (difficulty.value === 'medium') return '46px'; // 7 hàng
  return '52px'; // 5 hàng
});

// Kiểm tra xem Gợi ý AI có được mở khóa hay chưa
const isHintUnlocked = computed(() => {
  if (difficulty.value === 'easy') return true;
  if (difficulty.value === 'medium') return currentRow.value >= 4 || gameStatus.value !== 'playing';
  return false;
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

// Đồng bộ dữ liệu từ Kho điểm Server vào cả playerStats và sessionStats
const syncStatsFromProfile = (profile) => {
  if (!profile) return;
  const w = profile.games?.wordle || {};

  playerStats.value = {
    userId: profile.userId,
    totalScore: w.score || 0,
    overallScore: profile.totalScore || 0,
    gamesPlayed: w.played || 0,
    gamesWon: w.won || 0,
    currentStreak: w.currentStreak || 0,
    maxStreak: w.maxStreak || 0,
    rank: profile.rank || null
  };

  sessionStats.value = {
    played: w.played || 0,
    won: w.won || 0,
    streak: w.currentStreak || 0,
    totalScore: w.score || 0
  };
};

// Lấy thống kê Wordle và Tổng điểm từ Kho điểm chung
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

// Lưu điểm vào kho điểm của game 'wordle'
const saveScoreToServer = async (isWin, points) => {
  const config = getAuthConfig();
  if (!config) return;

  try {
    const { data } = await axios.post(
      'http://localhost:5000/api/games/score',
      { gameKey: 'wordle', won: isWin, points },
      config
    );
    if (data.success && data.profile) {
      syncStatsFromProfile(data.profile);
    }
  } catch (error) {
    console.error("Lỗi lưu điểm lên server:", error);
  }
};

// Điều hướng sang trang Bảng xếp hạng riêng biệt
const openLeaderboardModal = () => {
  router.push('/leaderboard');
};

// Đóng bảng Luật chơi và lưu tùy chọn "Không nhắc lại"
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

const initBoard = (rows) => {
  board.value = Array.from({ length: rows }, () =>
    Array.from({ length: 5 }, () => ({ letter: '', status: 'empty' }))
  );
  currentRow.value = 0;
  currentCol.value = 0;
  gameStatus.value = 'playing';
  keyboardState.value = {};
  freeLetterRevealed.value = false;
  revealedPositionInfo.value = '';
  showResultModal.value = false;
  earnedPoints.value = 0;
};

const startNewGame = async (newDiff = difficulty.value) => {
  difficulty.value = newDiff;
  const maxRows = DIFFICULTIES[newDiff].maxAttempts;
  initBoard(maxRows);
  isLoading.value = true;

  try {
    const { data } = await axios.get(`http://localhost:5000/api/games/wordle/new-word?difficulty=${newDiff}`);
    if (data.success) {
      targetWord.value = data.word.toUpperCase();
      wordInfo.value = {
        hint: data.hint,
        meaning: data.meaning,
        topic: data.topic,
        source: data.source
      };
    }
  } catch (error) {
    console.error("Lỗi lấy từ mới:", error);
    targetWord.value = "PEACE";
    wordInfo.value = {
      hint: "Trạng thái tâm hồn bình yên, thư thái.",
      meaning: "Danh từ - Sự bình yên",
      topic: "Chữa lành",
      source: "offline"
    };
  } finally {
    isLoading.value = false;
  }
};

const useFreeLetterHint = () => {
  if (difficulty.value !== 'easy' || freeLetterRevealed.value || gameStatus.value !== 'playing') return;

  const unrevealedIndices = [];
  for (let i = 0; i < 5; i++) {
    let alreadyCorrect = false;
    for (let r = 0; r < currentRow.value; r++) {
      if (board.value[r][i].status === 'correct') alreadyCorrect = true;
    }
    if (!alreadyCorrect) unrevealedIndices.push(i);
  }

  const targetIdx = unrevealedIndices.length > 0
    ? unrevealedIndices[Math.floor(Math.random() * unrevealedIndices.length)]
    : 0;

  freeLetterRevealed.value = true;
  revealedPositionInfo.value = `Ô số ${targetIdx + 1} là chữ "${targetWord.value[targetIdx]}"`;
  showToast(`Đã mở gợi ý: Ô số ${targetIdx + 1} là chữ ${targetWord.value[targetIdx]}`);
};

const validateHardModeConstraints = (guessWord) => {
  if (difficulty.value !== 'hard' || currentRow.value === 0) return null;

  const prevRow = board.value[currentRow.value - 1];

  for (let i = 0; i < 5; i++) {
    if (prevRow[i].status === 'correct' && guessWord[i] !== prevRow[i].letter) {
      return `Chế độ Khó: Ô thứ ${i + 1} bắt buộc phải là chữ "${prevRow[i].letter}"`;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (prevRow[i].status === 'present' && !guessWord.includes(prevRow[i].letter)) {
      return `Chế độ Khó: Lượt đoán phải chứa chữ "${prevRow[i].letter}" đã tìm thấy`;
    }
  }

  return null;
};

const evaluateCurrentGuess = () => {
  const rowTiles = board.value[currentRow.value];
  const guessLetters = rowTiles.map(t => t.letter);
  const guessWord = guessLetters.join('');

  const hardError = validateHardModeConstraints(guessWord);
  if (hardError) {
    triggerShake();
    showToast(hardError, 3000);
    return;
  }

  const targetLetters = targetWord.value.split('');
  const usedTargetIndices = Array(5).fill(false);
  const statuses = Array(5).fill('absent');

  // Vòng 1: Đúng chữ, đúng vị trí (Xanh lá)
  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === targetLetters[i]) {
      statuses[i] = 'correct';
      usedTargetIndices[i] = true;
    }
  }

  // Vòng 2: Đúng chữ, sai vị trí (Vàng)
  for (let i = 0; i < 5; i++) {
    if (statuses[i] === 'correct') continue;

    const foundIndex = targetLetters.findIndex(
      (ch, idx) => ch === guessLetters[i] && !usedTargetIndices[idx]
    );
    if (foundIndex !== -1) {
      statuses[i] = 'present';
      usedTargetIndices[foundIndex] = true;
    }
  }

  const priority = { empty: 0, absent: 1, present: 2, correct: 3 };
  for (let i = 0; i < 5; i++) {
    rowTiles[i].status = statuses[i];
    const ch = guessLetters[i];
    const currentKeyStatus = keyboardState.value[ch] || 'empty';
    if (priority[statuses[i]] > priority[currentKeyStatus]) {
      keyboardState.value[ch] = statuses[i];
    }
  }

  if (guessWord === targetWord.value) {
    handleGameEnd(true);
  } else if (currentRow.value + 1 >= currentConfig.value.maxAttempts) {
    handleGameEnd(false);
  } else {
    currentRow.value++;
    currentCol.value = 0;
  }
};

const handleGameEnd = async (isWin) => {
  gameStatus.value = isWin ? 'won' : 'lost';
  sessionStats.value.played++;

  if (isWin) {
    sessionStats.value.won++;
    sessionStats.value.streak++;
    const remainingTries = currentConfig.value.maxAttempts - (currentRow.value + 1);
    const basePoints = 50 + remainingTries * 15;
    earnedPoints.value = Math.round(basePoints * currentConfig.value.multiplier);
    sessionStats.value.totalScore += earnedPoints.value;
    showToast(`Chính xác! Bạn nhận được +${earnedPoints.value} điểm`);
  } else {
    sessionStats.value.streak = 0;
    earnedPoints.value = 5;
    sessionStats.value.totalScore += 5;
    showToast(`Đáp án là "${targetWord.value}". Cộng +5 điểm khích lệ`);
  }

  // Lưu điểm vào kho điểm chung trên MongoDB
  await saveScoreToServer(isWin, earnedPoints.value);

  setTimeout(() => {
    showResultModal.value = true;
  }, 800);
};

const triggerShake = () => {
  shakeRowIndex.value = currentRow.value;
  setTimeout(() => {
    shakeRowIndex.value = -1;
  }, 500);
};

const handleKeyInput = (key) => {
  if (gameStatus.value !== 'playing' || isLoading.value || showHelpModal.value) return;

  if (key === 'XÓA' || key === 'BACKSPACE') {
    if (currentCol.value > 0) {
      currentCol.value--;
      board.value[currentRow.value][currentCol.value].letter = '';
    }
    return;
  }

  if (key === 'ENTER') {
    if (currentCol.value < 5) {
      triggerShake();
      showToast('Vui lòng nhập đủ 5 chữ cái');
      return;
    }
    evaluateCurrentGuess();
    return;
  }

  if (/^[A-Z]$/.test(key) && currentCol.value < 5) {
    board.value[currentRow.value][currentCol.value].letter = key;
    currentCol.value++;
  }
};

const onPhysicalKeydown = (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toUpperCase();
  if (key === 'ENTER' || key === 'BACKSPACE' || /^[A-Z]$/.test(key)) {
    e.preventDefault();
    handleKeyInput(key);
  }
};

onMounted(() => {
  window.addEventListener('keydown', onPhysicalKeydown);
  // Kiểm tra hiển thị bảng luật chơi khi mới vào
  const hideRules = localStorage.getItem(HIDE_RULES_STORAGE_KEY) === 'true';
  if (!hideRules) {
    showHelpModal.value = true;
  }
  fetchMyStats();
  startNewGame('easy');
});

onUnmounted(() => {
  window.removeEventListener('keydown', onPhysicalKeydown);
});
</script>

<template>
  <div class="wordle-scroll-wrapper">
    <div class="wordle-layout">
      <!-- CỘT TRÁI: THÔNG TIN, CHỌN ĐỘ KHÓ & GỢI Ý -->
      <aside class="left-panel glass">
        <div class="title-group">
          <h1>MindGarden Wordle</h1>
          <p class="subtitle">Giải đố từ vựng tiếng Anh 5 chữ cái</p>
        </div>

        <!-- Thống kê điểm và nút chức năng -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">Tổng điểm</span>
            <strong class="stat-value">{{ sessionStats.totalScore }}</strong>
          </div>
          <div class="stat-item">
            <span class="stat-label">Chuỗi thắng</span>
            <strong class="stat-value">{{ sessionStats.streak }}</strong>
          </div>
          <div class="action-group">
            <button class="text-btn" @click="openHelpModalManually">Luật chơi</button>
            <button class="text-btn primary" @click="startNewGame(difficulty)" :disabled="isLoading">
              Đổi từ mới
            </button>
          </div>
        </div>

        <!-- Chọn độ khó kèm giải thích rõ hệ số nhân -->
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">Chọn độ khó</span>
            <span class="section-note">Độ khó càng cao, điểm thưởng khi thắng càng lớn</span>
          </div>

          <div class="difficulty-list">
            <button
              v-for="(conf, key) in DIFFICULTIES"
              :key="key"
              class="diff-card"
              :class="{ active: difficulty === key }"
              @click="startNewGame(key)"
            >
              <div class="diff-top">
                <span class="diff-name">{{ conf.label }}</span>
                <span class="diff-summary">{{ conf.summary }}</span>
              </div>
              <p class="diff-desc">{{ conf.desc }}</p>
            </button>
          </div>
        </div>

        <!-- Khung Chủ đề & Gợi ý AI -->
        <div class="section-block">
          <div class="topic-row">
            <span class="section-title">Thông tin từ vựng</span>
            <span v-if="wordInfo.topic" class="topic-badge">Chủ đề: {{ wordInfo.topic }}</span>
          </div>

          <div class="ai-hint-box" v-if="difficulty !== 'hard'">
            <div v-if="isHintUnlocked" class="hint-content">
              <p class="hint-text"><strong>Gợi ý từ AI:</strong> {{ wordInfo.hint }}</p>
              <p v-if="revealedPositionInfo" class="revealed-chip">{{ revealedPositionInfo }}</p>
            </div>
            <div v-else class="hint-locked">
              Gợi ý của AI đang khóa. Sẽ tự động mở ở <strong>lượt đoán thứ 5</strong> (Hiện tại: {{ currentRow + 1 }}/{{ currentConfig.maxAttempts }}).
            </div>

            <button
              v-if="difficulty === 'easy' && !freeLetterRevealed && gameStatus === 'playing'"
              class="hint-action-btn"
              @click="useFreeLetterHint"
            >
              Mở 1 ô chữ đúng (Miễn phí)
            </button>
          </div>

          <div class="ai-hint-box hard-warning" v-else>
            <strong>Chế độ Master:</strong> Không có gợi ý. Các chữ cái đã mở màu Xanh lá hoặc Vàng bắt buộc phải được sử dụng lại ở lượt đoán kế tiếp.
          </div>
        </div>
      </aside>

      <!-- CỘT PHẢI: BẢNG Ô CHỮ & BÀN PHÍM ẢO -->
      <main class="right-panel glass">
        <!-- Thông báo nổi -->
        <transition name="fade">
          <div v-if="toastMessage" class="toast-alert">{{ toastMessage }}</div>
        </transition>

        <div v-if="isLoading" class="loading-box">
          <div class="spinner"></div>
          <p>Đang khởi tạo từ vựng mới...</p>
        </div>

        <template v-else>
          <!-- Bảng Lưới Ô Chữ -->
          <div class="game-board-wrapper">
            <div
              class="board-grid"
              :style="{ '--rows': currentConfig.maxAttempts, '--tile-size': tileSizePx }"
            >
              <div
                v-for="(row, rIdx) in board"
                :key="rIdx"
                class="board-row"
                :class="{
                  'shake-row': shakeRowIndex === rIdx,
                  'active-row': currentRow === rIdx && gameStatus === 'playing'
                }"
              >
                <div
                  v-for="(tile, cIdx) in row"
                  :key="cIdx"
                  class="board-tile"
                  :class="[
                    tile.status,
                    { 'filled': tile.letter !== '' && tile.status === 'empty' }
                  ]"
                >
                  {{ tile.letter }}
                </div>
              </div>
            </div>
          </div>

          <!-- Bàn Phím Ảo -->
          <div class="keyboard-container">
            <div v-for="(kRow, rIdx) in KEYBOARD_ROWS" :key="rIdx" class="keyboard-row">
              <button
                v-for="key in kRow"
                :key="key"
                class="key-btn"
                :class="[
                  keyboardState[key] || '',
                  { 'wide-key': key === 'ENTER' || key === 'XÓA' }
                ]"
                @click="handleKeyInput(key)"
              >
                {{ key }}
              </button>
            </div>
          </div>
        </template>
      </main>
    </div>

    <!-- MODAL 1: LUẬT CHƠI (TỰ ĐỘNG HIỆN KHI VÀO GAME + CÓ TÙY CHỌN KHÔNG NHẮC LẠI) -->
    <div v-if="showHelpModal" class="modal-overlay" @click.self="closeHelpModal">
      <div class="modal-card glass">
        <h2>Luật Chơi MindGarden Wordle</h2>
        <p class="modal-intro">
          Tìm ra từ tiếng Anh bí mật gồm <strong>5 chữ cái</strong> trong số lượt đoán quy định của từng cấp độ.
        </p>

        <ul class="rule-list">
          <li>Nhập 5 chữ cái từ bàn phím máy tính hoặc bàn phím ảo trên màn hình, sau đó nhấn <strong>ENTER</strong>.</li>
          <li>Sau mỗi lượt đoán, màu sắc của từng ô chữ sẽ thay đổi để báo hiệu:</li>
        </ul>

        <div class="example-block">
          <div class="example-item">
            <div class="example-tiles">
              <span class="ex-tile correct">W</span>
              <span class="ex-tile">O</span>
              <span class="ex-tile">R</span>
              <span class="ex-tile">D</span>
              <span class="ex-tile">Y</span>
            </div>
            <p><strong>Màu xanh lá (W):</strong> Chữ cái có trong từ và nằm <strong>đúng vị trí</strong>.</p>
          </div>

          <div class="example-item">
            <div class="example-tiles">
              <span class="ex-tile">L</span>
              <span class="ex-tile present">I</span>
              <span class="ex-tile">G</span>
              <span class="ex-tile">H</span>
              <span class="ex-tile">T</span>
            </div>
            <p><strong>Màu vàng (I):</strong> Chữ cái có trong từ nhưng đang nằm <strong>sai vị trí</strong>.</p>
          </div>

          <div class="example-item">
            <div class="example-tiles">
              <span class="ex-tile">R</span>
              <span class="ex-tile">O</span>
              <span class="ex-tile">G</span>
              <span class="ex-tile absent">U</span>
              <span class="ex-tile">E</span>
            </div>
            <p><strong>Màu xám (U):</strong> Chữ cái <strong>không xuất hiện</strong> trong từ ở bất kỳ vị trí nào.</p>
          </div>
        </div>

        <div class="rule-scoring-note">
          <strong>Cơ chế Tính điểm & Độ khó:</strong> Điểm cơ bản được tính dựa trên số lượt đoán còn dư, sau đó nhân với hệ số của độ khó bạn chọn (Dễ: <strong>x1.0</strong>, Trung bình: <strong>x1.5</strong>, Khó: <strong>x2.5</strong>).
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
    <div v-if="showResultModal" class="modal-overlay" @click.self="showResultModal = false">
      <div class="modal-card glass text-center">
        <h2>{{ gameStatus === 'won' ? 'Hoàn thành ván đấu!' : 'Hết lượt đoán' }}</h2>
        <p v-if="gameStatus === 'won'">
          Bạn đã tìm ra đáp án ở lượt thứ <strong>{{ currentRow + 1 }} / {{ currentConfig.maxAttempts }}</strong>.
        </p>
        <p v-else>Bạn đã sử dụng hết số lượt đoán của ván này.</p>

        <div class="word-reveal-box">
          <span class="label">Đáp án:</span>
          <div class="the-word">{{ targetWord }}</div>
          <p class="word-meaning"><strong>Nghĩa:</strong> {{ wordInfo.meaning }}</p>
          <p class="word-hint"><strong>Gợi ý:</strong> {{ wordInfo.hint }}</p>
        </div>

        <div class="points-summary">
          Điểm nhận được: <strong>+{{ earnedPoints }} điểm</strong> (Hệ số nhân x{{ currentConfig.multiplier }})
        </div>

        <div class="modal-actions">
          <button class="primary-btn" @click="startNewGame(difficulty)">Chơi ván tiếp theo</button>
          <button class="secondary-btn" @click="showResultModal = false">Đóng</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Khung cuộn độc lập giúp khắc phục triệt để lỗi không scroll xuống được bàn phím */
.wordle-scroll-wrapper {
  width: 100%;
  height: calc(100vh - 64px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px 36px;
  box-sizing: border-box;
  color: #f1f5f9;
}

.wordle-layout {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 920px) {
  .wordle-layout {
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
  gap: 18px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(15, 23, 42, 0.6);
  padding: 10px 14px;
  border-radius: 10px;
  gap: 10px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.72rem;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-value {
  font-size: 1.1rem;
  color: #60a5fa;
}

.action-group {
  display: flex;
  gap: 8px;
}

.text-btn {
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(51, 65, 85, 0.5);
  color: #e2e8f0;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.text-btn:hover {
  background: rgba(71, 85, 105, 0.8);
}

.text-btn.primary {
  background: #2563eb;
  border-color: #3b82f6;
  color: #ffffff;
}

.text-btn.primary:hover {
  background: #1d4ed8;
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
  color: #94a3b8;
}

.difficulty-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diff-card {
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(15, 23, 42, 0.55);
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.18s ease;
}

.diff-card:hover {
  border-color: rgba(96, 165, 250, 0.4);
}

.diff-card.active {
  background: rgba(37, 99, 235, 0.22);
  border-color: #3b82f6;
  color: #ffffff;
}

.diff-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.diff-name {
  font-weight: 700;
  font-size: 0.92rem;
}

.diff-summary {
  font-size: 0.76rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.25);
  color: #93c5fd;
}

.diff-desc {
  margin: 0;
  font-size: 0.78rem;
  color: #94a3b8;
  line-height: 1.35;
}

.topic-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.topic-badge {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  padding: 3px 10px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.78rem;
}

.ai-hint-box {
  background: rgba(15, 23, 42, 0.65);
  padding: 12px;
  border-radius: 10px;
  border-left: 3px solid #3b82f6;
  font-size: 0.84rem;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ai-hint-box.hard-warning {
  border-left-color: #ef4444;
  color: #fca5a5;
}

.hint-text {
  margin: 0;
  line-height: 1.4;
}

.revealed-chip {
  margin: 4px 0 0;
  display: inline-block;
  background: rgba(234, 179, 8, 0.18);
  color: #fde047;
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.8rem;
}

.hint-action-btn {
  align-self: flex-start;
  background: #eab308;
  color: #0f172a;
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.8rem;
  cursor: pointer;
}

/* Cột phải: Bảng chữ + Bàn phím */
.right-panel {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  position: relative;
}

.toast-alert {
  position: absolute;
  top: 12px;
  z-index: 20;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 700;
  font-size: 0.86rem;
  padding: 8px 16px;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.game-board-wrapper {
  display: flex;
  justify-content: center;
}

.board-grid {
  display: grid;
  grid-template-rows: repeat(var(--rows), 1fr);
  gap: 5px;
}

.board-row {
  display: grid;
  grid-template-columns: repeat(5, var(--tile-size));
  gap: 5px;
}

.board-tile {
  width: var(--tile-size);
  height: var(--tile-size);
  border: 2px solid #334155;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 800;
  text-transform: uppercase;
  background: rgba(15, 23, 42, 0.75);
  user-select: none;
  transition: transform 0.12s ease, background-color 0.2s ease;
}

.board-row.active-row .board-tile {
  border-color: #475569;
}

.board-tile.filled {
  border-color: #94a3b8;
  transform: scale(1.03);
}

.board-tile.correct, .key-btn.correct, .ex-tile.correct {
  background-color: #538d4e !important;
  border-color: #538d4e !important;
  color: #ffffff;
}

.board-tile.present, .key-btn.present, .ex-tile.present {
  background-color: #b59f3b !important;
  border-color: #b59f3b !important;
  color: #ffffff;
}

.board-tile.absent, .key-btn.absent, .ex-tile.absent {
  background-color: #3a3a3c !important;
  border-color: #3a3a3c !important;
  color: #94a3b8;
}

/* Bàn phím ảo */
.keyboard-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  width: 100%;
}

.keyboard-row {
  display: flex;
  gap: 5px;
  justify-content: center;
  width: 100%;
}

.key-btn {
  min-width: 38px;
  height: 44px;
  padding: 0 8px;
  border-radius: 6px;
  border: none;
  background: #475569;
  color: #f8fafc;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: filter 0.15s;
}

.key-btn.wide-key {
  min-width: 62px;
  font-size: 0.78rem;
}

.key-btn:hover {
  filter: brightness(1.12);
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}

.shake-row {
  animation: shake 0.4s ease;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.modal-card {
  max-width: 500px;
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

.rule-list {
  margin: 0 0 14px;
  padding-left: 18px;
  font-size: 0.86rem;
  color: #cbd5e1;
  line-height: 1.5;
}

.example-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.65);
  border-radius: 10px;
  margin-bottom: 14px;
}

.example-item p {
  margin: 6px 0 0;
  font-size: 0.82rem;
  color: #cbd5e1;
}

.example-tiles {
  display: flex;
  gap: 5px;
}

.ex-tile {
  width: 34px;
  height: 34px;
  border: 2px solid #475569;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 0.9rem;
  border-radius: 5px;
}

.rule-scoring-note {
  font-size: 0.82rem;
  color: #94a3b8;
  background: rgba(30, 41, 59, 0.9);
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
  line-height: 1.4;
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
  user-select: none;
}

.word-reveal-box {
  background: rgba(15, 23, 42, 0.8);
  padding: 14px;
  border-radius: 10px;
  margin: 14px 0;
}

.the-word {
  font-size: 1.8rem;
  font-weight: 900;
  letter-spacing: 5px;
  color: #4ade80;
  margin: 6px 0;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 16px;
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

.loading-box {
  padding: 60px 20px;
  text-align: center;
  color: #94a3b8;
}
</style>