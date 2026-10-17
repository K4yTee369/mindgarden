require('dotenv').config();

async function checkModels() {
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.error) {
            console.error("Lỗi API Key:", data.error.message);
            return;
        }

        console.log("Các model hỗ trợ tạo văn bản mà bạn có thể dùng:");
        const textModels = data.models.filter(m => 
            m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent")
        );
        
        textModels.forEach(m => console.log("-", m.name.replace('models/', '')));
    } catch (error) {
        console.error("Lỗi kết nối:", error);
    }
}

checkModels();