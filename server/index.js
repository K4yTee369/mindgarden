require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const rateLimit = require('express-rate-limit');


const User = require('./models/User'); 
const VoidPost = require('./models/VoidPost'); 
const Counter = require('./models/Counter'); 

const app = express();
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true, parameterLimit: 100000 }));
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// --- 1. MONGODB CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- 2. GEMINI AI CONFIGURATION ---
if (!process.env.GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY not found in .env file");
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    // Đổi tên file tránh trùng lặp (vd: 1691234567-hinhanh.jpg)
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } 
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// --- 4. CHAT API ---
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || !message.trim()) {
            return res.status(400).json({ reply: "Message không được để trống!" });
        }
        
        // Khởi tạo model kèm theo bộ luật (System Instructions)
        const model = genAI.getGenerativeModel({ 
            model: "gemini-3.6-flash",
            systemInstruction: `Bạn là MindGarden AI, một người bạn đồng hành ẩn danh chuyên hỗ trợ giảm căng thẳng cho sinh viên. 
            Bạn phải tuyệt đối tuân thủ các quy tắc an toàn sau:
            1. An toàn tính mạng: Nếu người dùng đề cập đến tự sát, làm hại bản thân hoặc người khác, hãy ngay lập tức khuyên họ tìm kiếm sự giúp đỡ từ chuyên gia y tế, đường dây nóng hoặc người thân. Không cố gắng tự xử lý các tình huống khẩn cấp này.
            2. Ranh giới chuyên môn: Bạn là người lắng nghe, KHÔNG phải bác sĩ tâm lý. Không bao giờ đưa ra chẩn đoán y tế, bệnh lý học hoặc khuyên dùng thuốc.
            3. Thái độ: Luôn giữ thái độ đồng cảm, ấm áp, trung lập và tuyệt đối không phán xét.
            4. Định dạng: Câu trả lời phải ngắn gọn (dưới 100 chữ trừ khi người dùng yêu cầu dài hơn), nói chuyện tự nhiên như một người bạn, sử dụng đại từ "mình" và "bạn".
            5. Hãy trả lời bằng ngôn ngữ cùng với ngôn ngữ mà người dùng đã sử dụng trong tin nhắn của họ.`
        }); 

        // Chỉ truyền tin nhắn thực tế của người dùng vào prompt
        const prompt = `Người dùng nói: "${message}"`;
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        res.json({ reply: text });
    } catch (error) {
        // ... (phần xử lý lỗi giữ nguyên như cũ)
        console.error("AI Error:", error.message);
        res.status(500).json({ reply: "AI connection error: " + error.message });
    }
});

const voidPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { message: "Bạn đã đăng quá nhiều bài. Vui lòng nghỉ ngơi và thử lại sau 15 phút!" },
  standardHeaders: true,
  legacyHeaders: false,
});


// --- 5. THE VOID API ---

// API GET: Chỉ lấy những bài đăng có trạng thái 'approved'
app.get('/api/void', async (req, res) => {
  try {
    const posts = await VoidPost.find({ 
      status: { $in: ['approved', 'ai_approved', 'admin_approved'] } 
    }).sort({ createdAt: -1 }).limit(50);
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// --- ĐỌC VÀ CHUYỂN ĐỔI ẢNH (Giữ nguyên phần Multer/FS phía trên của bạn) ---

app.post('/api/void', upload.array('images', 4), async (req, res) => {
  try {
    const { content, author, tag } = req.body;
    let finalStatus = 'ai_approved'; // Mặc định nếu bài viết trống hoặc an toàn

    // 1. Chỉ kích hoạt AI nếu có chữ hoặc có ảnh
    if ((content && content.trim().length > 0) || (req.files && req.files.length > 0)) {
      try {
        // Cấu hình giảm chặn để AI đọc được ảnh nhạy cảm và tự gắn cờ
        const { HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
        
        const model = genAI.getGenerativeModel({ 
          model: "gemini-3.8-flash",
          // Ép AI không được từ chối xử lý các nội dung nhạy cảm để ta chủ động bắt lỗi
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          ]
        });

        // Prompt kiểm duyệt tối thượng: bắt cả văn bản và hình ảnh nhạy cảm
        const aiPrompt = [
          `Bạn là một chuyên gia kiểm duyệt nội dung (Content Moderator) cực kỳ nghiêm khắc cho mạng xã hội sinh viên.
          Nhiệm vụ của bạn là quét toàn bộ văn bản VÀ tất cả hình ảnh được gửi kèm (nếu có).

          HÃY ĐÁNH DẤU "flagged" NẾU NỘI DUNG CHỨA BẤT KỲ YẾU TỐ NÀO SAU ĐÂY:
          1. 18+ / Đồi trụy: Ảnh khỏa thân, bán khỏa thân, tư thế gợi dục, bộ phận nhạy cảm, đồ lót/đồ tắm quá hở hang, hoặc văn bản kích dục.
          2. Bạo lực: Máu me, vũ khí, đánh nhau, tự hại, hoặc đe dọa người khác.
          3. Chất cấm: Ma túy, bài bạc, các chất kích thích bị cấm.
          4. Ngôn từ: Chửi thề, lăng mạ, xúc phạm, phân biệt chủng tộc/giới tính.

          NẾU AN TOÀN (chỉ là than vãn, áp lực học tập, ảnh đời thường, phong cảnh, bài tập, anime thông thường...): Trả về duy nhất chữ "clean".
          
          NẾU VI PHẠM (Dù chỉ một chút ở chữ hoặc ở bất kỳ tấm ảnh nào): Trả về duy nhất chữ "flagged".

          Nội dung chữ: "${content || "Không có chữ"}"`
        ];

        // Đọc và chuyển các file ảnh sang Base64 để truyền vào prompt
        if (req.files && req.files.length > 0) {
          for (const file of req.files) {
            aiPrompt.push({
              inlineData: {
                data: fs.readFileSync(file.path).toString("base64"),
                mimeType: file.mimetype
              }
            });
          }
        }

        // Gọi AI phân tích
        const result = await model.generateContent(aiPrompt);
        const aiResponse = result.response.text().trim().toLowerCase();
        
        console.log(`[AI Moderation Result]: ${aiResponse}`); // Log ra để bạn tiện theo dõi trong Terminal

        // Nếu AI phát hiện vi phạm hoặc không chắc chắn
        if (aiResponse.includes('flagged') || !aiResponse.includes('clean')) {
          finalStatus = 'pending'; 
        }

      } catch (aiError) {
        // CỰC KỲ QUAN TRỌNG: Nếu có bất kỳ lỗi nào xảy ra (lỗi mạng, ảnh quá nhạy cảm bị Google chặn cứng...), 
        // tuyệt đối không cho đăng (approve), mà phải đẩy vào 'pending' để Admin duyệt thủ công.
        console.error("Lỗi hoặc bị chặn bởi Safety Filters. Đã chuyển bài viết sang chế độ chờ duyệt (Pending).", aiError.message);
        finalStatus = 'pending'; 
      }
    }

    // --- TIẾN HÀNH LƯU DATABASE (Giữ nguyên toàn bộ phần lưu của bạn) ---
    // Tìm dòng này trong app.post('/api/void') ở server/index.js:
// const imageUrls = req.files ? req.files.map(file => `uploads/${file.filename}`) : [];

// Và thay bằng đoạn này để ảnh lưu vĩnh viễn trong MongoDB, mở xem được ở mọi nơi:
  const imageUrls = req.files
    ? req.files.map((file) => {
        const base64Data = fs.readFileSync(file.path).toString('base64');
        return `data:${file.mimetype};base64,${base64Data}`;
      })
    : [];

    const counter = await Counter.findOneAndUpdate(
      { _id: 'void_post_id' }, 
      { $inc: { seq: 1 } }, 
      { new: true, upsert: true }
    );

    const newPost = new VoidPost({
      id: counter.seq, 
      content: content || "",
      author: author || "Anonymous",
      tag: tag || "General",
      images: imageUrls,
      status: finalStatus
    });

    await newPost.save();

    // Trả phản hồi về cho Frontend
    if (finalStatus === 'pending') {
      res.json({ 
        message: "Bài viết hoặc hình ảnh của bạn đang được xem xét vì có thể chứa nội dung chưa phù hợp. Bài viết sẽ sớm hiển thị sau khi được phê duyệt.", 
        post: null 
      });
    } else {
      res.json({ message: "Sent to the void!", post: newPost });
    }

  } catch (err) {
    console.error("Void Submission Error:", err); 
    res.status(500).json({ message: "Server Error: " + err.message });
  }
});

// API MỚI: Thêm bình luận vào bài viết
app.post('/api/void/:id/comments', async (req, res) => {
  try {
    const { author, text } = req.body;
    const post = await VoidPost.findOne({ id: req.params.id });
    
    if (!post) return res.status(404).json({ message: "Không tìm thấy bài viết" });

    const newComment = { author, text, createdAt: new Date() };
    post.comments.push(newComment);
    await post.save();

    res.json({ message: "Bình luận thành công", comment: newComment });
  } catch (err) {
    res.status(500).json({ message: "Server Error: " + err.message });
  }
});

// --- 6. WORDLE GAME API (AI WORD GENERATOR) ---

// Kho từ dự phòng khi AI quá tải (503)
const FALLBACK_WORDS = {
  easy: [
    { word: "SMILE", hint: "Biểu cảm trên khuôn mặt khi bạn cảm thấy vui vẻ.", meaning: "Nụ cười / Mỉm cười", topic: "Cảm xúc" },
    { word: "WATER", hint: "Chất lỏng trong suốt không thể thiếu cho sự sống.", meaning: "Nước", topic: "Đời sống" },
    { word: "DREAM", hint: "Những hình ảnh xuất hiện khi bạn đang ngủ hoặc ước mơ.", meaning: "Giấc mơ / Ước mơ", topic: "Tâm trí" },
    { word: "LIGHT", hint: "Thứ giúp xua tan bóng tối.", meaning: "Ánh sáng", topic: "Thiên nhiên" },
    { word: "HEART", hint: "Cơ quan trong lồng ngực biểu tượng cho tình yêu.", meaning: "Trái tim", topic: "Cơ thể" },
    { word: "MUSIC", hint: "Giai điệu giúp sinh viên thư giãn sau giờ học.", meaning: "Âm nhạc", topic: "Giải trí" }
  ],
  medium: [
    { word: "PEACE", hint: "Trạng thái tâm hồn bình yên, không âu lo.", meaning: "Sự bình yên / Hòa bình", topic: "Tâm trạng" },
    { word: "HAPPY", hint: "Cảm xúc tích cực khi đạt điểm cao.", meaning: "Hạnh phúc / Vui vẻ", topic: "Cảm xúc" },
    { word: "SLEEP", hint: "Hoạt động nghỉ ngơi giúp phục hồi năng lượng sau ngày dài.", meaning: "Giấc ngủ / Ngủ", topic: "Sức khỏe" },
    { word: "BLOOM", hint: "Khoảnh khắc bông hoa bung tỏa cánh rực rỡ nhất.", meaning: "Nở rộ (hoa)", topic: "Thiên nhiên" },
    { word: "FOCUS", hint: "Trạng thái tập trung cao độ khi ôn thi.", meaning: "Sự tập trung", topic: "Học tập" },
    { word: "GREEN", hint: "Màu sắc của cây cối và khu vườn MindGarden.", meaning: "Màu xanh lá", topic: "Thiên nhiên" }
  ],
  hard: [
    { word: "VIVID", hint: "Tính từ miêu tả ký ức hoặc màu sắc cực kỳ sống động, rõ nét.", meaning: "Sống động / Rõ nét", topic: "Học thuật" },
    { word: "AXIOM", hint: "Một định đề hoặc chân lý hiển nhiên không cần chứng minh.", meaning: "Tiên đề / Chân lý", topic: "Khoa học" },
    { word: "QUART", hint: "Đơn vị đo dung tích chất lỏng trong hệ đo lường Anh - Mỹ.", meaning: "Một phần tư ga-lông (Đơn vị đo)", topic: "Đo lường" },
    { word: "ROGUE", hint: "Kẻ lừa đảo hoặc cá nhân hoạt động độc lập, bất quy tắc.", meaning: "Kẻ sống ngoài vòng quy tắc / Tinh quái", topic: "Từ vựng nâng cao" },
    { word: "ZESTY", hint: "Tính từ chỉ hương vị đậm đà, tươi mát hoặc tràn đầy nhiệt huyết.", meaning: "Hăng hái / Hương vị đậm đà", topic: "Ẩm thực & Tính cách" }
  ]
};

app.get('/api/games/wordle/new-word', async (req, res) => {
  const difficulty = ['easy', 'medium', 'hard'].includes(req.query.difficulty) 
    ? req.query.difficulty 
    : 'medium';

  const topics = ["Đời sống sinh viên", "Thiên nhiên & Cây cối", "Cảm xúc & Chữa lành", "Công nghệ", "Ẩm thực", "Nghệ thuật", "Khoa học"];
  const randomTopic = topics[Math.floor(Math.random() * topics.length)];
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const randomLetter = alphabet[Math.floor(Math.random() * alphabet.length)];

  let difficultyRule = "";
  if (difficulty === 'easy') {
    difficultyRule = "Từ vựng cực kỳ cơ bản (trình độ A1-A2), 5 chữ cái KHÁC NHAU HOÀN TOÀN (không có chữ cái nào lặp lại).";
  } else if (difficulty === 'medium') {
    difficultyRule = "Từ vựng thông dụng (trình độ B1-B2), cho phép có chữ cái lặp lại.";
  } else {
    difficultyRule = "Từ vựng nâng cao/học thuật (B2-C1) hoặc chứa các chữ cái ít gặp (như V, Z, X, Q, J, K).";
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
    const prompt = `
      Bạn là quản trò của game đoán chữ Wordle trên nền tảng MindGarden.
      Hãy tạo 1 từ tiếng Anh hợp lệ có ĐÚNG 5 CHỮ CÁI (A-Z) theo yêu cầu sau:
      - Độ khó: ${difficulty.toUpperCase()} (${difficultyRule})
      - Chủ đề gợi ý: "${randomTopic}" (Ưu tiên bắt đầu hoặc có chứa chữ "${randomLetter}" để tạo sự đa dạng).
      
      BẮT BUỘC trả về ĐÚNG định dạng JSON thuần túy (không bọc trong markdown \`\`\`json), theo cấu trúc sau:
      {
        "word": "TỪ_5_CHỮ_CÁI_VIẾT_HOA",
        "hint": "Một câu gợi ý thú vị bằng tiếng Việt (không làm lộ trực tiếp từ đó)",
        "meaning": "Nghĩa tiếng Việt ngắn gọn kèm từ loại (VD: Danh từ - Sự bình yên)",
        "topic": "${randomTopic}"
      }
    `;

    const result = await model.generateContent(prompt);
    let rawText = result.response.text().trim();
    
    // Làm sạch nếu AI vẫn lỡ bọc thẻ markdown
    rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(rawText);

    // Kiểm tra chắc chắn từ AI tạo ra có đúng 5 chữ cái A-Z không
    const cleanWord = (parsedData.word || "").trim().toUpperCase();
    if (/^[A-Z]{5}$/.test(cleanWord)) {
      return res.json({
        success: true,
        source: 'ai',
        word: cleanWord,
        hint: parsedData.hint || "Hãy thử đoán các nguyên âm trước nhé!",
        meaning: parsedData.meaning || "Từ vựng tiếng Anh thông dụng",
        topic: parsedData.topic || randomTopic
      });
    } else {
      throw new Error("AI generated invalid word length");
    }

  } catch (error) {
    console.warn("Wordle AI Fallback kích hoạt:", error.message);
    const list = FALLBACK_WORDS[difficulty];
    const fallbackItem = list[Math.floor(Math.random() * list.length)];
    return res.json({
      success: true,
      source: 'fallback',
      ...fallbackItem
    });
  }
});

// --- 7. MULTI-GAME SCORE REPOSITORY & LEADERBOARD API ---
const UserModel = require('./models/User');
const { authenticate: authGame } = require('./middleware/auth.middleware');

// Danh sách 5 game trong hệ thống (Sau này làm game mới bạn chỉ cần đổi tên hiển thị)
const GAME_KEYS = ['wordle', 'game2', 'game3', 'game4', 'game5'];

const singleGameSubSchema = {
  score: { type: Number, default: 0 },
  played: { type: Number, default: 0 },
  won: { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  maxStreak: { type: Number, default: 0 }
};

// Schema lưu Kho điểm 5 game + Tổng điểm của mỗi người chơi
const playerScoreSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  fullName: { type: String, required: true },
  totalScore: { type: Number, default: 0 },
  totalPlayed: { type: Number, default: 0 },
  totalWon: { type: Number, default: 0 },
  games: {
    wordle: { type: singleGameSubSchema, default: () => ({}) },
    game2: { type: singleGameSubSchema, default: () => ({}) },
    game3: { type: singleGameSubSchema, default: () => ({}) },
    game4: { type: singleGameSubSchema, default: () => ({}) },
    game5: { type: singleGameSubSchema, default: () => ({}) }
  },
  updatedAt: { type: Date, default: Date.now }
});

const PlayerScore = mongoose.models.PlayerScore || mongoose.model('PlayerScore', playerScoreSchema);

// Hàm tự động tính lại Tổng điểm và Tổng số trận từ 5 game
const recalculateTotals = (record) => {
  let sumScore = 0;
  let sumPlayed = 0;
  let sumWon = 0;

  GAME_KEYS.forEach((key) => {
    const g = record.games?.[key];
    if (g) {
      sumScore += Number(g.score || 0);
      sumPlayed += Number(g.played || 0);
      sumWon += Number(g.won || 0);
    }
  });

  record.totalScore = sumScore;
  record.totalPlayed = sumPlayed;
  record.totalWon = sumWon;
};

// 1. API Lấy Bảng xếp hạng tổng hợp (Có thể lọc theo Tổng 5 game hoặc từng game)
app.get('/api/games/leaderboard', async (req, res) => {
  try {
    const filter = req.query.game || 'total';
    let sortQuery = { totalScore: -1, totalWon: -1 };

    if (GAME_KEYS.includes(filter)) {
      sortQuery = { [`games.${filter}.score`]: -1, totalScore: -1 };
    }

    const players = await PlayerScore.find({ totalPlayed: { $gt: 0 } })
      .sort(sortQuery)
      .limit(50)
      .lean();

    const leaderboard = players.map((p, idx) => ({
      rank: idx + 1,
      userId: p.userId,
      fullName: p.fullName,
      totalScore: p.totalScore,
      totalPlayed: p.totalPlayed,
      totalWon: p.totalWon,
      games: p.games,
      updatedAt: p.updatedAt
    }));

    res.json({ success: true, leaderboard });
  } catch (error) {
    console.error("Lỗi lấy Leaderboard:", error);
    res.status(500).json({ success: false, message: "Lỗi tải bảng xếp hạng" });
  }
});

// 2. API Lấy kho điểm cá nhân của người đang đăng nhập
app.get('/api/games/my-stats', authGame, async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id || req.user._id;
    const record = await PlayerScore.findOne({ userId: uid }).lean();

    const emptyGame = { score: 0, played: 0, won: 0, currentStreak: 0, maxStreak: 0 };

    if (!record) {
      return res.json({
        success: true,
        profile: {
          userId: uid,
          totalScore: 0,
          totalPlayed: 0,
          totalWon: 0,
          rank: null,
          games: {
            wordle: { ...emptyGame },
            game2: { ...emptyGame },
            game3: { ...emptyGame },
            game4: { ...emptyGame },
            game5: { ...emptyGame }
          }
        }
      });
    }

    const higherCount = await PlayerScore.countDocuments({
      totalPlayed: { $gt: 0 },
      totalScore: { $gt: record.totalScore }
    });

    res.json({
      success: true,
      profile: {
        userId: record.userId,
        fullName: record.fullName,
        totalScore: record.totalScore,
        totalPlayed: record.totalPlayed,
        totalWon: record.totalWon,
        rank: record.totalPlayed > 0 ? higherCount + 1 : null,
        games: record.games
      }
    });
  } catch (error) {
    console.error("Lỗi lấy kho điểm cá nhân:", error);
    res.status(500).json({ success: false, message: "Lỗi tải thông tin điểm" });
  }
});

// 3. API Cập nhật điểm chung cho cả 5 Game
// Body truyền lên: { gameKey: 'wordle' | 'game2' | ..., won: true/false, points: Number }
app.post('/api/games/score', authGame, async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id || req.user._id;
    const { gameKey = 'wordle', won = false, points = 0 } = req.body;

    if (!GAME_KEYS.includes(gameKey)) {
      return res.status(400).json({ success: false, message: "Mã game không hợp lệ" });
    }

    const numericPoints = Math.max(0, Number(points) || 0);
    const userDoc = await UserModel.findById(uid).select('fullName email');
    const displayName = userDoc?.fullName || userDoc?.email?.split('@')[0] || 'Người chơi';

    let record = await PlayerScore.findOne({ userId: uid });
    if (!record) {
      record = new PlayerScore({ userId: uid, fullName: displayName });
    } else {
      record.fullName = displayName;
    }

    // Cập nhật điểm cho đúng game vừa chơi
    const gameStat = record.games[gameKey];
    gameStat.played += 1;
    gameStat.score += numericPoints;

    if (won) {
      gameStat.won += 1;
      gameStat.currentStreak += 1;
      if (gameStat.currentStreak > gameStat.maxStreak) {
        gameStat.maxStreak = gameStat.currentStreak;
      }
    } else {
      gameStat.currentStreak = 0;
    }

    // Cộng tổng lại cả 5 game
    recalculateTotals(record);
    record.updatedAt = new Date();
    await record.save();

    const higherCount = await PlayerScore.countDocuments({
      totalPlayed: { $gt: 0 },
      totalScore: { $gt: record.totalScore }
    });

    res.json({
      success: true,
      profile: {
        userId: record.userId,
        fullName: record.fullName,
        totalScore: record.totalScore,
        totalPlayed: record.totalPlayed,
        totalWon: record.totalWon,
        rank: higherCount + 1,
        games: record.games
      }
    });
  } catch (error) {
    console.error("Lỗi lưu điểm game:", error);
    res.status(500).json({ success: false, message: "Không thể lưu điểm" });
  }
});

// --- 8. SONGLESS (MUSIC GUESSING GAME) API ---

// Danh sách nghệ sĩ hạt giống: Muốn thêm nhạc chỉ cần điền thêm tên nghệ sĩ vào đây!
const MUSIC_ARTIST_SEEDS = {
  vpop: [
    "Sơn Tùng M-TP", "Đen Vâu", "Vũ.", "HIEUTHUHAI", "tlinh", 
    "RPT MCK", "Hoàng Thùy Linh", "Soobin Hoàng Sơn", "Bích Phương", 
    "Phan Mạnh Quỳnh", "JustaTee", "AMEE", "Wren Evans", "Low G"
  ],
  usuk: [
    "Taylor Swift", "The Weeknd", "Bruno Mars", "Twenty One Pilots", 
    "Glass Animals", "Billie Eilish", "Coldplay", "Imagine Dragons", 
    "Maroon 5", "Charlie Puth", "Ariana Grande", "Post Malone", "Dua Lipa", "Ed Sheeran", "Joji"
  ],
  kpop_indie: [
    "BTS", "BLACKPINK", "NewJeans", "TWICE", "IU", 
    "keshi", "wave to earth", "Lauv", "LANY"
  ]
};

// Bộ nhớ đệm lưu danh sách bài hát đã tải từ iTunes API
const songPoolCache = {
  vpop: [],
  usuk: [],
  kpop_indie: [],
  loadedCategories: new Set()
};

// Làm sạch tên bài hát (bỏ các đoạn chú thích rườm rà như feat., Remastered...)
const cleanTrackTitle = (rawTitle = "") => {
  return rawTitle
    .replace(/\s*\((feat\.\vert{}ft\.\vert{}with\vert{}from\vert{}Official\vert{}Remaster\vert{} Acoustic\vert{}Live)[^)]*\)/gi, "")
    .replace(/\s*\[(feat\.\vert{}ft\.\vert{}Remaster)[^\]]*\]/gi, "")
    .trim();
};

// Hàm tự động tải nhạc từ iTunes API theo danh mục
const loadCategorySongs = async (category) => {
  if (songPoolCache.loadedCategories.has(category) && songPoolCache[category].length > 0) {
    return songPoolCache[category];
  }

  const artists = MUSIC_ARTIST_SEEDS[category] || [];
  const collected = [];
  const seenKeys = new Set();

  // Gọi song song tới iTunes API cho từng nghệ sĩ
  await Promise.allSettled(
    artists.map(async (artistName) => {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=song&limit=10`;
      const response = await fetch(url);
      const data = await response.json();

      if (data && Array.isArray(data.results)) {
        for (const item of data.results) {
          if (!item.previewUrl || !item.trackName || !item.artistName) continue;

          const title = cleanTrackTitle(item.trackName);
          const artist = item.artistName.trim();
          const uniqueKey = `${title.toLowerCase()}__${artist.toLowerCase()}`;

          if (!seenKeys.has(uniqueKey) && title.length > 1) {
            seenKeys.add(uniqueKey);
            collected.push({
              id: String(item.trackId),
              title,
              artist,
              displayLabel: `${title} - ${artist}`,
              previewUrl: item.previewUrl,
              artwork: (item.artworkUrl100 || "").replace("100x100bb", "300x300bb"),
              album: item.collectionName || "",
              category
            });
          }
        }
      }
    })
  );

  if (collected.length > 0) {
    songPoolCache[category] = collected;
    songPoolCache.loadedCategories.add(category);
    console.log(`[Songless] Đã nạp ${collected.length} bài hát cho chủ đề "${category}"`);
  }

  return collected;
};

// API lấy bài hát mới + danh sách gợi ý cho ô tìm kiếm
app.get('/api/games/songless/new-round', async (req, res) => {
  try {
    const category = req.query.category || 'all';
    let pool = [];

    if (category === 'all') {
      const [vpop, usuk, kpop] = await Promise.all([
        loadCategorySongs('vpop'),
        loadCategorySongs('usuk'),
        loadCategorySongs('kpop_indie')
      ]);
      pool = [...vpop, ...usuk, ...kpop];
    } else if (['vpop', 'usuk', 'kpop_indie'].includes(category)) {
      pool = await loadCategorySongs(category);
    } else {
      pool = await loadCategorySongs('usuk');
    }

    if (pool.length === 0) {
      return res.status(503).json({
        success: false,
        message: "Không thể kết nối tới kho nhạc iTunes lúc này."
      });
    }

    // Chọn ngẫu nhiên 1 bài làm đáp án
    const randomTarget = pool[Math.floor(Math.random() * pool.length)];

    // Tạo danh sách bài hát rút gọn (không kèm previewUrl) để Frontend làm Autocomplete
    const catalog = pool.map((s) => ({
      id: s.id, 
      title: s.title,
      artist: s.artist,
      displayLabel: s.displayLabel
    }));

    res.json({
      success: true,
      totalSongsInPool: pool.length,
      targetSong: randomTarget,
      catalog
    });
  } catch (error) {
    console.error("Lỗi tạo ván Songless:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ khi tải bài hát" });
  }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});