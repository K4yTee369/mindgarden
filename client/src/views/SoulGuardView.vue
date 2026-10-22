<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const HIDE_RULES_STORAGE_KEY = 'mindgarden_soulguard_hide_rules';

const DIFFICULTIES = {
  easy: {
    key: 'easy',
    label: 'Dễ (Chill)',
    maxHp: 5,
    multiplier: 1.0,
    baseSpawnInterval: 0.75,
    speedFactor: 0.85,
    summary: '5 Mạng • x1.0 Điểm thưởng',
    desc: 'Tốc độ chướng ngại vật vừa phải, nhiều hạt năng lượng xanh giúp hồi máu.'
  },
  medium: {
    key: 'medium',
    label: 'Trung bình',
    maxHp: 3,
    multiplier: 1.5,
    baseSpawnInterval: 0.52,
    speedFactor: 1.05,
    summary: '3 Mạng • x1.5 Điểm thưởng',
    desc: 'Trải nghiệm tiêu chuẩn. Mở khóa đạn tự ngắm mục tiêu và chùm tia theo từng đợt.'
  },
  hard: {
    key: 'hard',
    label: 'Khó (Master)',
    maxHp: 2,
    multiplier: 2.5,
    baseSpawnInterval: 0.36,
    speedFactor: 1.3,
    summary: '2 Mạng • x2.5 Điểm thưởng',
    desc: 'Thử thách phản xạ cực đại. Mật độ đạn dày đặc và tốc độ di chuyển cao.'
  }
};

// Cấu hình kích thước Hộp Chiến Đấu (Battle Box)
const BOX_SIZE = 420;
const WIN_SURVIVAL_SECONDS = 20; // Sống sót >= 20s được tính là 1 trận Thắng trên Leaderboard

const difficulty = ref('easy');
const gameState = ref('idle'); // 'idle' | 'playing' | 'gameover'
const canvasRef = ref(null);

// Thông số trong trận
const hp = ref(5);
const maxHp = ref(5);
const survivalTime = ref(0);
const dodgedCount = ref(0);
const greenOrbsCollected = ref(0);
const rawScore = ref(0);
const finalEarnedPoints = ref(0);
const currentWave = ref(1);
const toastMessage = ref('');

// Modal
const showHelpModal = ref(false);
const dontShowRulesAgain = ref(false);
const showResultModal = ref(false);

// Thống kê cá nhân đồng bộ với Kho điểm chung (gameKey: 'game3')
const playerStats = ref({
  rank: null,
  gameScore: 0,
  overallScore: 0,
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0
});

const currentConfig = computed(() => DIFFICULTIES[difficulty.value]);

// Điểm dự kiến sau khi nhân hệ số độ khó
const liveTotalPoints = computed(() => {
  return Math.round(rawScore.value * currentConfig.value.multiplier);
});

// Biến phục vụ Game Loop 60 FPS
let animationFrameId = null;
let lastFrameTime = 0;
let spawnTimer = 0;
let healSpawnTimer = 0;
let secondAccumulator = 0;

const player = {
  x: BOX_SIZE / 2,
  y: BOX_SIZE / 2,
  radius: 10,
  speed: 230, // pixel / giây
  invincibleTimer: 0
};

let obstacles = [];

const keysPressed = {
  up: false,
  down: false,
  left: false,
  right: false
};

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

// Đồng bộ điểm Game 3 từ Server
const syncStatsFromProfile = (profile) => {
  if (!profile) return;
  const g3 = profile.games?.game3 || {};
  playerStats.value = {
    rank: profile.rank || null,
    gameScore: g3.score || 0,
    overallScore: profile.totalScore || 0,
    played: g3.played || 0,
    won: g3.won || 0,
    currentStreak: g3.currentStreak || 0,
    maxStreak: g3.maxStreak || 0
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
        gameKey: 'game3',
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
    console.error('Lỗi lưu điểm Soul Guard:', error);
  }
};

// Chọn độ khó
const selectDifficulty = (diffKey) => {
  difficulty.value = diffKey;
  if (gameState.value === 'playing') {
    startGame();
  } else {
    resetGameData();
    drawInitialCanvas();
  }
};

const resetGameData = () => {
  const conf = currentConfig.value;
  maxHp.value = conf.maxHp;
  hp.value = conf.maxHp;
  survivalTime.value = 0;
  dodgedCount.value = 0;
  greenOrbsCollected.value = 0;
  rawScore.value = 0;
  finalEarnedPoints.value = 0;
  currentWave.value = 1;

  player.x = BOX_SIZE / 2;
  player.y = BOX_SIZE / 2;
  player.invincibleTimer = 0;

  obstacles = [];
  spawnTimer = 0;
  healSpawnTimer = 0;
  secondAccumulator = 0;
};

// Bắt đầu trận đấu
const startGame = () => {
  stopGameLoop();
  resetGameData();
  showResultModal.value = false;
  gameState.value = 'playing';
  lastFrameTime = performance.now();
  animationFrameId = requestAnimationFrame(gameLoop);
};

const stopGameLoop = () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
};

// Sinh chướng ngại vật ở 4 cạnh hộp
const spawnObstacle = (type = 'normal') => {
  const edge = Math.floor(Math.random() * 4); // 0: Trên, 1: Phải, 2: Dưới, 3: Trái
  let x = 0;
  let y = 0;

  if (edge === 0) {
    x = 20 + Math.random() * (BOX_SIZE - 40);
    y = -12;
  } else if (edge === 1) {
    x = BOX_SIZE + 12;
    y = 20 + Math.random() * (BOX_SIZE - 40);
  } else if (edge === 2) {
    x = 20 + Math.random() * (BOX_SIZE - 40);
    y = BOX_SIZE + 12;
  } else {
    x = -12;
    y = 20 + Math.random() * (BOX_SIZE - 40);
  }

  const waveSpeedBoost = 1 + (currentWave.value - 1) * 0.12;
  const baseSpeed = (135 + Math.random() * 55) * currentConfig.value.speedFactor * waveSpeedBoost;

  let vx = 0;
  let vy = 0;
  let radius = 7;
  let color = '#f8fafc';

  if (type === 'heal') {
    // Hạt năng lượng xanh lá: Bay hướng về khu vực trung tâm hộp
    const targetX = BOX_SIZE * (0.25 + Math.random() * 0.5);
    const targetY = BOX_SIZE * (0.25 + Math.random() * 0.5);
    const angle = Math.atan2(targetY - y, targetX - x);
    const healSpeed = 115;
    vx = Math.cos(angle) * healSpeed;
    vy = Math.sin(angle) * healSpeed;
    radius = 8;
    color = '#22c55e';
  } else if (type === 'aimed') {
    // Đạn Vàng: Nhắm thẳng vào tọa độ hiện tại của Trái tim
    const angle = Math.atan2(player.y - y, player.x - x);
    vx = Math.cos(angle) * (baseSpeed * 1.12);
    vy = Math.sin(angle) * (baseSpeed * 1.12);
    radius = 7;
    color = '#eab308';
  } else if (type === 'burst') {
    // Đạn Đỏ: Kích thước lớn hơn, bay chéo tốc độ cao
    const targetX = BOX_SIZE * (0.2 + Math.random() * 0.6);
    const targetY = BOX_SIZE * (0.2 + Math.random() * 0.6);
    const angle = Math.atan2(targetY - y, targetX - x);
    vx = Math.cos(angle) * (baseSpeed * 1.25);
    vy = Math.sin(angle) * (baseSpeed * 1.25);
    radius = 9;
    color = '#ef4444';
  } else {
    // Đạn Trắng cơ bản: Bay thẳng từ cạnh này sang cạnh đối diện (có độ lệch nhẹ)
    const spread = (Math.random() - 0.5) * 45;
    if (edge === 0) { vx = spread; vy = baseSpeed; }
    else if (edge === 1) { vx = -baseSpeed; vy = spread; }
    else if (edge === 2) { vx = spread; vy = -baseSpeed; }
    else { vx = baseSpeed; vy = spread; }
  }

  obstacles.push({ x, y, vx, vy, radius, type, color });
};

// Cập nhật trạng thái vật lý mỗi khung hình
const updatePhysics = (dt) => {
  // 1. Thời gian sinh tồn & tăng độ khó theo Wave
  secondAccumulator += dt;
  if (secondAccumulator >= 1.0) {
    secondAccumulator -= 1.0;
    survivalTime.value += 1;
    rawScore.value += 2; // +2 điểm mỗi giây sống sót

    if (survivalTime.value >= 35) currentWave.value = 3;
    else if (survivalTime.value >= 15) currentWave.value = 2;
    else currentWave.value = 1;
  }

  if (player.invincibleTimer > 0) {
    player.invincibleTimer = Math.max(0, player.invincibleTimer - dt);
  }

  // 2. Di chuyển nhân vật (Chuẩn hóa vector chéo để đi chéo không bị nhanh hơn đi thẳng)
  let dx = 0;
  let dy = 0;
  if (keysPressed.left) dx -= 1;
  if (keysPressed.right) dx += 1;
  if (keysPressed.up) dy -= 1;
  if (keysPressed.down) dy += 1;

  if (dx !== 0 && dy !== 0) {
    const invSqrt2 = 0.70710678;
    dx *= invSqrt2;
    dy *= invSqrt2;
  }

  player.x += dx * player.speed * dt;
  player.y += dy * player.speed * dt;

  // Giữ Trái tim không đi xuyên qua 4 vách tường của Hộp Chiến Đấu
  const margin = player.radius + 6;
  player.x = Math.max(margin, Math.min(BOX_SIZE - margin, player.x));
  player.y = Math.max(margin, Math.min(BOX_SIZE - margin, player.y));

  // 3. Bộ đếm sinh chướng ngại vật
  spawnTimer += dt;
  const dynamicInterval = Math.max(
    0.18,
    currentConfig.value.baseSpawnInterval - (currentWave.value - 1) * 0.08
  );

  if (spawnTimer >= dynamicInterval) {
    spawnTimer = 0;
    const roll = Math.random();
    if (currentWave.value >= 3 && roll < 0.28) {
      spawnObstacle('burst');
    } else if (currentWave.value >= 2 && roll < 0.55) {
      spawnObstacle('aimed');
    } else {
      spawnObstacle('normal');
    }
  }

  // Sinh hạt năng lượng xanh lá mỗi 5.5 giây
  healSpawnTimer += dt;
  if (healSpawnTimer >= 5.5) {
    healSpawnTimer = 0;
    spawnObstacle('heal');
  }

  // 4. Cập nhật vị trí đạn & Kiểm tra va chạm bằng Định lý Pytago
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const ob = obstacles[i];
    ob.x += ob.vx * dt;
    ob.y += ob.vy * dt;

    // Khoảng cách giữa tâm Trái tim và tâm Viên đạn
    const dist = Math.hypot(player.x - ob.x, player.y - ob.y);

    if (dist < player.radius + ob.radius) {
      if (ob.type === 'heal') {
        // Ăn hạt năng lượng xanh lá
        greenOrbsCollected.value += 1;
        rawScore.value += 15;
        if (hp.value < maxHp.value) {
          hp.value += 1;
          showToast('Hồi phục +1 Mạng và +15 điểm!');
        } else {
          showToast('Thu thập năng lượng xanh: +15 điểm!');
        }
        obstacles.splice(i, 1);
        continue;
      } else if (player.invincibleTimer <= 0) {
        // Trúng chướng ngại vật
        hp.value -= 1;
        player.invincibleTimer = 1.2; // Bất tử nhấp nháy 1.2s
        obstacles.splice(i, 1);

        if (hp.value <= 0) {
          handleGameOver();
          return;
        }
        continue;
      }
    }

    // Kiểm tra nếu viên đạn đã bay ra khỏi Hộp Chiến Đấu -> Tính là Né thành công
    if (
      ob.x < -30 ||
      ob.x > BOX_SIZE + 30 ||
      ob.y < -30 ||
      ob.y > BOX_SIZE + 30
    ) {
      if (ob.type !== 'heal') {
        dodgedCount.value += 1;
        rawScore.value += 1; // +1 điểm mỗi viên đạn né thành công
      }
      obstacles.splice(i, 1);
    }
  }
};

// Vẽ hình Trái tim đặc trưng lên Canvas
const drawHeart = (ctx, x, y, size, color) => {
  ctx.save();
  ctx.beginPath();
  const topCurveHeight = size * 0.3;
  ctx.moveTo(x, y + topCurveHeight);
  // Nửa trái tim bên trái
  ctx.bezierCurveTo(x, y, x - size, y, x - size, y + topCurveHeight);
  ctx.bezierCurveTo(x - size, y + (size + topCurveHeight) / 2, x, y + (size + topCurveHeight) / 1.4, x, y + size);
  // Nửa trái tim bên phải
  ctx.bezierCurveTo(x, y + (size + topCurveHeight) / 1.4, x + size, y + (size + topCurveHeight) / 2, x + size, y + topCurveHeight);
  ctx.bezierCurveTo(x + size, y, x, y, x, y + topCurveHeight);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
};

// Vẽ toàn bộ khung hình
const renderCanvas = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // 1. Nền đen tuyền của Battle Box
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, BOX_SIZE, BOX_SIZE);

  // Lưới mờ trang trí bên trong hộp
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let p = 60; p < BOX_SIZE; p += 60) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, BOX_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(BOX_SIZE, p);
    ctx.stroke();
  }

  // 2. Vẽ các chướng ngại vật & hạt năng lượng
  for (const ob of obstacles) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ob.x, ob.y, ob.radius, 0, Math.PI * 2);
    ctx.fillStyle = ob.color;
    ctx.shadowColor = ob.color;
    ctx.shadowBlur = ob.type === 'heal' ? 12 : 6;
    ctx.fill();
    ctx.restore();
  }

  // 3. Vẽ Trái tim của người chơi (Nhấp nháy khi đang trong thời gian bất tử)
  const isBlinking = player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 12) % 2 === 0;
  if (!isBlinking) {
    drawHeart(ctx, player.x, player.y - 10, 12, '#ef4444');
  }

  // 4. Viền trắng dày bao quanh Battle Box
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, BOX_SIZE - 6, BOX_SIZE - 6);
};

const drawInitialCanvas = () => {
  renderCanvas();
};

const gameLoop = (timestamp) => {
  if (gameState.value !== 'playing') return;

  const dt = Math.min(0.05, (timestamp - lastFrameTime) / 1000);
  lastFrameTime = timestamp;

  updatePhysics(dt);
  renderCanvas();

  if (gameState.value === 'playing') {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
};

// Kết thúc ván đấu & Lưu điểm
const handleGameOver = async () => {
  gameState.value = 'gameover';
  stopGameLoop();

  const isWin = survivalTime.value >= WIN_SURVIVAL_SECONDS;
  finalEarnedPoints.value = Math.max(5, liveTotalPoints.value);

  await saveScoreToServer(isWin, finalEarnedPoints.value);
  showResultModal.value = true;
};

// Xử lý bàn phím vật lý
const handleKeyDown = (e) => {
  const key = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
    if (gameState.value === 'playing') e.preventDefault();
  }
  if (key === 'arrowup' || key === 'w') keysPressed.up = true;
  if (key === 'arrowdown' || key === 's') keysPressed.down = true;
  if (key === 'arrowleft' || key === 'a') keysPressed.left = true;
  if (key === 'arrowright' || key === 'd') keysPressed.right = true;
};

const handleKeyUp = (e) => {
  const key = e.key.toLowerCase();
  if (key === 'arrowup' || key === 'w') keysPressed.up = false;
  if (key === 'arrowdown' || key === 's') keysPressed.down = false;
  if (key === 'arrowleft' || key === 'a') keysPressed.left = false;
  if (key === 'arrowright' || key === 'd') keysPressed.right = false;
};

// Hỗ trợ nút bấm di chuyển trên màn hình
const setDirectionHold = (dir, state) => {
  keysPressed[dir] = state;
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
  window.addEventListener('keyup', handleKeyUp);

  const hideRules = localStorage.getItem(HIDE_RULES_STORAGE_KEY) === 'true';
  if (!hideRules) {
    showHelpModal.value = true;
  }

  fetchMyStats();
  resetGameData();
  drawInitialCanvas();
});

onUnmounted(() => {
  stopGameLoop();
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
});
</script>

<template>
  <div class="soulguard-scroll-wrapper">
    <div class="soulguard-layout">
      <!-- CỘT TRÁI: THỐNG KÊ, CHỌN ĐỘ KHÓ & HƯỚNG DẪN -->
      <aside class="left-panel glass">
        <div class="title-group">
          <h1>MindGarden Soul Guard</h1>
          <p class="subtitle">Điều khiển trái tim né chướng ngại vật trong hộp giới hạn</p>
        </div>

        <!-- Khung Thống kê Cá nhân (Game 3) -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">Hạng chung</span>
            <strong class="stat-value">{{ playerStats.rank ? `#${playerStats.rank}` : '--' }}</strong>
          </div>
          <div class="stat-item">
            <span class="stat-label">Điểm Game 3</span>
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
            {{ gameState === 'playing' ? 'Chơi lại từ đầu' : 'Bắt đầu chơi' }}
          </button>
        </div>

        <!-- Chọn độ khó -->
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">Chọn độ khó</span>
            <span class="section-note">Sống sót đủ {{ WIN_SURVIVAL_SECONDS }} giây để tính 1 trận Thắng</span>
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

        <!-- Chú thích các loại Đạn trong Hộp -->
        <div class="section-block">
          <span class="section-title">Các vật thể trong hộp</span>
          <div class="orb-legend-list">
            <div class="orb-row">
              <span class="orb-dot white"></span>
              <span><strong>Đạn Trắng:</strong> Bay thẳng từ 4 vách tường</span>
            </div>
            <div class="orb-row">
              <span class="orb-dot yellow"></span>
              <span><strong>Đạn Vàng (Wave 2):</strong> Tự động nhắm vào vị trí của bạn</span>
            </div>
            <div class="orb-row">
              <span class="orb-dot red"></span>
              <span><strong>Đạn Đỏ (Wave 3):</strong> Kích thước lớn, bay tốc độ cao</span>
            </div>
            <div class="orb-row">
              <span class="orb-dot green"></span>
              <span><strong>Hạt Xanh Lá:</strong> Chạm vào để nhận +15 điểm & Hồi +1 Mạng</span>
            </div>
          </div>
        </div>
      </aside>

      <!-- CỘT PHẢI: HỘP CHIẾN ĐẤU (BATTLE BOX CANVAS) -->
      <main class="right-panel glass">
        <transition name="fade">
          <div v-if="toastMessage" class="toast-alert">{{ toastMessage }}</div>
        </transition>

        <!-- Thanh trạng thái trận đấu (HP, Wave, Thời gian, Điểm) -->
        <div class="hud-bar">
          <div class="hud-box">
            <span class="hud-label">Mạng (HP)</span>
            <div class="hp-bars">
              <span
                v-for="n in maxHp"
                :key="n"
                class="hp-segment"
                :class="{ active: n <= hp }"
              ></span>
            </div>
          </div>

          <div class="hud-box">
            <span class="hud-label">Đợt tấn công</span>
            <strong class="hud-val">Wave {{ currentWave }}</strong>
          </div>

          <div class="hud-box">
            <span class="hud-label">Thời gian</span>
            <strong class="hud-val">{{ survivalTime }}s</strong>
          </div>

          <div class="hud-box">
            <span class="hud-label">Đã né</span>
            <strong class="hud-val">{{ dodgedCount }}</strong>
          </div>

          <div class="hud-box highlight">
            <span class="hud-label">Điểm hiện tại</span>
            <strong class="hud-val score-color">{{ liveTotalPoints }}</strong>
          </div>
        </div>

        <!-- Khung Hộp Chiến Đấu Undertale -->
        <div class="canvas-container">
          <canvas
            ref="canvasRef"
            :width="BOX_SIZE"
            :height="BOX_SIZE"
            class="battle-canvas"
          ></canvas>

          <!-- Lớp phủ khi chưa bấm Bắt đầu -->
          <div v-if="gameState === 'idle'" class="canvas-overlay">
            <h3>Sẵn sàng bước vào Hộp Chiến Đấu?</h3>
            <p>Sử dụng phím <strong>W, A, S, D</strong> hoặc <strong>Phím Mũi Tên</strong> để di chuyển Trái tim.</p>
            <button class="start-big-btn" @click="startGame">Bắt đầu ván đấu</button>
          </div>
        </div>

        <!-- Cụm phím điều hướng ảo (Dành cho điện thoại hoặc dùng chuột) -->
        <div class="dpad-controls">
          <button
            class="dpad-btn"
            @mousedown="setDirectionHold('left', true)"
            @mouseup="setDirectionHold('left', false)"
            @mouseleave="setDirectionHold('left', false)"
            @touchstart.prevent="setDirectionHold('left', true)"
            @touchend.prevent="setDirectionHold('left', false)"
          >
            Trái
          </button>
          <button
            class="dpad-btn"
            @mousedown="setDirectionHold('up', true)"
            @mouseup="setDirectionHold('up', false)"
            @mouseleave="setDirectionHold('up', false)"
            @touchstart.prevent="setDirectionHold('up', true)"
            @touchend.prevent="setDirectionHold('up', false)"
          >
            Lên
          </button>
          <button
            class="dpad-btn"
            @mousedown="setDirectionHold('down', true)"
            @mouseup="setDirectionHold('down', false)"
            @mouseleave="setDirectionHold('down', false)"
            @touchstart.prevent="setDirectionHold('down', true)"
            @touchend.prevent="setDirectionHold('down', false)"
          >
            Xuống
          </button>
          <button
            class="dpad-btn"
            @mousedown="setDirectionHold('right', true)"
            @mouseup="setDirectionHold('right', false)"
            @mouseleave="setDirectionHold('right', false)"
            @touchstart.prevent="setDirectionHold('right', true)"
            @touchend.prevent="setDirectionHold('right', false)"
          >
            Phải
          </button>
        </div>
      </main>
    </div>

    <!-- MODAL 1: LUẬT CHƠI -->
    <div v-if="showHelpModal" class="modal-overlay" @click.self="closeHelpModal">
      <div class="modal-card glass">
        <h2>Luật Chơi MindGarden Soul Guard</h2>
        <p class="modal-intro">
          Điều khiển Trái tim màu đỏ bên trong chiếc hộp giới hạn và sinh tồn càng lâu càng tốt trước các đợt chướng ngại vật.
        </p>

        <ul class="rule-list">
          <li><strong>Di chuyển:</strong> Nhấn giữ các phím <strong>W, A, S, D</strong> hoặc <strong>Phím Mũi Tên</strong> để di chuyển theo 8 hướng.</li>
          <li><strong>Cơ chế Tính điểm:</strong>
            <ul>
              <li>Mỗi giây sống sót: <strong>+2 điểm</strong>.</li>
              <li>Mỗi viên đạn né thành công (bay ra khỏi hộp): <strong>+1 điểm</strong>.</li>
              <li>Chạm vào <strong>Hạt Năng Lượng Xanh Lá</strong>: <strong>+15 điểm</strong> và hồi <strong>+1 Mạng (HP)</strong>.</li>
            </ul>
          </li>
          <li><strong>Điều kiện Thắng & Hệ số nhân:</strong> Sống sót từ <strong>{{ WIN_SURVIVAL_SECONDS }} giây trở lên</strong> được tính là 1 trận Thắng để duy trì Chuỗi thắng. Tổng điểm sẽ được nhân với hệ số độ khó (Dễ <strong>x1.0</strong>, Trung bình <strong>x1.5</strong>, Khó <strong>x2.5</strong>).</li>
        </ul>

        <div class="modal-footer">
          <label class="checkbox-label">
            <input type="checkbox" v-model="dontShowRulesAgain" />
            <span>Không tự động hiển thị lại vào lần sau</span>
          </label>
          <button class="primary-btn" @click="closeHelpModal">Đã hiểu</button>
        </div>
      </div>
    </div>

    <!-- MODAL 2: KẾT QUẢ VÁN ĐẤU -->
    <div v-if="showResultModal" class="modal-overlay" @click.self="showResultModal = false">
      <div class="modal-card glass text-center">
        <h2>{{ survivalTime >= WIN_SURVIVAL_SECONDS ? 'Hoàn thành xuất sắc!' : 'Kết thúc ván đấu' }}</h2>
        <p v-if="survivalTime >= WIN_SURVIVAL_SECONDS">
          Bạn đã vượt qua mốc {{ WIN_SURVIVAL_SECONDS }} giây và ghi nhận 1 trận Thắng!
        </p>
        <p v-else>
          Hãy cố gắng trụ vững đủ {{ WIN_SURVIVAL_SECONDS }} giây ở lần thử tiếp theo để tính Chuỗi thắng nhé.
        </p>

        <div class="result-summary-box">
          <div class="summary-line">
            <span>Thời gian sinh tồn:</span>
            <strong>{{ survivalTime }} giây</strong>
          </div>
          <div class="summary-line">
            <span>Chướng ngại vật đã né:</span>
            <strong>{{ dodgedCount }} viên</strong>
          </div>
          <div class="summary-line">
            <span>Hạt năng lượng xanh thu thập:</span>
            <strong>{{ greenOrbsCollected }} hạt</strong>
          </div>
          <div class="summary-line total-line">
            <span>Tổng điểm cộng vào Game 3 (x{{ currentConfig.multiplier }}):</span>
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
.soulguard-scroll-wrapper {
  width: 100%;
  height: calc(100vh - 64px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 20px 36px;
  box-sizing: border-box;
  color: #f1f5f9;
}

.soulguard-layout {
  max-width: 1120px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 920px) {
  .soulguard-layout {
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

.orb-legend-list {
  background: rgba(15, 23, 42, 0.6);
  padding: 12px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.8rem;
  color: #cbd5e1;
}

.orb-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.orb-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.orb-dot.white { background: #f8fafc; }
.orb-dot.yellow { background: #eab308; }
.orb-dot.red { background: #ef4444; }
.orb-dot.green { background: #22c55e; }

/* Cột phải */
.right-panel {
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
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
  max-width: 520px;
  display: grid;
  grid-template-columns: 1.3fr repeat(4, 1fr);
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
  gap: 4px;
}

.hud-label {
  font-size: 0.7rem;
  color: #94a3b8;
  text-transform: uppercase;
}

.hud-val {
  font-size: 1rem;
  color: #f8fafc;
}

.score-color {
  color: #38bdf8;
}

.hp-bars {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

.hp-segment {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: #334155;
  border: 1px solid #475569;
}

.hp-segment.active {
  background: #ef4444;
  border-color: #f87171;
}

.canvas-container {
  position: relative;
  width: 420px;
  height: 420px;
  max-width: 100%;
}

.battle-canvas {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  display: block;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.canvas-overlay {
  position: absolute;
  inset: 6px;
  background: rgba(9, 13, 22, 0.88);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  gap: 12px;
}

.canvas-overlay h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #f8fafc;
}

.canvas-overlay p {
  margin: 0;
  font-size: 0.86rem;
  color: #94a3b8;
  max-width: 300px;
}

.start-big-btn {
  margin-top: 6px;
  padding: 11px 24px;
  border-radius: 8px;
  border: none;
  background: #ef4444;
  color: #ffffff;
  font-weight: 700;
  font-size: 0.92rem;
  cursor: pointer;
  transition: filter 0.15s;
}

.start-big-btn:hover {
  filter: brightness(1.1);
}

.dpad-controls {
  display: flex;
  gap: 8px;
}

.dpad-btn {
  min-width: 68px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(51, 65, 85, 0.6);
  color: #e2e8f0;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
  user-select: none;
}

.dpad-btn:active {
  background: #2563eb;
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

.modal-intro {
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