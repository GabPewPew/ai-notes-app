import { useState } from "react";
import axios from "axios";

function App() {
  const [input, setInput] = useState("");
  const [summary, setSummary] = useState("");
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const ELEVEN_API = import.meta.env.VITE_ELEVEN_API_KEY;
  const VOICE_ID = import.meta.env.VITE_ELEVEN_VOICE_ID;

  // Call Gemini to summarize
  const handleSummarize = async () => {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${API_KEY}`,
        {
          contents: [
            {
              parts: [{ text: `Summarize this:\n\n${input}` }],
            },
          ],
        }
      );

      const output = res.data.candidates?.[0]?.content?.parts?.[0]?.text || "No summary found.";
      setSummary(output);
    } catch (err) {
      console.error("Gemini error:", err);
      setSummary("Something went wrong.");
    }
  };

  // 🆕 Convert summary to audio and play it
  const handlePlayAudio = async () => {
    if (!summary) return alert("No summary to play!");
  
    try {
      setIsLoadingAudio(true); // ✅ Start showing "Loading..."
  
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: "POST",
        headers: {
          "xi-api-key": ELEVEN_API,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: summary,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });
  
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
    } catch (error) {
      console.error("Audio error:", error);
      alert("Failed to play audio.");
    } finally {
      setIsLoadingAudio(false); // ✅ Hide "Loading..." no matter what
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f9fafb",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "4rem 1rem",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.05)",
          padding: "2rem",
          maxWidth: "700px",
          width: "100%",
        }}
      >
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: "600",
            marginBottom: "1.5rem",
            textAlign: "center",
            color: "#111827",
          }}
        >
          ✨ AI Note Summarizer + Voice
        </h1>

        <textarea
          placeholder="Paste your notes here..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            width: "100%",
            height: "200px",
            fontSize: "1rem",
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            resize: "vertical",
            fontFamily: "inherit",
            marginBottom: "1.5rem",
          }}
        />

        <button
          onClick={handleSummarize}
          style={{
            width: "100%",
            padding: "0.75rem",
            fontSize: "1rem",
            fontWeight: "600",
            color: "white",
            backgroundColor: "#3b82f6",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "background-color 0.2s",
            marginBottom: "1rem",
          }}
          onMouseOver={(e) => (e.target.style.backgroundColor = "#2563eb")}
          onMouseOut={(e) => (e.target.style.backgroundColor = "#3b82f6")}
        >
          Summarize ✍️
        </button>

        {summary && (
          <div
            style={{
              marginTop: "1rem",
              backgroundColor: "#f3f4f6",
              padding: "1rem",
              borderRadius: "8px",
              whiteSpace: "pre-wrap",
              fontSize: "1rem",
              color: "#111827",
            }}
          >
            <strong>Summary:</strong>
            <p>{summary}</p>
            {/* ✅ Loading Message */}
    {isLoadingAudio && (
      <p style={{ fontStyle: "italic", color: "#6b7280", marginTop: "1rem" }}>
        Loading audio… 🔄
      </p>
    )}

            {/* 🆕 Listen Button */}
            <button
              onClick={handlePlayAudio}
              style={{
                marginTop: "1rem",
                backgroundColor: "#10b981",
                color: "white",
                border: "none",
                padding: "0.5rem 1rem",
                fontSize: "1rem",
                fontWeight: "bold",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              🔊 Listen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;