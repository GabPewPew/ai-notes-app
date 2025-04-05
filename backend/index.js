// ✅ Final backend with improved Markdown-to-DOCX conversion (headers, bold, italics, lists, and table support)
const express = require("express");
const fileUpload = require("express-fileupload");
const cors = require("cors");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const textToSpeech = require("@google-cloud/text-to-speech");
const { writeFileSync, unlinkSync } = require("fs");
const marked = require("marked");
const puppeteer = require("puppeteer");
const { JSDOM } = require("jsdom");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} = require("docx");
require("dotenv").config();

const { getClassificationPrompt, getNotesPrompt, getLecturePrompt } = require("./prompts");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));

console.log("\uD83D\uDD11 GEMINI:", process.env.GEMINI_API_KEY ? "Loaded" : "Missing");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const ttsClient = new textToSpeech.TextToSpeechClient();

let uploadedText = "";
let formattedNotesMemory = "";

function chunkText(text, maxLength = 12000) {
  const paragraphs = text.split("\n\n");
  const chunks = [];
  let current = "";
  for (const para of paragraphs) {
    if ((current + para).length > maxLength) {
      chunks.push(current.trim());
      current = para + "\n\n";
    } else {
      current += para + "\n\n";
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

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
    if (!req.files || !req.files.file) return res.status(400).send("No file uploaded");
    uploadedText = await extractText(req.files.file);
    res.json({ message: "✅ File uploaded. Text is now available for processing." });
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    res.status(500).send("Failed to process file");
  }
});

app.post("/generate-notes", async (req, res) => {
  console.log("📨 /generate-notes endpoint hit!");
  if (!uploadedText) return res.status(400).send("No document uploaded yet");

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const classifyPrompt = getClassificationPrompt(uploadedText);
    const classifyResult = await model.generateContent(classifyPrompt);
    const category = classifyResult.response.text().trim().toUpperCase();
    console.log("📂 Category:", category);

    const chunks = chunkText(uploadedText);
    let allFormattedNotes = "";

    for (let i = 0; i < chunks.length; i++) {
      const notesPrompt = getNotesPrompt(chunks[i], category);
      const notesResult = await model.generateContent(notesPrompt);
      allFormattedNotes += notesResult.response.text().trim() + "\n\n";
    }

    formattedNotesMemory = allFormattedNotes.trim();
    res.json({ category, formattedNotes: formattedNotesMemory });
  } catch (err) {
    console.error("❌ Gemini note generation error:", err.message);
    res.status(500).send("Note generation failed");
  }
});

app.post("/generate-audio", async (req, res) => {
  if (!formattedNotesMemory) return res.status(400).send("No notes available to convert");
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    const lecturePrompt = getLecturePrompt(formattedNotesMemory);
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
    console.error("❌ Audio generation error:", err.message);
    res.status(500).send("Audio generation failed");
  }
});

app.get("/export-notes", async (req, res) => {
  try {
    if (!formattedNotesMemory) return res.status(400).send("No notes available to export");
    const htmlBody = marked.parse(formattedNotesMemory);
    const htmlContent = `
      <html><head><style>
        body { font-family: Georgia, serif; line-height: 1.6; padding: 40px; color: #333; max-width: 800px; margin: auto; }
        h1, h2, h3 { color: #2c3e50; border-bottom: 1px solid #ccc; padding-bottom: 0.3em; margin-top: 2rem; }
        ul, ol { margin-left: 1.5rem; page-break-inside: avoid; }
        table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        th, td { border: 1px solid #aaa; padding: 0.5rem; text-align: left; }
        @page { margin: 40px; }
      </style></head><body>${htmlBody}</body></html>
    `;

    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div></div>`,
      footerTemplate: `<div style='font-size:10px; width:100%; text-align:center;'>Page <span class='pageNumber'></span> of <span class='totalPages'></span></div>`,
      margin: { top: "40px", bottom: "60px" },
    });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=AI_Study_Notes.pdf");
    res.send(pdfBuffer);
  } catch (err) {
    console.error("❌ Puppeteer PDF export error:", err.message);
    res.status(500).send("Failed to generate PDF");
  }
});

app.get("/export-notes-docx", async (req, res) => {
  try {
    if (!formattedNotesMemory) return res.status(400).send("No notes available to export");

    const dom = new JSDOM(marked.parse(formattedNotesMemory));
    const doc = dom.window.document;

    const elements = Array.from(doc.body.childNodes);
    const children = [];

    for (const el of elements) {
      if (el.nodeName === "H1" || el.nodeName === "H2" || el.nodeName === "H3") {
        children.push(
          new Paragraph({
            text: el.textContent,
            heading: el.nodeName === "H1" ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          })
        );
      } else if (el.nodeName === "P") {
        children.push(new Paragraph(el.textContent));
      } else if (el.nodeName === "UL") {
        for (const li of el.querySelectorAll("li")) {
          children.push(new Paragraph({ text: "• " + li.textContent }));
        }
      } else if (el.nodeName === "TABLE") {
        const rows = Array.from(el.querySelectorAll("tr")).map((tr) =>
          new TableRow({
            children: Array.from(tr.children).map((td) =>
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                children: [new Paragraph(td.textContent)],
              })
            ),
          })
        );
        children.push(new Table({ rows }));
      }
    }

    const docx = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(docx);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", "attachment; filename=AI_Study_Notes.docx");
    res.send(buffer);
  } catch (err) {
    console.error("❌ DOCX export error:", err.message);
    res.status(500).send("Failed to export as Word");
  }
});

app.listen(port, () => {
  console.log(`🟢 Server running at http://localhost:${port}`);
});
