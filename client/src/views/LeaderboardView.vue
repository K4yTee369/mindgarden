<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

// Cấu hình danh sách 5 Game (Đổi tên khi bạn phát triển thêm game mới)
const GAMES_CONFIG = [
  { key: 'wordle', name: 'Game 1: Wordle', shortName: 'Wordle' },
  { key: 'game2', name: 'Game 2: Songless', shortName: 'Songless' },
  { key: 'game3', name: 'Game 3', shortName: 'Game 3' },
  { key: 'game4', name: 'Game 4', shortName: 'Game 4' },
  { key: 'game5', name: 'Game 5', shortName: 'Game 5' }
];

const selectedFilter = ref('total'); // 'total' hoặc mã game
const leaderboard = ref([]);
const isLoading = ref(false);

const myProfile = ref({
  userId: null,
  fullName: '',
  totalScore: 0,
  totalPlayed: 0,
  totalWon: 0,
  rank: null,
  games: {
    wordle: { score: 0, played: 0, won: 0, currentStreak: 0, maxStreak: 0 },
    game2: { score: 0, played: 0, won: 0, currentStreak: 0, maxStreak: 0 },
    game3: { score: 0, played: 0, won: 0, currentStreak: 0, maxStreak: 0 },
    game4: { score: 0, played: 0, won: 0, currentStreak: 0, maxStreak: 0 },
    game5: { score: 0, played: 0, won: 0, currentStreak: 0, maxStreak: 0 }
  }
});

// Người chơi đang được chọn để xem chi tiết kho điểm
const inspectedPlayer = ref(null);

const getAuthConfig = () => {
  const token = localStorage.getItem('token');
  return token ? { headers: { Authorization: `Bearer ${token}` } } : null;
};

const fetchMyProfile = async () => {
  const config = getAuthConfig();
  if (!config) return;
  try {
    const { data } = await axios.get('http://localhost:5000/api/games/my-stats', config);
    if (data.success && data.profile) {
      myProfile.value = data.profile;
    }
  } catch (error) {
    console.error("Lỗi tải kho điểm cá nhân:", error);
  }
};

const fetchLeaderboard = async (filterKey = selectedFilter.value) => {
  selectedFilter.value = filterKey;
  isLoading.value = true;
  try {
    const { data } = await axios.get(`http://localhost:5000/api/games/leaderboard?game=${filterKey}`);
    if (data.success) {
      leaderboard.value = data.leaderboard;
    }
  } catch (error) {
    console.error("Lỗi tải bảng xếp hạng:", error);
  } finally {
    isLoading.value = false;
  }
};

const openPlayerDetail = (player) => {
  inspectedPlayer.value = player;
};

const calcWinRate = (won, played) => {
  if (!played || played === 0) return 0;
  return Math.round((won / played) * 100);
};

onMounted(() => {
  fetchMyProfile();
  fetchLeaderboard('total');
});
</script>

<template>
  <div class="leaderboard-page">
    <div class="leaderboard-container">
      <!-- TIÊU ĐỀ TRANG -->
      <header class="page-header glass">
        <div>
          <h1>Bảng Xếp Hạng Tổng Hợp</h1>
          <p class="subtitle">
            Điểm số từ 5 trò chơi được lưu riêng biệt trong kho điểm và cộng dồn thành Tổng điểm xếp hạng.
          </p>
        </div>
        <!-- <router-link to="/wordle" class="back-game-btn">Chơi Wordle</router-link> -->
      </header>

      <!-- KHO ĐIỂM CỦA BẢN THÂN -->
      <section class="my-vault-section glass">
        <div class="vault-header">
          <div>
            <h2>Kho Điểm Của Bạn</h2>
            <p class="vault-note">Chi tiết điểm tích lũy của bạn ở từng trò chơi</p>
          </div>
          <div class="vault-summary-badges">
            <div class="summary-box">
              <span class="label">Thứ hạng chung</span>
              <strong class="value">{{ myProfile.rank ? `#${myProfile.rank}` : 'Chưa xếp hạng' }}</strong>
            </div>
            <div class="summary-box highlight">
              <span class="label">Tổng điểm 5 Game</span>
              <strong class="value">{{ myProfile.totalScore }} điểm</strong>
            </div>
          </div>
        </div>

        <div class="games-vault-grid">
          <div
            v-for="g in GAMES_CONFIG"
            :key="g.key"
            class="game-score-card"
          >
            <div class="card-top">
              <span class="game-title">{{ g.name }}</span>
              <span class="game-matches">{{ myProfile.games?.[g.key]?.played || 0 }} ván</span>
            </div>
            <div class="game-points">
              {{ myProfile.games?.[g.key]?.score || 0 }} <span>điểm</span>
            </div>
            <div class="game-meta">
              <span>Thắng: {{ myProfile.games?.[g.key]?.won || 0 }}</span>
              <span>Chuỗi kỷ lục: {{ myProfile.games?.[g.key]?.maxStreak || 0 }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- BẢNG XẾP HẠNG NGƯỜI CHƠI -->
      <section class="ranking-section glass">
        <div class="ranking-toolbar">
          <div class="filter-tabs">
            <button
              class="filter-btn"
              :class="{ active: selectedFilter === 'total' }"
              @click="fetchLeaderboard('total')"
            >
              Tổng điểm 5 Game
            </button>
            <button
              v-for="g in GAMES_CONFIG"
              :key="g.key"
              class="filter-btn"
              :class="{ active: selectedFilter === g.key }"
              @click="fetchLeaderboard(g.key)"
            >
              {{ g.shortName }}
            </button>
          </div>
          <span class="click-hint">Nhấn vào một người chơi bất kỳ để xem chi tiết kho điểm</span>
        </div>

        <div class="table-responsive">
          <div v-if="isLoading" class="empty-state">Đang tải bảng xếp hạng...</div>

          <table v-else-if="leaderboard.length > 0" class="ranking-table">
            <thead>
              <tr>
                <th>Hạng</th>
                <th>Người chơi</th>
                <th v-for="g in GAMES_CONFIG" :key="g.key" class="text-center">
                  {{ g.shortName }}
                </th>
                <th class="text-right">Tổng điểm</th>
                <th class="text-center">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="player in leaderboard"
                :key="player.userId"
                class="player-row"
                :class="{ 'current-user-row': myProfile.userId && String(player.userId) === String(myProfile.userId) }"
                @click="openPlayerDetail(player)"
              >
                <td>
                  <span
                    class="rank-chip"
                    :class="{
                      'top-1': player.rank === 1,
                      'top-2': player.rank === 2,
                      'top-3': player.rank === 3
                    }"
                  >
                    #{{ player.rank }}
                  </span>
                </td>
                <td>
                  <div class="player-name-cell">
                    <span class="name-text">{{ player.fullName }}</span>
                    <span
                      v-if="myProfile.userId && String(player.userId) === String(myProfile.userId)"
                      class="me-badge"
                    >
                      Bạn
                    </span>
                  </div>
                </td>
                <td
                  v-for="g in GAMES_CONFIG"
                  :key="g.key"
                  class="text-center game-col-score"
                  :class="{ 'active-sort-col': selectedFilter === g.key }"
                >
                  {{ player.games?.[g.key]?.score || 0 }}
                </td>
                <td class="text-right total-col-score">
                  {{ player.totalScore }}
                </td>
                <td class="text-center">
                  <button class="inspect-btn" @click.stop="openPlayerDetail(player)">
                    Xem kho điểm
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-else class="empty-state">
            Chưa có người chơi nào ghi điểm trên hệ thống.
          </div>
        </div>
      </section>
    </div>

    <!-- MODAL XEM CHI TIẾT KHO ĐIỂM CỦA MỘT NGƯỜI CHƠI -->
    <div v-if="inspectedPlayer" class="modal-overlay" @click.self="inspectedPlayer = null">
      <div class="modal-card glass">
        <div class="modal-header">
          <div>
            <h2>Kho Điểm Người Chơi: {{ inspectedPlayer.fullName }}</h2>
            <p class="modal-sub">
              Hạng hiện tại: <strong>#{{ inspectedPlayer.rank }}</strong> •
              Tổng số trận đã chơi: <strong>{{ inspectedPlayer.totalPlayed }}</strong>
            </p>
          </div>
          <button class="close-btn" @click="inspectedPlayer = null">Đóng</button>
        </div>

        <div class="detail-list">
          <div
            v-for="g in GAMES_CONFIG"
            :key="g.key"
            class="detail-row"
          >
            <div class="detail-game-info">
              <strong>{{ g.name }}</strong>
              <span>
                Thắng {{ inspectedPlayer.games?.[g.key]?.won || 0 }} / {{ inspectedPlayer.games?.[g.key]?.played || 0 }} ván
                ({{ calcWinRate(inspectedPlayer.games?.[g.key]?.won, inspectedPlayer.games?.[g.key]?.played) }}%)
                • Chuỗi thắng kỷ lục: {{ inspectedPlayer.games?.[g.key]?.maxStreak || 0 }}
              </span>
            </div>
            <div class="detail-game-score">
              {{ inspectedPlayer.games?.[g.key]?.score || 0 }} điểm
            </div>
          </div>
        </div>

        <div class="detail-total-footer">
          <span>Tổng điểm 5 Game cộng lại:</span>
          <strong>{{ inspectedPlayer.totalScore }} điểm</strong>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.leaderboard-page {
  width: 100%;
  height: calc(100vh - 64px);
  overflow-y: auto;
  padding: 20px 20px 48px;
  box-sizing: border-box;
  color: #f1f5f9;
}

.leaderboard-container {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.glass {
  background: rgba(30, 41, 59, 0.78);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}

.page-header {
  padding: 20px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.page-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: #f8fafc;
}

.subtitle {
  margin: 4px 0 0;
  font-size: 0.88rem;
  color: #94a3b8;
}

.back-game-btn {
  padding: 9px 16px;
  border-radius: 8px;
  background: #2563eb;
  color: #ffffff;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.86rem;
}

.back-game-btn:hover {
  background: #1d4ed8;
}

/* Kho điểm cá nhân */
.my-vault-section {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.vault-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.vault-header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.vault-note {
  margin: 2px 0 0;
  font-size: 0.82rem;
  color: #94a3b8;
}

.vault-summary-badges {
  display: flex;
  gap: 12px;
}

.summary-box {
  background: rgba(15, 23, 42, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 16px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.summary-box.highlight {
  background: rgba(37, 99, 235, 0.18);
  border-color: rgba(59, 130, 246, 0.4);
}

.summary-box .label {
  font-size: 0.72rem;
  color: #94a3b8;
  text-transform: uppercase;
}

.summary-box .value {
  font-size: 1.1rem;
  color: #60a5fa;
}

.games-vault-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
}

@media (max-width: 960px) {
  .games-vault-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.game-score-card {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.game-title {
  font-weight: 700;
  font-size: 0.86rem;
  color: #e2e8f0;
}

.game-matches {
  font-size: 0.74rem;
  color: #94a3b8;
}

.game-points {
  font-size: 1.4rem;
  font-weight: 800;
  color: #38bdf8;
}

.game-points span {
  font-size: 0.8rem;
  font-weight: 500;
  color: #94a3b8;
}

.game-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #94a3b8;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 6px;
}

/* Bảng xếp hạng */
.ranking-section {
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.ranking-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.filter-tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  background: rgba(15, 23, 42, 0.6);
  padding: 5px;
  border-radius: 10px;
}

.filter-btn {
  padding: 7px 12px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-btn.active {
  background: #2563eb;
  color: #ffffff;
}

.click-hint {
  font-size: 0.8rem;
  color: #94a3b8;
}

.table-responsive {
  overflow-x: auto;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(15, 23, 42, 0.5);
}

.ranking-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

.ranking-table th {
  background: #0f172a;
  color: #94a3b8;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.ranking-table td {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  color: #e2e8f0;
}

.player-row {
  cursor: pointer;
  transition: background 0.15s;
}

.player-row:hover td {
  background: rgba(255, 255, 255, 0.04);
}

.current-user-row td {
  background: rgba(37, 99, 235, 0.16);
}

.rank-chip {
  display: inline-block;
  min-width: 34px;
  text-align: center;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 700;
  font-size: 0.8rem;
  background: rgba(51, 65, 85, 0.6);
}

.rank-chip.top-1 {
  background: rgba(234, 179, 8, 0.22);
  color: #fde047;
  border: 1px solid rgba(234, 179, 8, 0.45);
}

.rank-chip.top-2 {
  background: rgba(148, 163, 184, 0.25);
  color: #f8fafc;
  border: 1px solid rgba(148, 163, 184, 0.45);
}

.rank-chip.top-3 {
  background: rgba(217, 119, 6, 0.22);
  color: #fdba74;
  border: 1px solid rgba(217, 119, 6, 0.45);
}

.player-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-text {
  font-weight: 600;
}

.me-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: #2563eb;
  color: #ffffff;
}

.game-col-score {
  color: #cbd5e1;
}

.game-col-score.active-sort-col {
  color: #38bdf8;
  font-weight: 700;
}

.total-col-score {
  font-weight: 800;
  color: #60a5fa;
  font-size: 0.98rem;
}

.inspect-btn {
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(51, 65, 85, 0.55);
  color: #e2e8f0;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.inspect-btn:hover {
  background: #2563eb;
  border-color: #3b82f6;
}

.text-center {
  text-align: center !important;
}

.text-right {
  text-align: right !important;
}

.empty-state {
  padding: 48px 20px;
  text-align: center;
  color: #94a3b8;
}

/* Modal chi tiết kho điểm của người chơi */
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
  max-width: 560px;
  width: 100%;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.modal-sub {
  margin: 4px 0 0;
  font-size: 0.84rem;
  color: #94a3b8;
}

.close-btn {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(51, 65, 85, 0.6);
  color: #f8fafc;
  font-weight: 600;
  cursor: pointer;
}

.detail-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(15, 23, 42, 0.65);
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.detail-game-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.detail-game-info strong {
  font-size: 0.92rem;
  color: #f1f5f9;
}

.detail-game-info span {
  font-size: 0.78rem;
  color: #94a3b8;
}

.detail-game-score {
  font-size: 1.05rem;
  font-weight: 700;
  color: #38bdf8;
}

.detail-total-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-radius: 10px;
  background: rgba(37, 99, 235, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  font-size: 0.95rem;
}

.detail-total-footer strong {
  font-size: 1.2rem;
  color: #60a5fa;
}
</style>