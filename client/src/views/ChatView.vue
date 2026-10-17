<script setup>
import { ref, nextTick, onMounted } from "vue";
import axios from "axios";

const messages = ref([
  {
    id: 1,
    role: "ai",
    text: "Hi, I'm here whenever you want to talk. How are you feeling today?",
    timestamp: new Date(),
  },
]);

const draft = ref("");
const isWaiting = ref(false);
const chatWindow = ref(null);

let nextId = 2;

function scrollToBottom() {
  nextTick(() => {
    if (chatWindow.value) {
      chatWindow.value.scrollTop = chatWindow.value.scrollHeight;
    }
  });
}

async function sendMessage() {
  const text = draft.value.trim();
  if (!text || isWaiting.value) return;

  messages.value.push({
    id: nextId++,
    role: "user",
    text,
    timestamp: new Date(),
  });
  draft.value = "";
  scrollToBottom();

  isWaiting.value = true;

  try {
    // Gọi trực tiếp đến API chat của backend
    const { data } = await axios.post('http://localhost:5000/api/chat', { message: text });

    messages.value.push({
      id: nextId++,
      role: "ai",
      text: data.reply,
      timestamp: new Date(),
    });
    scrollToBottom();
  } catch (err) {
    const errorMsg = err.response?.data?.reply || "Sorry, I ran into a problem responding. Please try again.";
    messages.value.push({
      id: nextId++,
      role: "ai",
      text: errorMsg,
      timestamp: new Date(),
    });
    scrollToBottom();
  } finally {
    isWaiting.value = false;
  }
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

onMounted(() => {
  scrollToBottom();
});
</script>

<template>
  <div class="chat-view">
    <header class="chat-header glass">
      <h2>MindGarden Chat</h2>
    </header>

    <div class="chat-window" ref="chatWindow">
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-row"
        :class="msg.role === 'user' ? 'row-user' : 'row-ai'"
      >
        <div class="message-bubble" :class="msg.role === 'user' ? 'bubble-user' : 'bubble-ai'">
          <p class="message-text">{{ msg.text }}</p>
          <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
        </div>
      </div>

      <div v-if="isWaiting" class="message-row row-ai">
        <div class="message-bubble bubble-ai typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>

    <form class="chat-input-area glass" @submit.prevent="sendMessage">
      <input
        v-model="draft"
        type="text"
        placeholder="Type how you're feeling..."
        :disabled="isWaiting"
      />
      <button type="submit" :disabled="isWaiting || !draft.trim()">
        {{ isWaiting ? "Sending..." : "Send" }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.chat-view {
  flex: 1;
  height: 100%;
  display: flex;
  flex-direction: column;
  max-width: 800px;
  width: 100%;
  margin: 0 auto;
  padding: 0.75rem 1rem 1rem;
  overflow: hidden;
}

.chat-header {
  flex-shrink: 0;
  padding: 0.9rem 1.25rem;
  margin-bottom: 0.75rem;
}

.chat-header h2 {
  margin: 0;
  font-size: 1.2rem;
  color: var(--text-primary);
}

.chat-window {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem 0.25rem;
}

.message-row {
  display: flex;
}

.row-ai {
  justify-content: flex-start;
}

.row-user {
  justify-content: flex-end;
}

.message-bubble {
  max-width: 70%;
  padding: 0.65rem 0.9rem;
  border-radius: 14px;
  backdrop-filter: blur(6px);
}

.bubble-ai {
  background: var(--ai-bubble-bg);
  color: var(--text-primary);
  border-bottom-left-radius: 4px;
}

.bubble-user {
  background: var(--user-bubble-bg);
  color: var(--text-primary);
  border-bottom-right-radius: 4px;
}

.message-text {
  margin: 0 0 0.25rem;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

.message-time {
  font-size: 0.7rem;
  color: var(--text-muted);
  display: block;
  text-align: right;
}

.typing-indicator {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  padding: 0.8rem 1rem;
}

.typing-indicator span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typingBounce 1.2s infinite ease-in-out;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typingBounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}

.chat-input-area {
  flex-shrink: 0;
  display: flex;
  gap: 0.6rem;
  padding: 0.75rem;
  margin-top: 0.75rem;
}

.chat-input-area input {
  flex: 1;
  padding: 0.65rem 0.9rem;
  font-size: 0.95rem;
}

.chat-input-area button {
  padding: 0.65rem 1.2rem;
  background: var(--accent);
  color: #fff;
  font-weight: 600;
  white-space: nowrap;
}

.chat-input-area button:hover:not(:disabled) {
  background: var(--accent-hover);
}
</style>
