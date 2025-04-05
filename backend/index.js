// backend/index.js
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
    res.json({ message: "✅ File uploaded. Text is now available for processing." });
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    res.status(500).send("Failed to process file");
  }
});

// 💬 Generate categorized and formatted notes
app.post("/generate-notes", async (req, res) => {
  console.log("📨 /generate-notes endpoint hit!");

  if (!uploadedText) {
    return res.status(400).send("No document uploaded yet");
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    // Step 1: Categorize the document
    const classifyPrompt = `Please classify the following text as either "STEM" or "Language-based". Only reply with one word: STEM or LANGUAGE.\n\n${uploadedText}`;
    const classifyResult = await model.generateContent(classifyPrompt);
    const category = classifyResult.response.text().trim().toUpperCase();
    console.log("📂 Detected Category:", category);

    // Step 2: Generate styled notes based on category
    const formatPrompt =
      category === "STEM"
        ? `Summarize the following text into structured, bullet-point notes suitable for studying STEM subjects (e.g. medicine, science, engineering). Make it neat, clear, and concise:\n\n${uploadedText}`
        : `Summarize the following text into beautiful point-form notes suitable for studying language, arts, or humanities. Make the points clear, elegant, and well-organized:\n\n${uploadedText}`;

    const formatResult = await model.generateContent(formatPrompt);
    const formattedNotes = formatResult.response.text().trim();

    res.json({ category, formattedNotes });
  } catch (err) {
    console.error("❌ Gemini error:", err.message);
    if (err.stack) console.error("🧠 Stack trace:", err.stack);
    res.status(500).send("Note generation failed");
  }
});

// 🔊 ElevenLabs Audio generation route
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
