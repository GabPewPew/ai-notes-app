
const express = require("express");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const textToSpeech = require("@google-cloud/text-to-speech");
const { v4: uuidv4 } = require("uuid");
const { writeFileSync, createReadStream, unlinkSync, existsSync, mkdirSync } = require("fs");
const path = require("path");
const marked = require("marked");
const puppeteer = require("puppeteer");
require("dotenv").config();

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));

console.log("🔑 GEMINI:", process.env.GEMINI_API_KEY ? "Loaded" : "Missing");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ttsClient = new textToSpeech.TextToSpeechClient();

let uploadedText = "";
let formattedNotesMemory = "";

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

app.post("/generate-notes", async (req, res) => {
  console.log("📨 /generate-notes endpoint hit!");

  if (!uploadedText) {
    return res.status(400).send("No document uploaded yet");
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

    const classifyPrompt = `Please classify the following text as either "STEM" or "Language-based". Only reply with one word: STEM or LANGUAGE.

${uploadedText}`;
    const classifyResult = await model.generateContent(classifyPrompt);
    const category = classifyResult.response.text().trim().toUpperCase();
    console.log("📂 Category:", category);

    const notesPrompt =
      category === "STEM"
        ? `
You are a study note formatting assistant. Please convert the following medical document into clean, elegant, and highly readable study notes suitable for medical students.

Requirements:
- DO NOT use asterisks (*).
- Use proper markdown or plain formatting instead.
- Use clear section headings with bold (e.g. "## Investigations").
- Use indentation and bullet points with dashes (-) or numbered lists.
- Where appropriate, use tables (e.g. for classifications).
- Keep the style professional, clear, and logically grouped.

Input Text:
${uploadedText}
        `
        : `
You are a study note formatting assistant. Please convert the following text into elegant, structured notes suitable for arts or language students.

Requirements:
- Use professional markdown or plain formatting.
- Include headers, bullet points (- or numbers), and paragraph structure.
- Do NOT use asterisks.
- Keep it well-organized and easy to follow.

Input Text:
${uploadedText}
        `;

    const notesResult = await model.generateContent(notesPrompt);
    const formattedNotes = notesResult.response.text().trim();
    formattedNotesMemory = formattedNotes;

    res.json({ category, formattedNotes });
  } catch (err) {
    console.error("❌ Gemini note generation error:", err.message);
    res.status(500).send("Note generation failed");
  }
});

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
      voice: { languageCode: "en-US", name: "en-US-Neural2-D", ssmlGender: "MALE" },
      audioConfig: { audioEncoding: "MP3" },
    });

    const audioBase64 = response.audioContent.toString("base64");
    res.json({ audioBase64 });
  } catch (err) {
    console.error("❌ Gemini/audio error:", err.message);
    res.status(500).send("Audio generation failed");
  }
});

app.get("/export-notes", async (req, res) => {
  try {
    if (!formattedNotesMemory) {
      return res.status(400).send("No notes available to export");
    }

    const htmlBody = marked.parse(formattedNotesMemory);

    const htmlContent = `
<html>
  <head>
    <meta charset="UTF-8">
    <title>AI Study Notes</title>
    <style>
      body {
        font-family: 'Georgia', serif;
        line-height: 1.6;
        padding: 40px;
        color: #333;
        max-width: 800px;
        margin: auto;
      }
      h1, h2, h3 {
        color: #2c3e50;
        border-bottom: 1px solid #ccc;
        padding-bottom: 0.3em;
        margin-top: 2rem;
      }
      ul {
        margin-left: 1.5rem;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1rem 0;
      }
      th, td {
        border: 1px solid #aaa;
        padding: 0.5rem;
        text-align: left;
      }
      pre, code {
        background: #f5f5f5;
        padding: 0.3rem;
        font-family: monospace;
      }
    </style>
  </head>
  <body>${htmlBody}</body>
</html>
`;

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=AI_Study_Notes.pdf");
    res.send(pdfBuffer);
  } catch (err) {
    console.error("❌ Puppeteer PDF export error:", err.message);
    res.status(500).send("Failed to generate PDF");
  }
});

app.listen(port, () => {
  console.log(`🟢 Server running at http://localhost:${port}`);
});
