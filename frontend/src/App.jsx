import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";

export default function App() {
  const [file, setFile] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [formattedNotes, setFormattedNotes] = useState("");
  const [audioBase64, setAudioBase64] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [uploading, setUploading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    setFile(uploadedFile);
    setAudioBase64(null);
    setFormattedNotes("");
    setChatHistory([]);
    setUploading(true);
    setUploadMessage("⏳ Uploading and generating notes...");

    const formData = new FormData();
    formData.append("file", uploadedFile);

    try {
      const uploadRes = await axios.post("http://localhost:5000/upload", formData);
      setUploadMessage(uploadRes.data.message || "✅ File uploaded.");

      const notesRes = await axios.post("http://localhost:5000/generate-notes");
      setFormattedNotes(notesRes.data.formattedNotes || "");
      setUploadMessage("✅ Notes generated. You can now play audio or export to PDF.");
    } catch (err) {
      console.error("Upload or generation error:", err);
      setUploadMessage("❌ Failed to upload or generate notes.");
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateAudio = async () => {
    setLoadingAudio(true);
    try {
      const res = await axios.post("http://localhost:5000/generate-audio");
      if (res.data.audioBase64) {
        const audioBlob = new Blob(
          [Uint8Array.from(atob(res.data.audioBase64), (c) => c.charCodeAt(0))],
          { type: "audio/mpeg" }
        );
        setAudioBase64(URL.createObjectURL(audioBlob));
      }
    } catch (err) {
      console.error("Audio generation error:", err);
      setUploadMessage("❌ Failed to generate audio.");
    } finally {
      setLoadingAudio(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;

    const newMessage = { role: "user", content: chatInput };
    const updatedHistory = [...chatHistory, newMessage];
    setChatHistory(updatedHistory);
    setChatInput("");

    try {
      const res = await axios.post("http://localhost:5000/chat", {
        messages: updatedHistory,
      });

      const reply = { role: "assistant", content: res.data.reply };
      setChatHistory([...updatedHistory, reply]);
    } catch (err) {
      console.error("Chat error:", err);
      setChatHistory([
        ...updatedHistory,
        { role: "assistant", content: "❌ Chat failed." },
      ]);
    }
  };

  const handleExportPDF = () => {
    window.open("http://localhost:5000/export-notes", "_blank");
  };

  return (
    <div className="max-w-4xl mx-auto p-6 font-sans space-y-6 text-gray-800">
      <h1 className="text-3xl font-bold text-center">🧠 AI Document Chat</h1>

      {/* File Upload */}
      <div className="bg-white p-4 shadow rounded space-y-3">
        <label htmlFor="file" className="block font-medium text-lg">📄 Upload a File</label>
        <input
          id="file"
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileUpload}
          className="block w-full border p-2 rounded"
        />
        <p
          className={`text-sm ${
            uploadMessage.includes("❌")
              ? "text-red-600"
              : uploadMessage.includes("✅")
              ? "text-green-600"
              : "text-gray-600"
          }`}
          aria-live="polite"
        >
          {uploadMessage}
        </p>
      </div>

      {/* Notes Display */}
      {formattedNotes && (
        <div className="bg-white p-4 shadow rounded space-y-4">
          <h2 className="text-xl font-semibold">📚 AI-Generated Notes</h2>
          <div className="prose prose-sm text-gray-800">
            <ReactMarkdown>{formattedNotes}</ReactMarkdown>
          </div>

          <div className="flex space-x-4">
            <button
              onClick={handleExportPDF}
              className="bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-800 transition"
            >
              📄 Download Notes as PDF
            </button>

            <button
              onClick={handleGenerateAudio}
              disabled={loadingAudio}
              className={`px-4 py-2 rounded transition ${
                loadingAudio
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              🔊 {loadingAudio ? "Generating Audio..." : "Generate Lecture Audio"}
            </button>
          </div>
        </div>
      )}

      {/* Audio */}
      {audioBase64 && (
        <div className="bg-white p-4 shadow rounded space-y-2">
          <h2 className="text-lg font-semibold">🎧 Lecture Audio</h2>
          <audio controls className="w-full">
            <source src={audioBase64} type="audio/mpeg" />
            Your browser does not support the audio tag.
          </audio>
        </div>
      )}

      {/* Chat */}
      <div className="bg-white p-4 shadow rounded space-y-4">
        <h2 className="text-lg font-semibold">💬 Chat with Document</h2>
        <div
          ref={chatRef}
          className="max-h-64 overflow-y-auto space-y-2 border p-2 rounded bg-gray-50"
        >
          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`p-2 rounded text-sm ${
                msg.role === "user" ? "bg-blue-100" : "bg-green-100"
              }`}
            >
              <strong>{msg.role === "user" ? "You" : "AI"}:</strong> {msg.content}
            </div>
          ))}
        </div>

        <div className="flex mt-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="flex-1 border p-2 rounded-l"
            placeholder="Ask something about the document..."
            onKeyDown={(e) => e.key === "Enter" && handleChat()}
          />
          <button
            onClick={handleChat}
            className="bg-indigo-600 text-white px-4 py-2 rounded-r hover:bg-indigo-700"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
