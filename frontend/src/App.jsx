import React, { useState } from "react";
import axios from "axios";

export default function App() {
  const [file, setFile] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    setFile(uploadedFile);

    const formData = new FormData();
    formData.append("file", uploadedFile);

    try {
      const res = await axios.post("http://localhost:5000/upload", formData);
      setUploadMessage(res.data.message || "File uploaded!");
    } catch (err) {
      console.error("Upload error:", err);
      setUploadMessage("❌ Failed to upload.");
    }
  };

  const handleChat = async () => {
    console.log("🚀 Chat button clicked"); // ✅ Step 2 debug line

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

  const handleGenerateAudio = async () => {
    const lastAssistantMessage = chatHistory
      .slice()
      .reverse()
      .find((msg) => msg.role === "assistant");

    if (!lastAssistantMessage) {
      alert("No assistant response to convert to audio.");
      return;
    }

    try {
      const res = await axios.post(
        "http://localhost:5000/generate-audio",
        { text: lastAssistantMessage.content },
        { responseType: "blob" }
      );

      const url = URL.createObjectURL(new Blob([res.data]));
      setAudioUrl(url);
    } catch (err) {
      console.error("Audio generation error:", err);
      alert("Failed to generate audio.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 font-sans space-y-6">
      <h1 className="text-3xl font-bold text-center">🧠 AI Document Chat</h1>

      <div className="bg-white p-4 shadow rounded space-y-4">
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={handleFileUpload}
          className="block w-full border p-2 rounded"
        />
        {uploadMessage && (
          <p className="text-sm text-gray-600">{uploadMessage}</p>
        )}
      </div>

      <div className="bg-white p-4 shadow rounded space-y-4">
        <h2 className="text-lg font-semibold">💬 Chat with Document</h2>
        <div className="max-h-64 overflow-y-auto space-y-2 border p-2 rounded">
          {chatHistory.map((msg, idx) => (
            <div
              key={idx}
              className={`p-2 rounded ${
                msg.role === "user" ? "bg-blue-100" : "bg-green-100"
              }`}
            >
              <strong>{msg.role === "user" ? "You" : "AI"}:</strong>{" "}
              {msg.content}
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
          />
          <button
            onClick={handleChat}
            className="bg-blue-600 text-white px-4 py-2 rounded-r"
          >
            Send
          </button>
        </div>
      </div>

      <div className="bg-white p-4 shadow rounded">
        <h2 className="text-lg font-semibold mb-2">🔊 Generate Audio</h2>
        <button
          onClick={handleGenerateAudio}
          className="bg-emerald-500 text-white px-4 py-2 rounded"
        >
          Convert last AI reply to Audio
        </button>
        {audioUrl && (
          <audio controls className="mt-4 w-full">
            <source src={audioUrl} type="audio/mpeg" />
            Your browser does not support the audio tag.
          </audio>
        )}
      </div>
    </div>
  );
}
