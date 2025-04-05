const express = require("express");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());
app.use(fileUpload());

// ✅ Log environment variable status
console.log("🔑 GEMINI:", process.env.GEMINI_API_KEY ? "Loaded" : "Missing");
console.log("🔑 ELEVEN:", process.env.ELEVEN_API_KEY ? "Loaded" : "Missing");
console.log("🔊 VOICE ID:", process.env.ELEVEN_VOICE_ID ? "Loaded" : "Missing");

// ✅ Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🧠 Store uploaded document
let uploadedText = "";

// 📄 Extract text from file
async function extractText(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "pdf") {
    const data = await pdfParse(file.data);
    return data.text;
  } else if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer: file.data });
    return result.value;
  } else if (ext === "txt") {
    return file.data.toString("utf-8");
  } else {
    throw new Error("Unsupported file type.");
  }
}

// 📤 File upload route
app.post("/upload", async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).send("No file uploaded");
    }

    uploadedText = await extractText(req.files.file);
    res.json({ message: "✅ File uploaded. Text is now available for chat." });
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    res.status(500).send("Failed to process file");
  }
});

// 💬 Chat route
app.post("/chat", async (req, res) => {
  console.log("📨 /chat endpoint hit!");
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).send("No messages provided");
  }

  if (!uploadedText) {
    return res.status(400).send("No document uploaded yet");
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    const formattedHistory = messages.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.content }],
    }));

    const chat = model.startChat({ history: formattedHistory });

    const lastMessage = messages[messages.length - 1].content;
    const inputWithDoc = `${lastMessage}\n\n---\nHere is the document:\n${uploadedText}`;

    const result = await chat.sendMessage(inputWithDoc);
    const response = await result.response;

    res.json({ reply: response.text() });
  } catch (err) {
    console.error("❌ Chat error:", err.message);
    if (err.response?.data) {
      console.error("🔍 Gemini response error:", JSON.stringify(err.response.data, null, 2));
    }
    if (err.stack) {
      console.error("🧠 Stack trace:\n", err.stack);
    }
    res.status(500).send("Chat failed");
  }
});

// 🔊 Audio generation route
app.post("/generate-audio", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).send("No text provided");

  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVEN_VOICE_ID}`,
      {
        text,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      },
      {
        headers: {
          "xi-api-key": process.env.ELEVEN_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      }
    );

    res.set("Content-Type", "audio/mpeg");
    res.send(response.data);
  } catch (err) {
    console.error("❌ ElevenLabs error:", err.response?.data || err.message);
    res.status(500).send("Audio generation failed");
  }
});

// ✅ Start the server
app.listen(port, () => {
  console.log(`🟢 Server running at http://localhost:${port}`);
});
