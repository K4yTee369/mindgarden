<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const router = useRouter();
const HIDE_RULES_STORAGE_KEY = 'mindgarden_rhythmpulse_hide_rules';

// Kích thước màn hình rộng Widescreen (16:10)
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 480;

const DIFFICULTIES = {
  easy: {
    key: 'easy',
    label: 'Dễ (Chill Beat)',
    circleRadius: 42,
    approachTime: 1350, // ms để vòng ngoài thu nhỏ khít vòng trong
    spawnInterval: 820, // ms sinh chấm mới
    totalTargets: 30,
    hpDrainOnMiss: 16,
    hpHealOnHit: 6,
    jumpMin: 100,
    jumpMax: 210,
    multiplier: 1.0,
    summary: '30 Chấm • x1.0 Điểm',
    desc: 'Chấm tròn lớn (42px), vòng thu nhỏ chậm (1.35s). Phù hợp làm quen cảm giác căn nhịp.'
  },
  medium: {
    key: 'medium',
    label: 'Trung bình (Normal)',
    circleRadius: 36,
    approachTime: 1020,
    spawnInterval: 580,
    totalTargets: 45,
    hpDrainOnMiss: 22,
    hpHealOnHit: 5,
    jumpMin: 120,
    jumpMax: 260,
    multiplier: 1.5,
    summary: '45 Chấm • x1.5 Điểm',
    desc: 'Chấm tròn vừa (36px), tốc độ thu vòng tiêu chuẩn (1.02s). Đòi hỏi phản xạ mắt và tay nhịp nhàng.'
  },
  hard: {
    key: 'hard',
    label: 'Khó (Insane)',
    circleRadius: 30,
    approachTime: 740,
    spawnInterval: 410,
    totalTargets: 60,
    hpDrainOnMiss: 28,
    hpHealOnHit: 4,
    jumpMin: 140,
    jumpMax: 310,
    multiplier: 2.5,
    summary: '60 Chấm • x2.5 Điểm',
    desc: 'Chấm tròn nhỏ (30px), vòng hội tụ cực nhanh (0.74s) và khoảng cách vẩy chuột rộng.'
  }
};

// Bảng màu theo từng cụm 1-2-3-4
const COMBO_PALETTES = [
  { fill: '#0284c7', border: '#e0f2fe', approach: '#38bdf8' }, // Xanh dương
  { fill: '#db2777', border: '#fce7f3', approach: '#f472b6' }, // Hồng
  { fill: '#059669', border: '#d1fae5', approach: '#34d399' }, // Xanh ngọc
  { fill: '#d97706', border: '#fef3c7', approach: '#fbbf24' }  // Vàng cam
];

const difficulty = ref('easy');
const gameState = ref('idle'); // 'idle' | 'playing' | 'gameover'
const canvasRef = ref(null);
const soundEnabled = ref(true);

// Thông số trong trận đấu
const hp = ref(100);
const rawScore = ref(0);
const finalEarnedPoints = ref(0);
const currentCombo = ref(0);
const maxCombo = ref(0);
const spawnedCount = ref(0);
const resolvedCount = ref(0);

// Thống kê độ chính xác (300 / 100 / 50 / Miss)
const count300 = ref(0);
const count100 = ref(0);
const count50 = ref(0);
const countMiss = ref(0);

// Bộ đếm phím bấm góc phải màn hình giống osu! (Z, X, M1)
const keyCounters = ref({
  zCount: 0,
  xCount: 0,
  m1Count: 0,
  zActive: false,
  xActive: false,
  m1Active: false
});

// Modal
const showHelpModal = ref(false);
const dontShowRulesAgain = ref(false);
const showResultModal = ref(false);
const isStageCleared = ref(false);

// Thống kê cá nhân đồng bộ Kho điểm chung (gameKey: 'game5')
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

const liveTotalPoints = computed(() => {
  return Math.round(rawScore.value * currentConfig.value.multiplier);
});

// Tính Độ chính xác (Accuracy %) theo công thức chuẩn của osu!
const accuracyPercent = computed(() => {
  const total = count300.value + count100.value + count50.value + countMiss.value;
  if (total === 0) return 100.0;
  const weighted =
    count300.value * 300 +
    count100.value * 100 +
    count50.value * 50;
  return Number(((weighted / (total * 300)) * 100).toFixed(2));
});

// Xếp hạng chữ cái (S, A, B, C, D)
const letterGrade = computed(() => {
  const acc = accuracyPercent.value;
  if (acc >= 93 && countMiss.value === 0) return 'S';
  if (acc >= 85) return 'A';
  if (acc >= 75) return 'B';
  if (acc >= 60) return 'C';
  return 'D';
});

// Biến phục vụ Game Loop & Canvas
let animationFrameId = null;
let lastSpawnTimestamp = 0;
let activeCircles = [];
let hitFeedbacks = []; // Hiệu ứng chữ 300, 100, 50, MISS bay lên
let hitRipples = [];   // Hiệu ứng vòng tròn lan tỏa khi bấm trúng
let cursorPos = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
let lastSpawnPos = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
let comboNumberCounter = 1;
let paletteIndex = 0;
let nextCircleId = 1;

// Web Audio API (Tạo âm thanh gõ nhịp không cần file ngoài)
let audioCtx = null;

const playHitSound = (type) => {
  if (!soundEnabled.value) return;
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const now = audioCtx.currentTime;

    if (type === 'miss') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.14);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      osc.type = 'triangle';
      const freq = type === '300' ? 660 : type === '100' ? 540 : 440;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.35, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    }
  } catch {
    // Bỏ qua nếu trình duyệt chặn tự phát âm thanh
  }
};

const getAuthConfig = () => {
  const token = localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : null;
};

const syncStatsFromProfile = (profile) => {
  if (!profile) return;
  const g5 = profile.games?.game5 || {};
  playerStats.value = {
    rank: profile.rank || null,
    gameScore: g5.score || 0,
    overallScore: profile.totalScore || 0,
    played: g5.played || 0,
    won: g5.won || 0,
    currentStreak: g5.currentStreak || 0,
    maxStreak: g5.maxStreak || 0
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
    console.error('Không thể tải thống kê Game 5:', error);
  }
};

const saveScoreToServer = async (isWin, points) => {
  try {
    const config = getAuthConfig() || {};
    const savedUser = JSON.parse(localStorage.getItem('user') || '{}');

    const { data } = await axios.post(
      'http://localhost:5000/api/games/score',
      {
        gameKey: 'game5',
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
    console.error('Lỗi lưu điểm Rhythm Pulse:', error);
  }
};

const selectDifficulty = (diffKey) => {
  difficulty.value = diffKey;
  if (gameState.value === 'playing') {
    startGame();
  } else {
    resetState();
    renderCanvas(performance.now());
  }
};

const resetState = () => {
  hp.value = 100;
  rawScore.value = 0;
  finalEarnedPoints.value = 0;
  currentCombo.value = 0;
  maxCombo.value = 0;
  spawnedCount.value = 0;
  resolvedCount.value = 0;

  count300.value = 0;
  count100.value = 0;
  count50.value = 0;
  countMiss.value = 0;

  keyCounters.value = {
    zCount: 0,
    xCount: 0,
    m1Count: 0,
    zActive: false,
    xActive: false,
    m1Active: false
  };

  activeCircles = [];
  hitFeedbacks = [];
  hitRipples = [];
  lastSpawnPos = { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 };
  comboNumberCounter = 1;
  paletteIndex = 0;
  nextCircleId = 1;
  isStageCleared.value = false;
};

// Thuật toán sinh chấm tròn Ngẫu nhiên có quy luật (Flow-based + Anti-overlap)
const spawnNextCircle = (now) => {
  const conf = currentConfig.value;
  const r = conf.circleRadius;

  // Vùng an toàn để không đè lên thanh HP / Điểm số ở mép trên và khung phím ở mép phải
  const minX = r + 55;
  const maxX = CANVAS_WIDTH - r - 75;
  const minY = r + 68;
  const maxY = CANVAS_HEIGHT - r - 45;

  let candidateX = CANVAS_WIDTH / 2;
  let candidateY = CANVAS_HEIGHT / 2;

  if (spawnedCount.value > 0) {
    let foundValid = false;
    for (let attempt = 0; attempt < 28; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = conf.jumpMin + Math.random() * (conf.jumpMax - conf.jumpMin);
      const tx = lastSpawnPos.x + Math.cos(angle) * dist;
      const ty = lastSpawnPos.y + Math.sin(angle) * dist;

      if (tx < minX || tx > maxX || ty < minY || ty > maxY) continue;

      // Kiểm tra chống đè lên các chấm tròn đang hiển thị trên màn hình
      const overlapping = activeCircles.some(
        (c) => Math.hypot(c.x - tx, c.y - ty) < r * 2.35
      );

      if (!overlapping) {
        candidateX = tx;
        candidateY = ty;
        foundValid = true;
        break;
      }
    }

    if (!foundValid) {
      candidateX = minX + Math.random() * (maxX - minX);
      candidateY = minY + Math.random() * (maxY - minY);
    }
  }

  lastSpawnPos = { x: candidateX, y: candidateY };

  // Đánh số nhịp 1 -> 2 -> 3 -> 4 rồi đổi màu cụm mới
  const displayNum = comboNumberCounter;
  const palette = COMBO_PALETTES[paletteIndex % COMBO_PALETTES.length];
  comboNumberCounter += 1;
  if (comboNumberCounter > 4) {
    comboNumberCounter = 1;
    paletteIndex += 1;
  }

  activeCircles.push({
    id: nextCircleId++,
    number: displayNum,
    x: candidateX,
    y: candidateY,
    radius: r,
    spawnTime: now,
    hitTime: now + conf.approachTime,
    palette
  });

  spawnedCount.value += 1;
};

const addJudgmentFeedback = (x, y, text, color) => {
  hitFeedbacks.push({
    x,
    y,
    text,
    color,
    alpha: 1.0,
    vy: -42
  });
};

const applyMissPenalty = (circle) => {
  countMiss.value += 1;
  currentCombo.value = 0;
  resolvedCount.value += 1;
  hp.value = Math.max(0, hp.value - currentConfig.value.hpDrainOnMiss);
  playHitSound('miss');
  addJudgmentFeedback(circle.x, circle.y, 'MISS ✕', '#ef4444');

  if (hp.value <= 0) {
    isStageCleared.value = false;
    handleGameOver();
  }
};

// Xử lý khi người chơi Click chuột hoặc nhấn phím Z / X tại tọa độ con trỏ
const triggerHitAtCursor = (x, y) => {
  if (gameState.value !== 'playing') return;
  const now = performance.now();

  // Tìm chấm tròn xuất hiện sớm nhất mà con trỏ chuột đang trỏ vào
  let targetIndex = -1;
  for (let i = 0; i < activeCircles.length; i++) {
    const c = activeCircles[i];
    const dist = Math.hypot(x - c.x, y - c.y);
    if (dist <= c.radius * 1.12) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex === -1) return;

  const target = activeCircles[targetIndex];
  const timeError = Math.abs(now - target.hitTime);

  let judgment = '50';
  let basePts = 5;
  let badgeColor = '#facc15';

  if (timeError <= 95) {
    judgment = '300';
    basePts = 20;
    badgeColor = '#38bdf8';
    count300.value += 1;
  } else if (timeError <= 210) {
    judgment = '100';
    basePts = 12;
    badgeColor = '#4ade80';
    count100.value += 1;
  } else if (timeError <= 360) {
    judgment = '50';
    basePts = 6;
    badgeColor = '#facc15';
    count50.value += 1;
  } else {
    // Bấm quá sớm khi vòng ngoài vừa mới hiện -> Tính là Miss
    activeCircles.splice(targetIndex, 1);
    applyMissPenalty(target);
    checkIfStageFinished();
    return;
  }

  // Bấm trúng thành công
  currentCombo.value += 1;
  if (currentCombo.value > maxCombo.value) {
    maxCombo.value = currentCombo.value;
  }

  // Điểm thưởng tăng theo chuỗi Combo
  const comboBonus = Math.min(25, Math.floor(currentCombo.value / 4) * 3);
  rawScore.value += basePts + comboBonus;
  hp.value = Math.min(100, hp.value + currentConfig.value.hpHealOnHit);
  resolvedCount.value += 1;

  playHitSound(judgment);
  addJudgmentFeedback(target.x, target.y, judgment, badgeColor);

  hitRipples.push({
    x: target.x,
    y: target.y,
    radius: target.radius,
    color: badgeColor,
    alpha: 0.85
  });

  activeCircles.splice(targetIndex, 1);
  checkIfStageFinished();
};

const checkIfStageFinished = () => {
  const conf = currentConfig.value;
  if (resolvedCount.value >= conf.totalTargets && activeCircles.length === 0 && hp.value > 0) {
    isStageCleared.value = true;
    handleGameOver();
  }
};

const startGame = () => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  stopGameLoop();
  resetState();
  showResultModal.value = false;
  gameState.value = 'playing';

  const now = performance.now();
  lastSpawnTimestamp = now;
  spawnNextCircle(now);
  animationFrameId = requestAnimationFrame(gameLoop);
};

const stopGameLoop = () => {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
};

const updateGame = (now, dt) => {
  const conf = currentConfig.value;

  // 1. Sinh chấm tròn mới theo nhịp
  if (
    spawnedCount.value < conf.totalTargets &&
    now - lastSpawnTimestamp >= conf.spawnInterval
  ) {
    lastSpawnTimestamp = now;
    spawnNextCircle(now);
  }

  // 2. Kiểm tra các chấm tròn đã quá hạn thời gian mà người chơi không kịp bấm (Miss)
  const lateGraceMs = 185;
  for (let i = activeCircles.length - 1; i >= 0; i--) {
    const c = activeCircles[i];
    if (now > c.hitTime + lateGraceMs) {
      activeCircles.splice(i, 1);
      applyMissPenalty(c);
      if (gameState.value !== 'playing') return;
    }
  }

  // 3. Cập nhật hiệu ứng vòng lan tỏa & chữ 300/100/50
  for (let i = hitRipples.length - 1; i >= 0; i--) {
    const rp = hitRipples[i];
    rp.radius += 110 * dt;
    rp.alpha -= 2.4 * dt;
    if (rp.alpha <= 0) hitRipples.splice(i, 1);
  }

  for (let i = hitFeedbacks.length - 1; i >= 0; i--) {
    const fb = hitFeedbacks[i];
    fb.y += fb.vy * dt;
    fb.alpha -= 1.65 * dt;
    if (fb.alpha <= 0) hitFeedbacks.splice(i, 1);
  }

  checkIfStageFinished();
};

// Vẽ toàn bộ khung hình Widescreen giống osu!
const renderCanvas = (now) => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const conf = currentConfig.value;

  // 1. Nền đen sâu đặc trưng của osu!
  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Lưới mờ tinh tế
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  for (let x = 80; x < CANVAS_WIDTH; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 80; y < CANVAS_HEIGHT; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  // 2. Vẽ Đường kẻ dẫn hướng (Follow Lines) nối giữa các chấm tròn đang mở
  if (activeCircles.length > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    for (let i = 0; i < activeCircles.length - 1; i++) {
      const c1 = activeCircles[i];
      const c2 = activeCircles[i + 1];
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Vẽ các hiệu ứng sóng lan tỏa khi vừa bấm trúng
  for (const rp of hitRipples) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, rp.alpha);
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, rp.radius, 0, Math.PI * 2);
    ctx.strokeStyle = rp.color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  // 4. Vẽ các Chấm Tròn (Vẽ ngược từ cuối mảng để chấm cần bấm trước luôn nằm trên cùng)
  for (let i = activeCircles.length - 1; i >= 0; i--) {
    const c = activeCircles[i];
    const progress = (now - c.spawnTime) / conf.approachTime;
    const clampedProgress = Math.max(0, Math.min(1.2, progress));

    // Bán kính vòng tròn thu nhỏ bên ngoài (Approach Circle): Từ 3R thu về 1R
    const approachRadius = c.radius * (1 + 2 * Math.max(0, 1 - clampedProgress));

    ctx.save();

    // Đổ bóng phát sáng nhẹ
    ctx.shadowColor = c.palette.approach;
    ctx.shadowBlur = 14;

    // Vòng tròn nhân bên trong (Hit Circle)
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
    ctx.fillStyle = c.palette.fill;
    ctx.fill();

    // Viền trắng dày của Hit Circle
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = c.palette.border;
    ctx.stroke();

    // Vòng bóng kính nhẹ bên trong
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius * 0.82, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Con số thứ tự ở tâm (1, 2, 3, 4)
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${Math.round(c.radius * 0.72)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(c.number), c.x, c.y + 1);

    // Vòng tròn thu nhỏ bên ngoài (Approach Circle)
    ctx.beginPath();
    ctx.arc(c.x, c.y, approachRadius, 0, Math.PI * 2);
    ctx.strokeStyle = i === 0 ? '#ffffff' : c.palette.approach;
    ctx.lineWidth = i === 0 ? 3.2 : 2.2;
    ctx.stroke();

    ctx.restore();
  }

  // 5. Vẽ chữ đánh giá (300, 100, 50, MISS)
  for (const fb of hitFeedbacks) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, fb.alpha);
    ctx.font = '800 20px sans-serif';
    ctx.fillStyle = fb.color;
    ctx.textAlign = 'center';
    ctx.fillText(fb.text, fb.x, fb.y);
    ctx.restore();
  }

  // 6. VẼ HUD TRỰC TIẾP TRÊN MÀN HÌNH GIỐNG OSU!
  // 6a. Thanh máu HP góc trên bên trái
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 2;
  ctx.fillRect(20, 18, 250, 14);
  ctx.strokeRect(20, 18, 250, 14);

  const hpWidth = Math.max(0, (hp.value / 100) * 246);
  const hpGrad = ctx.createLinearGradient(22, 0, 268, 0);
  if (hp.value > 35) {
    hpGrad.addColorStop(0, '#38bdf8');
    hpGrad.addColorStop(1, '#818cf8');
  } else {
    hpGrad.addColorStop(0, '#ef4444');
    hpGrad.addColorStop(1, '#f97316');
  }
  ctx.fillStyle = hpGrad;
  ctx.fillRect(22, 20, hpWidth, 10);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '700 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`HP ${Math.round(hp.value)}%  •  TIẾN ĐỘ: ${resolvedCount.value}/${conf.totalTargets}`, 20, 48);

  // 6b. Điểm số & Độ chính xác (%) góc trên bên phải
  const formattedScore = String(liveTotalPoints.value).padStart(7, '0');
  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 26px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(formattedScore, CANVAS_WIDTH - 22, 34);

  ctx.fillStyle = '#93c5fd';
  ctx.font = '700 15px monospace';
  ctx.fillText(`${accuracyPercent.value.toFixed(2)}%`, CANVAS_WIDTH - 22, 56);

  // 6c. Chuỗi Combo góc dưới bên trái
  if (currentCombo.value > 0) {
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 34px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${currentCombo.value}x`, 22, CANVAS_HEIGHT - 20);
  }

  // 6d. Bảng đếm phím bấm (Z, X, M1) ở mép phải giống osu!
  const keyBoxes = [
    { label: 'Z', count: keyCounters.value.zCount, active: keyCounters.value.zActive, y: CANVAS_HEIGHT / 2 - 48 },
    { label: 'X', count: keyCounters.value.xCount, active: keyCounters.value.xActive, y: CANVAS_HEIGHT / 2 },
    { label: 'M1', count: keyCounters.value.m1Count, active: keyCounters.value.m1Active, y: CANVAS_HEIGHT / 2 + 48 }
  ];

  for (const kb of keyBoxes) {
    ctx.fillStyle = kb.active ? 'rgba(56, 189, 248, 0.35)' : 'rgba(15, 23, 42, 0.78)';
    ctx.strokeStyle = kb.active ? '#38bdf8' : 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 1.5;
    ctx.fillRect(CANVAS_WIDTH - 52, kb.y - 18, 42, 36);
    ctx.strokeRect(CANVAS_WIDTH - 52, kb.y - 18, 42, 36);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(kb.label, CANVAS_WIDTH - 31, kb.y - 4);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '700 11px monospace';
    ctx.fillText(String(kb.count), CANVAS_WIDTH - 31, kb.y + 11);
  }

  // 7. Vẽ tâm ngắm con trỏ (Custom osu! Cursor)
  if (gameState.value === 'playing') {
    ctx.beginPath();
    ctx.arc(cursorPos.x, cursorPos.y, 9, 0, Math.PI * 2);
    ctx.fillStyle = '#fde047';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  ctx.restore();
};

let prevFrameTimestamp = 0;
const gameLoop = (timestamp) => {
  if (gameState.value !== 'playing') return;

  const dt = prevFrameTimestamp ? Math.min(0.05, (timestamp - prevFrameTimestamp) / 1000) : 0.016;
  prevFrameTimestamp = timestamp;

  updateGame(timestamp, dt);
  renderCanvas(timestamp);

  if (gameState.value === 'playing') {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
};

// Kết thúc ván đấu & Lưu điểm vào ô Game 5
const handleGameOver = async () => {
  gameState.value = 'gameover';
  stopGameLoop();

  // Thắng nếu hoàn thành màn chơi hoặc đạt tối thiểu 60% số mục tiêu với độ chính xác >= 65%
  const isWin =
    isStageCleared.value ||
    (resolvedCount.value >= currentConfig.value.totalTargets * 0.6 && accuracyPercent.value >= 65);

  finalEarnedPoints.value = Math.max(5, liveTotalPoints.value);
  await saveScoreToServer(isWin, finalEarnedPoints.value);
  showResultModal.value = true;
};

// Cập nhật tọa độ chuột chính xác theo tỷ lệ co giãn của Canvas
const updateCursorFromMouseEvent = (e) => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  cursorPos.x = (e.clientX - rect.left) * scaleX;
  cursorPos.y = (e.clientY - rect.top) * scaleY;
};

const handleCanvasMouseMove = (e) => {
  updateCursorFromMouseEvent(e);
};

const handleCanvasMouseDown = (e) => {
  if (gameState.value !== 'playing') return;
  updateCursorFromMouseEvent(e);
  keyCounters.value.m1Count += 1;
  keyCounters.value.m1Active = true;
  triggerHitAtCursor(cursorPos.x, cursorPos.y);
};

const handleCanvasMouseUp = () => {
  keyCounters.value.m1Active = false;
};

// Hỗ trợ phím Z / X / Space chuẩn osu!
const handleKeyDown = (e) => {
  if (showHelpModal.value) return;
  const key = e.key.toLowerCase();

  if (key === 'z' || key === 'x' || e.code === 'Space') {
    if (gameState.value === 'playing') {
      e.preventDefault();
      if (e.repeat) return; // Chống giữ chết phím

      if (key === 'z') {
        keyCounters.value.zCount += 1;
        keyCounters.value.zActive = true;
      } else if (key === 'x' || e.code === 'Space') {
        keyCounters.value.xCount += 1;
        keyCounters.value.xActive = true;
      }

      triggerHitAtCursor(cursorPos.x, cursorPos.y);
    }
  }
};

const handleKeyUp = (e) => {
  const key = e.key.toLowerCase();
  if (key === 'z') keyCounters.value.zActive = false;
  if (key === 'x' || e.code === 'Space') keyCounters.value.xActive = false;
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
  window.addEventListener('mouseup', handleCanvasMouseUp);

  const hideRules = localStorage.getItem(HIDE_RULES_STORAGE_KEY) === 'true';
  if (!hideRules) {
    showHelpModal.value = true;
  }

  fetchMyStats();
  resetState();
  renderCanvas(performance.now());
});

onUnmounted(() => {
  stopGameLoop();
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('mouseup', handleCanvasMouseUp);
});
</script>

<template>
  <div class="rhythm-scroll-wrapper">
    <div class="rhythm-widescreen-layout">
      <!-- CỘT TRÁI: THỐNG KÊ, ĐỘ KHÓ & CHÚ THÍCH NHỊP -->
      <aside class="left-panel glass">
        <div class="title-group">
          <h1>MindGarden Rhythm Pulse</h1>
          <p class="subtitle">Căn chuẩn thời điểm vòng tròn hội tụ theo phong cách osu!</p>
        </div>

        <!-- Khung Thống kê Cá nhân (Game 5) -->
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">Hạng chung</span>
            <strong class="stat-value">{{ playerStats.rank ? `#${playerStats.rank}` : '--' }}</strong>
          </div>
          <div class="stat-item">
            <span class="stat-label">Điểm Game 5</span>
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
          <button class="text-btn" @click="soundEnabled = !soundEnabled">
            {{ soundEnabled ? 'Âm thanh: Bật' : 'Âm thanh: Tắt' }}
          </button>
        </div>

        <!-- Chọn độ khó -->
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">Chọn độ khó</span>
            <span class="section-note">Sử dụng Chuột trái hoặc di chuột kết hợp phím Z / X</span>
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

        <!-- Bảng thống kê nhịp 300 / 100 / 50 / Miss trực tiếp -->
        <div class="section-block">
          <span class="section-title">Thống kê độ chính xác</span>
          <div class="judgment-grid">
            <div class="judg-box blue">
              <span class="judg-num">300</span>
              <strong>{{ count300 }}</strong>
            </div>
            <div class="judg-box green">
              <span class="judg-num">100</span>
              <strong>{{ count100 }}</strong>
            </div>
            <div class="judg-box yellow">
              <span class="judg-num">50</span>
              <strong>{{ count50 }}</strong>
            </div>
            <div class="judg-box red">
              <span class="judg-num">MISS</span>
              <strong>{{ countMiss }}</strong>
            </div>
          </div>
        </div>
      </aside>

      <!-- CỘT PHẢI: MÀN HÌNH CHƠI RỘNG WIDESCREEN (800 x 480) -->
      <main class="right-panel glass">
        <div class="widescreen-header">
          <div class="header-stat">
            <span>Hạng hiện tại:</span>
            <strong class="grade-badge">{{ letterGrade }}</strong>
          </div>
          <div class="header-stat">
            <span>Combo tối đa:</span>
            <strong>{{ maxCombo }}x</strong>
          </div>
          <div class="header-stat">
            <span>Cách điều khiển:</span>
            <strong>Click Chuột Trái hoặc Phím Z / X</strong>
          </div>
          <button class="restart-top-btn" @click="startGame">
            {{ gameState === 'playing' ? 'Chơi lại từ đầu' : 'Bắt đầu mới' }}
          </button>
        </div>

        <!-- Khung Canvas Rộng 800x480 -->
        <div class="widescreen-canvas-wrap">
          <canvas
            ref="canvasRef"
            :width="CANVAS_WIDTH"
            :height="CANVAS_HEIGHT"
            class="osu-canvas"
            @mousemove="handleCanvasMouseMove"
            @mousedown="handleCanvasMouseDown"
          ></canvas>

          <!-- Lớp phủ khi chưa bắt đầu -->
          <div v-if="gameState === 'idle'" class="canvas-overlay">
            <h3>Sẵn sàng bắt nhịp Rhythm Pulse?</h3>
            <p>
              Di chuyển con trỏ vào các chấm tròn theo thứ tự <strong>1 ➔ 2 ➔ 3 ➔ 4</strong> và bấm đúng lúc vòng tròn bên ngoài thu nhỏ chạm khít viền trắng!
            </p>
            <button class="start-big-btn" @click="startGame">Bắt đầu màn chơi</button>
          </div>
        </div>
      </main>
    </div>

    <!-- MODAL 1: LUẬT CHƠI -->
    <div v-if="showHelpModal" class="modal-overlay" @click.self="closeHelpModal">
      <div class="modal-card glass">
        <h2>Luật Chơi MindGarden Rhythm Pulse (osu!)</h2>
        <p class="modal-intro">
          Thử thách khả năng phối hợp Tay - Mắt và cảm nhận nhịp điệu trên màn hình rộng.
        </p>

        <ul class="rule-list">
          <li>
            <strong>Cách bấm (2 cách):</strong> Bạn có thể <strong>Click chuột trái</strong> trực tiếp vào chấm tròn, hoặc dùng chuột di chuyển tâm ngắm rồi gõ phím <strong>Z</strong> / <strong>X</strong> trên bàn phím giống game thủ osu!.
          </li>
          <li>
            <strong>Căn chuẩn vòng hội tụ:</strong> Mỗi chấm tròn có một vòng mảnh bên ngoài thu nhỏ dần. Hãy bấm đúng khoảnh khắc vòng ngoài <strong>chạm khít vào viền trắng</strong> của chấm tròn trong để đạt điểm tuyệt đối (<strong>300</strong>).
          </li>
          <li>
            <strong>Thứ tự & Đường dẫn:</strong> Đi theo các đường kẻ nét đứt và thứ tự số <strong>1 ➔ 2 ➔ 3 ➔ 4</strong>. Giữ chuỗi Combo càng cao, điểm thưởng cộng thêm mỗi nhịp càng lớn!
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

    <!-- MODAL 2: KẾT QUẢ MÀN CHƠI -->
    <div v-if="showResultModal" class="modal-overlay" @click.self="showResultModal = false">
      <div class="modal-card glass text-center">
        <h2>{{ isStageCleared ? 'Hoàn thành màn chơi!' : 'Đã cạn thanh năng lượng (HP)' }}</h2>
        <div class="final-grade-circle">{{ letterGrade }}</div>

        <div class="result-summary-box">
          <div class="summary-line">
            <span>Độ chính xác (Accuracy):</span>
            <strong>{{ accuracyPercent.toFixed(2) }}%</strong>
          </div>
          <div class="summary-line">
            <span>Chuỗi Combo cao nhất:</span>
            <strong>{{ maxCombo }}x</strong>
          </div>
          <div class="summary-line">
            <span>Chi tiết nhịp (300 / 100 / 50 / Miss):</span>
            <strong>{{ count300 }} / {{ count100 }} / {{ count50 }} / {{ countMiss }}</strong>
          </div>
          <div class="summary-line total-line">
            <span>Tổng điểm cộng vào Game 5 (x{{ currentConfig.multiplier }}):</span>
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
.rhythm-scroll-wrapper {
  width: 100%;
  height: calc(100vh - 64px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 14px 20px 36px;
  box-sizing: border-box;
  color: #f1f5f9;
}

/* Bố cục ưu tiên chiều rộng lớn cho màn hình chơi osu! */
.rhythm-widescreen-layout {
  max-width: 1260px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 330px 1fr;
  gap: 18px;
  align-items: start;
}

@media (max-width: 1080px) {
  .rhythm-widescreen-layout {
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
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.title-group h1 {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 700;
  color: #f8fafc;
}

.subtitle {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: #94a3b8;
}

.stats-bar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: rgba(15, 23, 42, 0.65);
  padding: 10px 8px;
  border-radius: 10px;
  gap: 6px;
  text-align: center;
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 0.68rem;
  color: #94a3b8;
  text-transform: uppercase;
}

.stat-value {
  font-size: 1rem;
  color: #60a5fa;
}

.action-group {
  display: flex;
  gap: 6px;
}

.text-btn {
  flex: 1;
  padding: 8px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(51, 65, 85, 0.5);
  color: #e2e8f0;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.text-btn:hover {
  background: rgba(71, 85, 105, 0.8);
}

.section-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-header {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-title {
  font-size: 0.86rem;
  font-weight: 700;
  color: #cbd5e1;
}

.section-note {
  font-size: 0.75rem;
  color: #38bdf8;
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
  font-size: 0.86rem;
}

.diff-summary {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.25);
  color: #93c5fd;
}

.diff-desc {
  margin: 0;
  font-size: 0.74rem;
  color: #94a3b8;
  line-height: 1.35;
}

.judgment-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.judg-box {
  background: rgba(15, 23, 42, 0.65);
  border-radius: 8px;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.judg-num {
  font-size: 0.72rem;
  font-weight: 800;
}

.judg-box.blue .judg-num { color: #38bdf8; }
.judg-box.green .judg-num { color: #4ade80; }
.judg-box.yellow .judg-num { color: #facc15; }
.judg-box.red .judg-num { color: #ef4444; }

/* Cột phải Widescreen */
.right-panel {
  padding: 16px 20px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.widescreen-header {
  width: 100%;
  max-width: 800px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  background: rgba(15, 23, 42, 0.7);
  padding: 8px 14px;
  border-radius: 10px;
}

.header-stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  color: #cbd5e1;
}

.grade-badge {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.9rem;
}

.restart-top-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  background: #2563eb;
  color: #ffffff;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.widescreen-canvas-wrap {
  position: relative;
  width: 100%;
  max-width: 800px;
  aspect-ratio: 800 / 480;
  border-radius: 12px;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.6);
}

.osu-canvas {
  width: 100%;
  height: 100%;
  display: block;
  cursor: crosshair;
  user-select: none;
}

.canvas-overlay {
  position: absolute;
  inset: 0;
  background: rgba(5, 8, 17, 0.88);
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
  font-size: 1.35rem;
  color: #f8fafc;
}

.canvas-overlay p {
  margin: 0;
  font-size: 0.9rem;
  color: #94a3b8;
  max-width: 440px;
  line-height: 1.5;
}

.start-big-btn {
  margin-top: 8px;
  padding: 12px 28px;
  border-radius: 999px;
  border: none;
  background: #ec4899;
  color: #ffffff;
  font-weight: 800;
  font-size: 0.95rem;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(236, 72, 153, 0.4);
  transition: transform 0.15s;
}

.start-big-btn:hover {
  transform: scale(1.04);
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

.final-grade-circle {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  margin: 10px auto 4px;
  background: rgba(56, 189, 248, 0.18);
  border: 2px solid #38bdf8;
  color: #38bdf8;
  font-size: 2rem;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
}

.result-summary-box {
  background: rgba(15, 23, 42, 0.8);
  padding: 16px;
  border-radius: 10px;
  margin: 14px 0;
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