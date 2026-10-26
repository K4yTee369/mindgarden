<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const HIDE_RULES_STORAGE_KEY = 'mindgarden_towerstack_hide_rules';

const CANVAS_WIDTH = 440;
const CANVAS_HEIGHT = 500;
const BLOCK_HEIGHT = 26;
const WIN_TARGET_FLOORS = 15; // Đạt 15 tầng được tính là 1 trận Thắng trên Leaderboard

const DIFFICULTIES = {
  easy: {
    key: 'easy',
    label: 'Dễ (Chill)',
    initialWidth: 210,
    minWidth: 10,
    baseSpeed: 165,
    speedIncrement: 4.5,
    perfectTolerance: 6,
    multiplier: 1.0,
    summary: 'Gạch rộng • x1.0 Điểm thưởng',
    desc: 'Khối gạch khởi đầu lớn (210px), tốc độ di chuyển chậm. Dễ đạt Perfect. Thua khi gạch nhỏ hơn 10px.'
  },
  medium: {
    key: 'medium',
    label: 'Trung bình',
    initialWidth: 175,
    minWidth: 14,
    baseSpeed: 220,
    speedIncrement: 6.5,
    perfectTolerance: 4.5,
    multiplier: 1.5,
    summary: 'Tiêu chuẩn • x1.5 Điểm thưởng',
    desc: 'Khối gạch vừa (175px), tốc độ tăng dần rõ rệt qua mỗi tầng. Thua khi gạch bị cắt nhỏ hơn 14px.'
  },
  hard: {
    key: 'hard',
    label: 'Khó (Master)',
    initialWidth: 145,
    minWidth: 18,
    baseSpeed: 285,
    speedIncrement: 8.5,
    perfectTolerance: 3,
    multiplier: 2.5,
    summary: 'Tốc độ cao • x2.5 Điểm thưởng',
    desc: 'Khối gạch hẹp (145px), tốc độ trượt rất nhanh và yêu cầu căn chuẩn từng milimet. Thua khi nhỏ hơn 18px.'
  }
};

const difficulty = ref('easy');
const gameState = ref('idle'); // 'idle' | 'playing' | 'gameover'
const canvasRef = ref(null);

// Thông số trong ván chơi
const floorsCount = ref(0);
const currentWidth = ref(210);
const perfectStreak = ref(0);
const maxPerfectStreak = ref(0);
const rawScore = ref(0);
const finalEarnedPoints = ref(0);
const lastFeedback = ref('');
const toastMessage = ref('');

// Modal
const showHelpModal = ref(false);
const dontShowRulesAgain = ref(false);
const showResultModal = ref(false);
const endReason = ref('');

// Thống kê cá nhân đồng bộ với Kho điểm chung (gameKey: 'game4')
const playerStats = ref({
  rank: null,
  gameScore: 0,
  overallScore: 0,
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0
});

// Bắt đầu chơi (Bỏ focus khỏi các nút bấm để phím Space không kích hoạt nhầm nút)
const startGame = () => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  window.scrollTo(0, 0);
  stopGameLoop();
  initTowerState();
  showResultModal.value = false;
  gameState.value = 'playing';
  lastFrameTime = performance.now();
  animationFrameId = requestAnimationFrame(gameLoop);
};

const currentConfig = computed(() => DIFFICULTIES[difficulty.value]);

const liveTotalPoints = computed(() => {
  return Math.round(rawScore.value * currentConfig.value.multiplier);
});

const widthPercentage = computed(() => {
  return Math.max(0, Math.round((currentWidth.value / currentConfig.value.initialWidth) * 100));
});

// Biến phục vụ Vòng lặp Canvas 60 FPS
let animationFrameId = null;
let lastFrameTime = 0;

let stackedBlocks = []; // Danh sách các viên gạch đã xếp cố định
let activeBlock = null; // Viên gạch đang trượt qua lại
let fallingPieces = []; // Các mảnh gạch thừa bị cắt rơi xuống
let perfectEffects = []; // Hiệu ứng lóe sáng khi đặt chuẩn Perfect
let cameraY = 0;
let targetCameraY = 0;

const getAuthConfig = () => {
  const token = localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : null;
};

const showToast = (msg, duration = 2200) => {
  toastMessage.value = msg;
  setTimeout(() => {
    if (toastMessage.value === msg) toastMessage.value = '';
  }, duration);
};

// Tạo màu sắc chuyển dải mượt mà theo tầng giống Tower Stack
const getBlockColor = (floorIndex) => {
  const hue = (95 + floorIndex * 9) % 360;
  return {
    main: `hsl(${hue}, 78%, 52%)`,
    border: `hsl(${hue}, 82%, 68%)`
  };
};

// Đồng bộ điểm Game 4 từ Kho điểm chung trên Server
const syncStatsFromProfile = (profile) => {
  if (!profile) return;
  const g4 = profile.games?.game4 || {};
  playerStats.value = {
    rank: profile.rank || null,
    gameScore: g4.score || 0,
    overallScore: profile.totalScore || 0,
    played: g4.played || 0,
    won: g4.won || 0,
    currentStreak: g4.currentStreak || 0,
    maxStreak: g4.maxStreak || 0
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
    console.error('Không thể tải thống kê cá nhân:', error);
  }
};

const saveScoreToServer = async (isWin, points) => {
  try {
    const config = getAuthConfig() || {};
    const savedUser = JSON.parse(localStorage.getItem('user') || '{}');

    const { data } = await axios.post(
      'http://localhost:5000/api/games/score',
      {
        gameKey: 'game4',
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
    console.error('Lỗi lưu điểm Tower Stack:', error);
  }
};

const selectDifficulty = (diffKey) => {
  difficulty.value = diffKey;
  if (gameState.value === 'playing') {
    startGame();
  } else {
    initTowerState();
    renderCanvas();
  }
};

const initTowerState = () => {
  const conf = currentConfig.value;
  floorsCount.value = 0;
  currentWidth.value = conf.initialWidth;
  perfectStreak.value = 0;
  maxPerfectStreak.value = 0;
  rawScore.value = 0;
  finalEarnedPoints.value = 0;
  lastFeedback.value = 'Nhấn Phím Cách (Space) hoặc Click vào khung để đặt gạch';
  endReason.value = '';

  cameraY = 0;
  targetCameraY = 0;
  fallingPieces = [];
  perfectEffects = [];

  // Khối đế móng đầu tiên nằm chính giữa đáy Canvas
  const baseWidth = conf.initialWidth;
  const baseX = (CANVAS_WIDTH - baseWidth) / 2;
  const baseY = CANVAS_HEIGHT - 44 - BLOCK_HEIGHT;

  stackedBlocks = [
    {
      floor: 0,
      x: baseX,
      y: baseY,
      width: baseWidth,
      height: BLOCK_HEIGHT,
      color: getBlockColor(0)
    }
  ];

  spawnNextActiveBlock();
};

// Tạo viên gạch mới trượt ngang ở tầng tiếp theo
const spawnNextActiveBlock = () => {
  const conf = currentConfig.value;
  const prevBlock = stackedBlocks[stackedBlocks.length - 1];
  const nextFloor = floorsCount.value + 1;
  const nextY = prevBlock.y - BLOCK_HEIGHT;

  const startFromLeft = nextFloor % 2 === 1;
  const speed = conf.baseSpeed + (nextFloor - 1) * conf.speedIncrement;

  activeBlock = {
    floor: nextFloor,
    x: startFromLeft ? 0 : CANVAS_WIDTH - currentWidth.value,
    y: nextY,
    width: currentWidth.value,
    height: BLOCK_HEIGHT,
    vx: startFromLeft ? speed : -speed,
    color: getBlockColor(nextFloor)
  };

  // Nếu tháp cao vượt 52% khung hình thì nâng Camera lên
  const screenThresholdY = CANVAS_HEIGHT * 0.48;
  if (nextY + targetCameraY < screenThresholdY) {
    targetCameraY = screenThresholdY - nextY;
  }
};

// Bắt đầu chơi
// const startGame = () => {
//   stopGameLoop();
//   initTowerState();
//   showResultModal.value = false;
//   gameState.value = 'playing';
//   lastFrameTime = performance.now();
//   animationFrameId = requestAnimationFrame(gameLoop);
// };

const stopGameLoop = () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
};

// Xử lý khi người chơi bấm Đặt Gạch (Drop / Lock Block)
const placeCurrentBlock = () => {
  if (gameState.value !== 'playing' || !activeBlock) return;

  const conf = currentConfig.value;
  const prevBlock = stackedBlocks[stackedBlocks.length - 1];
  const deltaX = activeBlock.x - prevBlock.x;
  const absDelta = Math.abs(deltaX);

  // TRƯỜNG HỢP 1: Căn chuẩn Hoàn Hảo (Perfect Match)
  if (absDelta <= conf.perfectTolerance) {
    activeBlock.x = prevBlock.x;
    perfectStreak.value += 1;
    if (perfectStreak.value > maxPerfectStreak.value) {
      maxPerfectStreak.value = perfectStreak.value;
    }

    // Thưởng mở rộng lại viên gạch nếu đạt chuỗi 3 lần Perfect liên tiếp
    if (perfectStreak.value % 3 === 0 && currentWidth.value < conf.initialWidth) {
      const bonusWidth = Math.min(10, conf.initialWidth - currentWidth.value);
      currentWidth.value = Math.round(currentWidth.value + bonusWidth);
      activeBlock.width = currentWidth.value;
      activeBlock.x = Math.max(10, Math.min(CANVAS_WIDTH - activeBlock.width - 10, activeBlock.x - bonusWidth / 2));
      lastFeedback.value = `Chuỗi ${perfectStreak.value} Perfect! Gạch được mở rộng +${bonusWidth}px`;
      showToast(`Combo ${perfectStreak.value} Perfect! Mở rộng gạch +${bonusWidth}px`);
    } else {
      lastFeedback.value = `Căn chuẩn Perfect (x${perfectStreak.value})! Không bị cắt cạnh`;
    }

    const gained = 20 + perfectStreak.value * 5;
    rawScore.value += gained;

    perfectEffects.push({
      x: activeBlock.x,
      y: activeBlock.y,
      width: activeBlock.width,
      height: activeBlock.height,
      alpha: 1.0
    });

    stackedBlocks.push({ ...activeBlock });
    floorsCount.value += 1;
    spawnNextActiveBlock();
    return;
  }

  // TRƯỜNG HỢP 2: Đặt lệch -> Tính phần chồng lên nhau và Cắt phần thừa
  const overlapLeft = Math.max(activeBlock.x, prevBlock.x);
  const overlapRight = Math.min(
    activeBlock.x + activeBlock.width,
    prevBlock.x + prevBlock.width
  );
  const overlapWidth = overlapRight - overlapLeft;

  // Nếu trượt hoàn toàn khỏi viên gạch dưới
  if (overlapWidth <= 0) {
    fallingPieces.push({
      x: activeBlock.x,
      y: activeBlock.y,
      width: activeBlock.width,
      height: activeBlock.height,
      vy: 40,
      vx: deltaX > 0 ? 35 : -35,
      color: activeBlock.color.main,
      alpha: 1.0
    });
    endReason.value = 'Bạn đã đặt viên gạch lệch hoàn toàn ra ngoài trụ tháp!';
    handleGameOver();
    return;
  }

  // Tách phần gạch thừa rơi xuống
  const cutWidth = activeBlock.width - overlapWidth;
  const cutX = deltaX < 0 ? activeBlock.x : overlapRight;

  fallingPieces.push({
    x: cutX,
    y: activeBlock.y,
    width: cutWidth,
    height: activeBlock.height,
    vy: 30,
    vx: deltaX < 0 ? -45 : 45,
    color: activeBlock.color.main,
    alpha: 1.0
  });

  perfectStreak.value = 0;
  currentWidth.value = Math.round(overlapWidth);

  // Kiểm tra nếu viên gạch bị cắt nhỏ hơn mức giới hạn tối thiểu của độ khó
  if (overlapWidth < conf.minWidth) {
    stackedBlocks.push({
      ...activeBlock,
      x: overlapLeft,
      width: overlapWidth
    });
    endReason.value = `Viên gạch chỉ còn ${Math.round(overlapWidth)}px (nhỏ hơn giới hạn tối thiểu ${conf.minWidth}px)!`;
    handleGameOver();
    return;
  }

  // Xếp viên gạch đã cắt vào tháp và tiếp tục tầng mới
  stackedBlocks.push({
    ...activeBlock,
    x: overlapLeft,
    width: overlapWidth
  });

  floorsCount.value += 1;
  rawScore.value += 10;
  lastFeedback.value = `Đã cắt bỏ ${Math.round(cutWidth)}px bị thừa • Còn lại ${Math.round(overlapWidth)}px`;

  spawnNextActiveBlock();
};

const updatePhysics = (dt) => {
  // 1. Di chuyển viên gạch đang trượt qua lại
  if (activeBlock && gameState.value === 'playing') {
    activeBlock.x += activeBlock.vx * dt;

    if (activeBlock.x <= 0) {
      activeBlock.x = 0;
      activeBlock.vx = Math.abs(activeBlock.vx);
    } else if (activeBlock.x + activeBlock.width >= CANVAS_WIDTH) {
      activeBlock.x = CANVAS_WIDTH - activeBlock.width;
      activeBlock.vx = -Math.abs(activeBlock.vx);
    }
  }

  // 2. Cuộn Camera mượt mà theo chiều cao tháp
  cameraY += (targetCameraY - cameraY) * Math.min(1, dt * 8);

  // 3. Cập nhật chuyển động rơi của các mảnh gạch thừa bị cắt
  for (let i = fallingPieces.length - 1; i >= 0; i--) {
    const p = fallingPieces[i];
    p.vy += 680 * dt; // Trọng lực
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.alpha -= dt * 0.85;

    if (p.alpha <= 0 || p.y + cameraY > CANVAS_HEIGHT + 60) {
      fallingPieces.splice(i, 1);
    }
  }

  // 4. Hiệu ứng sáng viền khi đạt Perfect
  for (let i = perfectEffects.length - 1; i >= 0; i--) {
    const ef = perfectEffects[i];
    ef.alpha -= dt * 2.2;
    ef.x -= dt * 18;
    ef.width += dt * 36;
    if (ef.alpha <= 0) {
      perfectEffects.splice(i, 1);
    }
  }
};

const renderCanvas = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // 1. Nền khung cảnh
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Vẽ các đường lưới ngang đánh dấu chiều cao
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  const gridOffset = cameraY % 52;
  for (let y = gridOffset; y < CANVAS_HEIGHT; y += 52) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(0, cameraY);

  // 2. Vẽ bệ đỡ màu cam dưới đáy tháp
  const basePlatformY = CANVAS_HEIGHT - 44;
  ctx.fillStyle = '#d97706';
  ctx.fillRect(36, basePlatformY, CANVAS_WIDTH - 72, 18);
  ctx.fillStyle = '#b45309';
  ctx.fillRect(36, basePlatformY + 18, CANVAS_WIDTH - 72, 10);

  // 3. Vẽ các tầng gạch đã xếp
  for (const b of stackedBlocks) {
    if (b.y + cameraY > CANVAS_HEIGHT + 40) continue;
    ctx.fillStyle = b.color.main;
    ctx.fillRect(b.x, b.y, b.width, b.height);

    ctx.strokeStyle = b.color.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.width - 1, b.height - 1);
  }

  // 4. Vẽ vạch gióng mờ từ viên gạch trên cùng lên để người chơi dễ căn
  if (stackedBlocks.length > 0 && gameState.value === 'playing') {
    const topBlock = stackedBlocks[stackedBlocks.length - 1];
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(topBlock.x, topBlock.y);
    ctx.lineTo(topBlock.x, topBlock.y - BLOCK_HEIGHT * 1.4);
    ctx.moveTo(topBlock.x + topBlock.width, topBlock.y);
    ctx.lineTo(topBlock.x + topBlock.width, topBlock.y - BLOCK_HEIGHT * 1.4);
    ctx.stroke();
    ctx.restore();
  }

  // 5. Vẽ viên gạch đang di chuyển
  if (activeBlock && gameState.value === 'playing') {
    ctx.fillStyle = activeBlock.color.main;
    ctx.fillRect(activeBlock.x, activeBlock.y, activeBlock.width, activeBlock.height);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(activeBlock.x + 1, activeBlock.y + 1, activeBlock.width - 2, activeBlock.height - 2);
  }

  // 6. Vẽ các mảnh gạch bị cắt đang rơi xuống
  for (const p of fallingPieces) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.restore();
  }

  // 7. Vẽ hiệu ứng lóe sáng khi đạt Perfect
  for (const ef of perfectEffects) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ef.alpha);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    ctx.strokeRect(ef.x, ef.y, ef.width, ef.height);
    ctx.restore();
  }

  ctx.restore();
};

const gameLoop = (timestamp) => {
  if (gameState.value === 'idle') return;

  const dt = Math.min(0.05, (timestamp - lastFrameTime) / 1000);
  lastFrameTime = timestamp;

  updatePhysics(dt);
  renderCanvas();

  if (gameState.value === 'playing' || fallingPieces.length > 0) {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
};

// Kết thúc ván chơi & Lưu điểm lên MongoDB
const handleGameOver = async () => {
  gameState.value = 'gameover';

  const isWin = floorsCount.value >= WIN_TARGET_FLOORS;
  finalEarnedPoints.value = Math.max(5, liveTotalPoints.value);

  await saveScoreToServer(isWin, finalEarnedPoints.value);

  setTimeout(() => {
    showResultModal.value = true;
  }, 550);
};

// Hỗ trợ phím Space / Enter / Mũi tên xuống và chặn cuộn trang 100%
const handleKeyDown = (e) => {
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    // Luôn chặn hành vi cuộn trang mặc định của trình duyệt khi ở trong game
    e.preventDefault();

    if (showHelpModal.value) return;

    if (gameState.value === 'playing') {
      placeCurrentBlock();
    } else if (e.code === 'Space' && !showResultModal.value) {
      // Nếu đang ở màn hình chờ (idle) mà nhấn Space thì bắt đầu chơi luôn
      startGame();
    }
  }
};

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
  window.addEventListener('keydown', handleKeyDown);
  const hideRules = localStorage.getItem(HIDE_RULES_STORAGE_KEY) === 'true';
  if (!hideRules) {
    showHelpModal.value = true;
  }
  fetchMyStats();
  initTowerState();
  renderCanvas();
});

onUnmounted(() => {
  stopGameLoop();
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <div class="towerstack-scroll-wrapper">
    <div class="towerstack-layout">
      <!-- CỘT TRÁI: THỐNG KÊ, ĐỘ KHÓ & NGUYÊN TẮC CẮT GẠCH -->
      <aside class="left-panel glass">
        <div class="title-group">
          <h1>MindGarden Tower Stack</h1>
          <p class="subtitle">Căn chuẩn thời điểm để xếp chồng các khối gạch 2D</p>
        </div>

        <!-- Thanh thống kê cá nhân (Game 4) -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">Hạng chung</span>
            <strong class="stat-value">{{ playerStats.rank ? `#${playerStats.rank}` : '--' }}</strong>
          </div>
          <div class="stat-item">
            <span class="stat-label">Điểm Game 4</span>
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
          <button class="text-btn primary" @click="startGame">
            {{ gameState === 'playing' ? 'Xây lại từ đầu' : 'Bắt đầu chơi' }}
          </button>
        </div>

        <!-- Chọn độ khó -->
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">Chọn độ khó</span>
            <span class="section-note">Xây đạt {{ WIN_TARGET_FLOORS }} tầng để tính 1 trận Thắng</span>
          </div>

          <div class="difficulty-list">
            <button
              v-for="(conf, key) in DIFFICULTIES"
              :key="key"
              class="diff-card"
              :class="{ active: difficulty === key }"
              @click="selectDifficulty(key)"
            >
              <div class="diff-top">
                <span class="diff-name">{{ conf.label }}</span>
                <span class="diff-summary">{{ conf.summary }}</span>
              </div>
              <p class="diff-desc">{{ conf.desc }}</p>
            </button>
          </div>
        </div>

        <!-- Quy tắc tính điểm nhanh -->
        <div class="section-block">
          <span class="section-title">Cơ chế Tính điểm & Cắt gạch</span>
          <div class="rules-summary-box">
            <div class="rule-row">
              <span>Đặt khớp thông thường:</span>
              <strong>+10 điểm / tầng</strong>
            </div>
            <div class="rule-row">
              <span>Căn chuẩn Perfect:</span>
              <strong>+25 đến +50 điểm</strong>
            </div>
            <div class="rule-row">
              <span>Combo 3 lần Perfect liên tiếp:</span>
              <strong>Mở rộng lại gạch +10px</strong>
            </div>
            <div class="rule-row">
              <span>Giới hạn thua hiện tại:</span>
              <strong>Nhỏ hơn {{ currentConfig.minWidth }}px</strong>
            </div>
          </div>
        </div>
      </aside>

      <!-- CỘT PHẢI: KHUNG XÂY THÁP 2D -->
      <main class="right-panel glass">
        <transition name="fade">
          <div v-if="toastMessage" class="toast-alert">{{ toastMessage }}</div>
        </transition>

        <!-- Thanh thông số trực tiếp -->
        <div class="hud-bar">
          <div class="hud-box">
            <span class="hud-label">Số tầng</span>
            <strong class="hud-val">{{ floorsCount }}</strong>
          </div>

          <div class="hud-box">
            <span class="hud-label">Độ rộng gạch</span>
            <strong class="hud-val">{{ currentWidth }}px ({{ widthPercentage }}%)</strong>
          </div>

          <div class="hud-box">
            <span class="hud-label">Chuỗi Perfect</span>
            <strong class="hud-val perfect-color">x{{ perfectStreak }}</strong>
          </div>

          <div class="hud-box">
            <span class="hud-label">Điểm hiện tại</span>
            <strong class="hud-val score-color">{{ liveTotalPoints }}</strong>
          </div>
        </div>

        <div class="feedback-banner">
          {{ lastFeedback }}
        </div>

        <!-- Khung Canvas Xây Tháp (Click trực tiếp vào khung cũng đặt được gạch) -->
        <div class="canvas-container" @mousedown="placeCurrentBlock">
          <canvas
            ref="canvasRef"
            :width="CANVAS_WIDTH"
            :height="CANVAS_HEIGHT"
            class="tower-canvas"
          ></canvas>

          <div v-if="gameState === 'idle'" class="canvas-overlay" @mousedown.stop>
            <h3>Sẵn sàng xây tháp?</h3>
            <p>
              Nhấn <strong>Phím Cách (Space)</strong>, <strong>Click chuột</strong> hoặc nút bên dưới đúng lúc viên gạch đi ngang qua khối bên dưới.
            </p>
            <button class="start-big-btn" @click="startGame">Bắt đầu ván đấu</button>
          </div>
        </div>

        <!-- Nút bấm Đặt Gạch lớn cho cả máy tính & điện thoại -->
        <button
          class="drop-action-btn"
          :disabled="gameState !== 'playing'"
          @click="placeCurrentBlock"
        >
          ĐẶT GẠCH (PHÍM CÁCH / CLICK)
        </button>
      </main>
    </div>

    <!-- MODAL 1: LUẬT CHƠI -->
    <div v-if="showHelpModal" class="modal-overlay" @click.self="closeHelpModal">
      <div class="modal-card glass">
        <h2>Luật Chơi MindGarden Tower Stack</h2>
        <p class="modal-intro">
          Xếp chồng các viên gạch 2D lên nhau thật chuẩn xác để xây tòa tháp cao nhất có thể.
        </p>

        <ul class="rule-list">
          <li>
            <strong>Thao tác đặt gạch:</strong> Nhấn <strong>Phím Cách (Space)</strong>, phím <strong>Enter</strong>, hoặc <strong>Click trực tiếp</strong> vào màn hình để khóa viên gạch đang trượt.
          </li>
          <li>
            <strong>Cắt phần gạch thừa:</strong> Nếu viên gạch phía trên bị lệch so với viên gạch phía dưới, phần nhô ra ngoài sẽ bị cắt bỏ và rơi xuống. Viên gạch tiếp theo sẽ bị thu hẹp lại.
          </li>
          <li>
            <strong>Căn chuẩn Hoàn hảo (Perfect):</strong> Nếu đặt khít với viên gạch dưới, bạn được tính <strong>Perfect</strong> (không bị cắt cạnh). Đạt <strong>3 lần Perfect liên tiếp</strong> sẽ giúp viên gạch mở rộng trở lại!
          </li>
          <li>
            <strong>Điều kiện Kết thúc:</strong> Trò chơi kết thúc khi bạn đặt trượt hoàn toàn hoặc viên gạch bị cắt nhỏ hơn mức tối thiểu của độ khó đang chọn. Xây từ <strong>{{ WIN_TARGET_FLOORS }} tầng trở lên</strong> được tính là 1 trận Thắng trên Bảng xếp hạng.
          </li>
        </ul>

        <div class="modal-footer">
          <label class="checkbox-label">
            <input type="checkbox" v-model="dontShowRulesAgain" />
            <span>Không tự động hiển thị lại vào lần sau</span>
          </label>
          <button class="primary-btn" @click="closeHelpModal">Bắt đầu ngay</button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: KẾT QUẢ VÁN ĐẤU -->
    <div v-if="showResultModal" class="modal-overlay" @click.self="showResultModal = false">
      <div class="modal-card glass text-center">
        <h2>{{ floorsCount >= WIN_TARGET_FLOORS ? 'Xây tháp thành công!' : 'Tòa tháp đã dừng lại' }}</h2>
        <p class="reason-text">{{ endReason }}</p>

        <div class="result-summary-box">
          <div class="summary-line">
            <span>Chiều cao đạt được:</span>
            <strong>{{ floorsCount }} tầng</strong>
          </div>
          <div class="summary-line">
            <span>Chuỗi Perfect cao nhất:</span>
            <strong>{{ maxPerfectStreak }} lần liên tiếp</strong>
          </div>
          <div class="summary-line total-line">
            <span>Điểm cộng vào Game 4 (x{{ currentConfig.multiplier }}):</span>
            <strong class="highlight-pts">+{{ finalEarnedPoints }} điểm</strong>
          </div>
        </div>

        <div class="modal-actions">
          <button class="primary-btn" @click="startGame">Chơi lại ngay</button>
          <button class="secondary-btn" @click="router.push('/leaderboard')">Xem Bảng xếp hạng</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.towerstack-scroll-wrapper {
  width: 100%;
  height: calc(100vh - 64px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px 36px;
  box-sizing: border-box;
  color: #f1f5f9;
}

.towerstack-layout {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 920px) {
  .towerstack-layout {
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
  font-size: 0.9rem;
}

.diff-summary {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.25);
  color: #93c5fd;
}

.diff-desc {
  margin: 0;
  font-size: 0.76rem;
  color: #94a3b8;
  line-height: 1.35;
}

.rules-summary-box {
  background: rgba(15, 23, 42, 0.6);
  padding: 12px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.8rem;
  color: #cbd5e1;
}

.rule-row {
  display: flex;
  justify-content: space-between;
}

/* Cột phải */
.right-panel {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  position: relative;
}

.toast-alert {
  position: absolute;
  top: 14px;
  z-index: 30;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 700;
  font-size: 0.85rem;
  padding: 8px 16px;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
}

.hud-bar {
  width: 100%;
  max-width: 480px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  background: rgba(15, 23, 42, 0.7);
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.hud-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.hud-label {
  font-size: 0.7rem;
  color: #94a3b8;
  text-transform: uppercase;
}

.hud-val {
  font-size: 0.96rem;
  color: #f8fafc;
}

.perfect-color {
  color: #facc15;
}

.score-color {
  color: #38bdf8;
}

.feedback-banner {
  font-size: 0.82rem;
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.55);
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.canvas-container {
  position: relative;
  width: 440px;
  height: 500px;
  max-width: 100%;
  cursor: pointer;
  user-select: none;
}

.tower-canvas {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.14);
  display: block;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.canvas-overlay {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: rgba(9, 13, 22, 0.86);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  gap: 12px;
  cursor: default;
}

.canvas-overlay h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #f8fafc;
}

.canvas-overlay p {
  margin: 0;
  font-size: 0.86rem;
  color: #94a3b8;
  max-width: 320px;
  line-height: 1.45;
}

.start-big-btn {
  margin-top: 6px;
  padding: 11px 24px;
  border-radius: 8px;
  border: none;
  background: #22c55e;
  color: #052e16;
  font-weight: 800;
  font-size: 0.92rem;
  cursor: pointer;
}

.drop-action-btn {
  width: 100%;
  max-width: 440px;
  padding: 12px;
  border-radius: 10px;
  border: none;
  background: #2563eb;
  color: #ffffff;
  font-weight: 800;
  font-size: 0.9rem;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: background 0.15s;
}

.drop-action-btn:hover:not(:disabled) {
  background: #1d4ed8;
}

.drop-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.74);
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

.modal-intro, .reason-text {
  margin: 0 0 12px;
  font-size: 0.88rem;
  color: #cbd5e1;
}

.rule-list {
  margin: 0 0 16px;
  padding-left: 18px;
  font-size: 0.85rem;
  color: #cbd5e1;
  line-height: 1.55;
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.result-summary-box {
  background: rgba(15, 23, 42, 0.8);
  padding: 16px;
  border-radius: 10px;
  margin: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 0.88rem;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  color: #cbd5e1;
}

.summary-line.total-line {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 10px;
  font-size: 0.95rem;
}

.highlight-pts {
  color: #4ade80;
  font-size: 1.1rem;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
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
</style>