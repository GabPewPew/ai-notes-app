const express = require("express");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const textToSpeech = require("@google-cloud/text-to-speech");
const PDFDocument = require("pdfkit");
require("dotenv").config();

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));

// ✅ Logs
console.log("🔑 GEMINI:", process.env.GEMINI_API_KEY ? "Loaded" : "Missing");

// ✅ Google APIs
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ttsClient = new textToSpeech.TextToSpeechClient();

// 🧠 Memory store
let uploadedText = "";
let formattedNotesMemory = "";

// 📄 Extract text
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

// 📤 Upload
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

// ✨ Generate formatted notes only
app.post("/generate-notes", async (req, res) => {
  console.log("📨 /generate-notes endpoint hit!");

  if (!uploadedText) {
    return res.status(400).send("No document uploaded yet");
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    const classifyPrompt = `Please classify the following text as either "STEM" or "Language-based". Only reply with one word: STEM or LANGUAGE.\n\n${uploadedText}`;
    const classifyResult = await model.generateContent(classifyPrompt);
    const category = classifyResult.response.text().trim().toUpperCase();
    console.log("📂 Category:", category);

    const notesPrompt =
      category === "STEM"
        ? `Convert this document into clean, indented, bullet-point, study notes for STEM students (medical, science). Use a combination of formatting techniques like bullet points, commas, indentations, bolding, and headings to structure the notes clearly. Make it elegant and clear. Group ideas well:\n\n${uploadedText}`
        : `Convert this document into beautiful, structured bullet-point notes for arts/language students. Make it elegant and clear:\n\n${uploadedText}`;

    const notesResult = await model.generateContent(notesPrompt);
    const formattedNotes = notesResult.response.text().trim();
    formattedNotesMemory = formattedNotes;

    res.json({
      category,
      formattedNotes,
    });
  } catch (err) {
    console.error("❌ Gemini note generation error:", err.message);
    if (err.stack) console.error("🧠 Stack trace:", err.stack);
    res.status(500).send("Note generation failed");
  }
});

// 🔊 Generate audio from stored notes (on user request)
app.post("/generate-audio", async (req, res) => {
  if (!formattedNotesMemory) {
    return res.status(400).send("No notes available to convert");
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    const lecturePrompt = `You are a university professor giving a concise spoken lecture to students.
Turn the following notes into a clear, natural-sounding lecture script.

✅ Stay within 3000–3500 characters (roughly 3–5 paragraphs).
✅ Use simple explanations, short sentences, and smooth transitions.
✅ Do NOT list bullet points — this should sound like a human talking.

Here are the notes:
${formattedNotesMemory}`;

    const lectureResult = await model.generateContent(lecturePrompt);
    const manuscript = lectureResult.response.text().trim();

    const [response] = await ttsClient.synthesizeSpeech({
      input: { text: manuscript },
      voice: {
        languageCode: "en-US",
        name: "en-US-Neural2-D",
        ssmlGender: "MALE",
      },
      audioConfig: { audioEncoding: "MP3" },
    });

    const audioBase64 = response.audioContent.toString("base64");

    res.json({ audioBase64 });
  } catch (err) {
    console.error("❌ Gemini/audio error:", err.message);
    if (err.stack) console.error("🧠 Stack trace:", err.stack);
    res.status(500).send("Audio generation failed");
  }
});

// 📄 Export notes to PDF
app.get("/export-notes", async (req, res) => {
  try {
    if (!formattedNotesMemory) {
      return res.status(400).send("No notes available to export");
    }

    const doc = new PDFDocument();
    const filename = "AI_Study_Notes.pdf";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    doc.pipe(res);
    doc.font("Times-Roman").fontSize(14).text(formattedNotesMemory, {
      lineGap: 6,
    });
    doc.end();
  } catch (err) {
    console.error("❌ PDF export error:", err.message);
    res.status(500).send("Failed to generate PDF");
  }
});

// ✅ Start server
app.listen(port, () => {
  console.log(`🟢 Server running at http://localhost:${port}`);
});
