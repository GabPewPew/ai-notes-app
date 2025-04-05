function getClassificationPrompt(text) {
    return `Please classify the following text as either "STEM" or "Language-based". Only reply with one word: STEM or LANGUAGE.\n\n${text}`;
  }
  
  function getNotesPrompt(text, category) {
    return `
  You are a study note formatting assistant. Please convert the following content into clear, structured, and highly readable study notes.
  
  Requirements:
  - Base your notes STRICTLY on the text provided below.
  - DO NOT invent or assume any content beyond what's in the text.
  - Use professional markdown formatting.
  - Use clear section headings (e.g., ## Diagnosis).
  - Use bullet points (-) or numbered lists for clarity.
  - Avoid asterisks (*), emojis, or informal tone.
  
  Input Text:
  ${text}
    `;
  }
  
  function getLecturePrompt(notes) {
    return `You are a university professor giving a concise spoken lecture to students.
  
  Turn the following notes into a clear, natural-sounding lecture script.
  
  ✅ Stay within 3000–3500 characters (roughly 3–5 paragraphs).
  ✅ Use simple explanations, short sentences, and smooth transitions.
  ✅ Do NOT list bullet points — this should sound like a human talking.
  
  Here are the notes:
  ${notes}`;
  }
  
  module.exports = {
    getClassificationPrompt,
    getNotesPrompt,
    getLecturePrompt,
  };
  