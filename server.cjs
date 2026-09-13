var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_url = require("url");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_express_rate_limit = __toESM(require("express-rate-limit"), 1);
var import_meta = {};
import_dotenv.default.config();
var __filename = (0, import_url.fileURLToPath)(import_meta.url);
var __dirname = import_path.default.dirname(__filename);
var app = (0, import_express.default)();
var PORT = 3e3;
app.set("trust proxy", 1);
app.use(import_express.default.json({ limit: "100kb" }));
var generalLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 1e3,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down and try again shortly." }
});
app.use("/api/", generalLimiter);
var aiLimiter = (0, import_express_rate_limit.default)({
  windowMs: 60 * 1e3,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI Tutor is receiving a lot of requests right now. Please wait a moment and try again." }
});
app.use("/api/gemini/", aiLimiter);
var NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
var NVIDIA_MODEL = process.env.NVIDIA_MODEL || "moonshotai/kimi-k3";
function getNvidiaKey() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey === "MY_NVIDIA_API_KEY") return null;
  return apiKey;
}
async function callNvidia(messages, opts = {}) {
  const apiKey = getNvidiaKey();
  if (!apiKey) throw new Error("NVIDIA_API_KEY not configured");
  const response = await fetch(NVIDIA_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages,
      max_tokens: opts.max_tokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      stream: false,
      ...opts.json ? { response_format: { type: "json_object" } } : {}
    })
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`NVIDIA API error ${response.status}: ${errText.slice(0, 300)}`);
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("NVIDIA API returned no content");
  return text;
}
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(getNvidiaKey())
  });
});
app.get("/api/wikipedia/summary", async (req, res) => {
  const title = req.query.title?.trim();
  if (!title) {
    return res.status(400).json({ error: "Title parameter is required" });
  }
  try {
    const formattedTitle = encodeURIComponent(title.replace(/\s+/g, "_"));
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${formattedTitle}`;
    const response = await fetch(wikiUrl, {
      headers: {
        "User-Agent": "MFOSS-Education-App/1.0 (https://ais-dev.run.app; student-learning@mfoss.mw)",
        "Accept": "application/json"
      }
    });
    if (!response.ok) {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(title)}&limit=1&namespace=0&format=json`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          "User-Agent": "MFOSS-Education-App/1.0 (student-learning@mfoss.mw)"
        }
      });
      const searchData = await searchRes.json();
      if (searchData && searchData[1] && searchData[1][0]) {
        const altTitle = encodeURIComponent(searchData[1][0].replace(/\s+/g, "_"));
        const altResponse = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${altTitle}`, {
          headers: {
            "User-Agent": "MFOSS-Education-App/1.0 (student-learning@mfoss.mw)",
            "Accept": "application/json"
          }
        });
        if (altResponse.ok) {
          const altData = await altResponse.json();
          return res.json(altData);
        }
      }
      return res.status(404).json({
        title,
        extract: `Information about "${title}" is available in the secondary school syllabus. Use the AI Tutor or search specific subtopics.`,
        description: "Subject reference topic"
      });
    }
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    console.error("Wikipedia API error:", err.message);
    return res.status(500).json({
      title,
      extract: `Could not retrieve Wikipedia content at this moment. Please check the curriculum notes or ask the AI Tutor.`,
      description: "Subject reference"
    });
  }
});
app.get("/api/wikipedia/search", async (req, res) => {
  const query = req.query.q?.trim();
  if (!query) {
    return res.status(400).json({ results: [] });
  }
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=6&namespace=0&format=json`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "MFOSS-Education-App/1.0 (student-learning@mfoss.mw)"
      }
    });
    if (!response.ok) {
      return res.json({ results: [] });
    }
    const data = await response.json();
    const titles = data[1] || [];
    const descriptions = data[2] || [];
    const urls = data[3] || [];
    const results = titles.map((title, index) => ({
      title,
      description: descriptions[index] || "",
      url: urls[index] || ""
    }));
    return res.json({ results });
  } catch (err) {
    console.error("Wikipedia search error:", err.message);
    return res.json({ results: [] });
  }
});
var CURATED_VIDEOS = {
  Mathematics: [
    { id: "kpCJyQ25J48", title: "Algebra Basics: What Is Algebra? - Math Antics", channel: "Math Antics", duration: "11:20", topic: "Algebra" },
    { id: "LwCRRUa8yTU", title: "Introduction to Geometry & Angles", channel: "Khan Academy", duration: "8:45", topic: "Geometry and measurement" },
    { id: "sx9e_aT5e70", title: "Statistics: Mean, Median, Mode & Range", channel: "Math Antics", duration: "9:54", topic: "Statistics and graphs" },
    { id: "Wf2qO3W_l34", title: "Fractions, Decimals and Percentages", channel: "Cognito", duration: "7:12", topic: "Number concepts" },
    { id: "bAerID24QJg", title: "Simultaneous Equations: Elimination & Substitution", channel: "The Organic Chemistry Tutor", duration: "14:15", topic: "Algebra" },
    { id: "7K57qA_gLHQ", title: "Pythagorean Theorem and Trigonometry Basics", channel: "Khan Academy", duration: "10:30", topic: "Geometry and measurement" }
  ],
  English: [
    { id: "89_Z1VvV0c8", title: "How to write a solid English Essay / Composition", channel: "Learn English with Emma", duration: "12:40", topic: "Writing and composition" },
    { id: "0Wrv_ZviMEc", title: "English Grammar: Parts of Speech Overview", channel: "Grammar Monster", duration: "8:25", topic: "Grammar and vocabulary" },
    { id: "qf25W5e_E8g", title: "Reading Comprehension Strategies for Exams", channel: "English Heritage", duration: "11:15", topic: "Reading comprehension" },
    { id: "wY8Z1eO4xHQ", title: "Figures of Speech: Metaphor, Simile, Personification", channel: "TED-Ed", duration: "6:50", topic: "Literature and examination practice" }
  ],
  Biology: [
    { id: "8IlzKri08kk", title: "Introduction to Cells: The Grand Cell Tour", channel: "Amoeba Sisters", duration: "9:27", topic: "Cell and organism basics" },
    { id: "gG7uCskUOrA", title: "Photosynthesis and Plant Nutrition", channel: "CrashCourse", duration: "13:15", topic: "Nutrition" },
    { id: "C38B3392i1U", title: "Circulatory System and Heart Blood Flow", channel: "Cognito", duration: "8:50", topic: "Transport and respiration" },
    { id: "8m6hHRlKwxY", title: "DNA, Chromosomes, Genes, and Traits", channel: "Amoeba Sisters", duration: "8:18", topic: "Reproduction and heredity" },
    { id: "izRvPaAWgyw", title: "Ecosystems and Food Webs: Ecology Basics", channel: "CrashCourse", duration: "10:05", topic: "Ecology and health" }
  ],
  Chemistry: [
    { id: "bka20Q9TN6M", title: "States of Matter & Particle Theory", channel: "Cognito", duration: "5:30", topic: "Matter and particles" },
    { id: "7qOFt_XFfV8", title: "Periodic Table Explained: Metals, Non-metals, Groups", channel: "CrashCourse Chemistry", duration: "11:22", topic: "Matter and particles" },
    { id: "an3mYV8Lw-8", title: "Acids, Bases and the pH Scale Explained", channel: "Free Animated Education", duration: "7:45", topic: "Acids, bases and salts" },
    { id: "2S6e11NBwiw", title: "Balancing Chemical Equations Step by Step", channel: "Tyler DeWitt", duration: "12:10", topic: "Chemical reactions" },
    { id: "5iTOphGnCtg", title: "Stoichiometry & The Mole Concept", channel: "Tyler DeWitt", duration: "10:35", topic: "Stoichiometry foundations" }
  ],
  Physics: [
    { id: "ZM8ECpBuQYE", title: "Newton's Laws of Motion Explained with Real Examples", channel: "CrashCourse Physics", duration: "10:45", topic: "Measurement and motion" },
    { id: "i9A_Jqj6gVo", title: "Work, Energy, and Power: Kinetic vs Potential", channel: "The Organic Chemistry Tutor", duration: "12:20", topic: "Forces and energy" },
    { id: "mc979OhitAg", title: "Electric Circuits: Current, Voltage & Ohm's Law", channel: "Cognito", duration: "8:40", topic: "Electricity and magnetism" },
    { id: "CVsdXKO9xlk", title: "Light Waves, Reflection, and Refraction", channel: "CrashCourse", duration: "9:15", topic: "Waves and practical physics" }
  ],
  Geography: [
    { id: "6v2L2UGZJAM", title: "Plate Tectonics, Earthquakes and Volcanoes", channel: "CrashCourse Geography", duration: "10:55", topic: "Physical geography" },
    { id: "e_v5f9m_mQc", title: "How to Read Topographical Maps & Contours", channel: "Geography Lessons", duration: "8:30", topic: "Map skills" },
    { id: "JgQ87M3f33E", title: "Weather and Climate: The Water Cycle & Rainfall", channel: "National Geographic", duration: "7:40", topic: "Physical geography" },
    { id: "8fL1u1r_cOw", title: "Geography of East & Southern Africa: Lakes and Rift Valley", channel: "Atlas Geography", duration: "11:15", topic: "Economic activities" }
  ],
  History: [
    { id: "r_8y_7kL1pU", title: "Kingdom of Maravi and Pre-colonial Central Africa", channel: "African History Channel", duration: "14:20", topic: "Malawi history" },
    { id: "24_x2_1kL88", title: "The Scramble for Africa & Colonialism", channel: "CrashCourse World History", duration: "11:45", topic: "Colonialism and independence" },
    { id: "w9K1w8K_5lA", title: "The Road to Independence in Malawi: Dr. Hastings Kamuzu Banda", channel: "History of Africa", duration: "13:10", topic: "Colonialism and independence" }
  ],
  Agriculture: [
    { id: "Ba8_l_7pQ3w", title: "Soil Types, Soil Fertility, and pH Management", channel: "AgriEd Africa", duration: "9:50", topic: "Soil and water management" },
    { id: "c77qR14P77w", title: "Maize Production & Post-Harvest Storage in Africa", channel: "Farming Systems", duration: "12:30", topic: "Crop production" },
    { id: "p0_21Q9xT88", title: "Livestock Management: Poultry, Cattle and Goats", channel: "Farmer Training", duration: "10:15", topic: "Livestock" }
  ],
  "Computer Studies": [
    { id: "AkFi9WKD06E", title: "Computer Hardware & Inside the System Unit", channel: "CrashCourse Computer Science", duration: "10:30", topic: "Computer fundamentals" },
    { id: "xf8K4p5l18g", title: "How Computers and Operating Systems Work", channel: "Khan Academy Computing", duration: "8:55", topic: "Operating systems" },
    { id: "7_LPdttKXPc", title: "How the Internet Works and Cybersecurity Basics", channel: "Code.org", duration: "6:20", topic: "Internet and digital citizenship" }
  ],
  Chichewa: [
    { id: "mQ4_w5w_K3E", title: "Phunzirani Chichewa: Malangizo a kalembedwe ka Chichewa", channel: "Malawi Ed", duration: "11:00", topic: "Grammar" },
    { id: "w8_9kL1p4oQ", title: "Ziyankhulo ndi Mwambo wa Chichewa m'Malawi", channel: "Chichewa Heritage", duration: "13:25", topic: "Literature" }
  ]
};
app.get("/api/youtube/search", (req, res) => {
  const subject = req.query.subject || "Mathematics";
  const topic = req.query.topic || "";
  const query = req.query.q || "";
  const list = CURATED_VIDEOS[subject] || CURATED_VIDEOS["Mathematics"];
  let filtered = list;
  if (topic) {
    const topicLower = topic.toLowerCase();
    const matched = list.filter((v) => v.topic.toLowerCase().includes(topicLower) || v.title.toLowerCase().includes(topicLower));
    if (matched.length > 0) {
      filtered = matched;
    }
  }
  const dynamicResults = [...filtered];
  if (query && !filtered.some((v) => v.title.toLowerCase().includes(query.toLowerCase()))) {
    dynamicResults.unshift({
      id: "search_placeholder",
      title: `${query} - Educational Video Lesson`,
      channel: "Curated Secondary Education",
      duration: "10:00",
      topic: topic || subject
    });
  }
  return res.json({
    subject,
    topic,
    videos: dynamicResults
  });
});
var ALLOWED_MODES = /* @__PURE__ */ new Set(["chat", "explain", "step_by_step", "chichewa_help", "exam_tips"]);
var MAX_MESSAGES = 20;
var MAX_MESSAGE_LEN = 4e3;
app.post("/api/gemini/tutor", async (req, res) => {
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages = rawMessages.slice(-MAX_MESSAGES).filter((m) => m && (m.role === "user" || m.role === "model") && typeof m.content === "string").map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LEN) }));
  const context = req.body?.context || {};
  const mode = ALLOWED_MODES.has(req.body?.mode) ? req.body.mode : "chat";
  const form = clampForm(context.form);
  const subject = clampString(context.subject, 60, "General Science");
  const topic = clampString(context.topic, 120, "Core Syllabus");
  if (!getNvidiaKey()) {
    return res.json({
      text: `Hello! I am Tutor M-FOSS, your Malawi Secondary School AI Study Companion.

Currently, the AI Tutor is in offline mode because the \`NVIDIA_API_KEY\` secret is not yet attached. 

**To help you right away:**
- Form ${form} **${subject}** (${topic}) focuses on foundational understanding and examination readiness.
- Check out the **Wikipedia Reference** tab below for detailed academic definitions.
- Watch the **YouTube Video Lessons** to see visual step-by-step demonstrations.
- You can also take practice quizzes in the **Assessments** tab!

*(Once NVIDIA_API_KEY is configured, full interactive conversational AI will be activated!)*`
    });
  }
  try {
    let modeInstruction = "";
    if (mode === "explain") {
      modeInstruction = "Provide a crystal clear, intuitive explanation of the topic suitable for a Form " + form + " student. Use everyday examples from Malawi or East Africa where applicable (e.g. Lake Malawi, local agriculture, daily life). Use bold headers and bullet points.";
    } else if (mode === "step_by_step") {
      modeInstruction = "Break down the solution or concept into numbered, step-by-step instructions. Explain 'why' behind each step so the learner truly understands.";
    } else if (mode === "chichewa_help") {
      modeInstruction = "Explain the concepts in both English and clear Chichewa terms where helpful, ensuring the learner grasps the meaning without losing academic terminology.";
    } else if (mode === "exam_tips") {
      modeInstruction = "Give specific MANEB examination advice, common student traps/mistakes, and key marking points for Junior Certificate of Education (JCE - Forms 1-2) or Malawi School Certificate of Education (MSCE - Forms 3-4).";
    }
    const systemInstruction = `You are "Tutor M-FOSS", an expert, warm, and highly knowledgeable secondary school tutor for Malawi Free Online Secondary School (M-FOSS).
The student is in Form ${form} studying "${subject}" (Topic: "${topic}").
Target Curriculum: Malawi National Curriculum (MIE - Malawi Institute of Education, MANEB examination standards for JCE Forms 1-2 and MSCE Forms 3-4).

Guidelines:
1. Speak in a patient, respectful, encouraging, and clear tone.
2. Structure answers with clean headings, short paragraphs, and bullet points.
3. When solving math or science problems, write out formulas and units cleanly.
4. If asked in Chichewa or for Chichewa explanation, provide helpful bilingual clarity.
5. ${modeInstruction}
6. Keep formatting clean and readable using standard Markdown.`;
    const formattedContents = (messages || []).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content
    }));
    if (formattedContents.length === 0) {
      formattedContents.push({
        role: "user",
        content: `Hello! Can you help me study ${subject} - ${topic} for Form ${form}?`
      });
    }
    const chatMessages = [{ role: "system", content: systemInstruction }, ...formattedContents];
    const outputText = await callNvidia(chatMessages, { temperature: 0.7 });
    return res.json({ text: outputText || "I am ready to help you with your studies. What topic would you like to explore?" });
  } catch (err) {
    console.error("NVIDIA tutor error:", err);
    return res.status(500).json({
      error: "Failed to generate AI tutor response",
      text: "Sorry, I had a brief issue connecting to the AI Tutor service. Please try asking again in a moment."
    });
  }
});
function clampString(value, maxLen, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.trim().slice(0, maxLen);
}
function clampForm(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 4) return 1;
  return n;
}
app.post("/api/gemini/quiz", async (req, res) => {
  const form = clampForm(req.body?.form);
  const subject = clampString(req.body?.subject, 60, "Mathematics");
  const topic = clampString(req.body?.topic, 120, "General");
  if (!getNvidiaKey()) {
    const fallbackQuizzes = [
      {
        question: `In Form ${form} ${subject} (${topic}), which of the following best describes the core principle?`,
        options: [
          "Understanding foundational rules and applying them systematically",
          "Memorizing answers without understanding underlying concepts",
          "Skipping unit conversions and step derivations",
          "Only reviewing past papers on the morning of the exam"
        ],
        correctIndex: 0,
        explanation: "Mastering foundational concepts and applying systematic methods is key to passing MANEB JCE/MSCE examinations.",
        hint: "Think about structured problem-solving."
      },
      {
        question: `What is the standard procedure when answering questions in ${subject}?`,
        options: [
          "State given information, write formula, show working, and state final units",
          "Only write the final number without working",
          "Write the response in pencil only",
          "Leave challenging sections completely blank"
        ],
        correctIndex: 0,
        explanation: "Examiners award step-marks for correct formulas, intermediate substitutions, and proper units.",
        hint: "Method marks are critical."
      },
      {
        question: `Which study method is most effective for retaining ${subject} topics?`,
        options: [
          "Active recall, solving varied practice problems, and explaining concepts",
          "Cramming all notes the night before the examination",
          "Highlighting every sentence in the textbook with bright markers",
          "Relying solely on memory without writing practice"
        ],
        correctIndex: 0,
        explanation: "Active retrieval practice and varied problem-solving lead to durable memory retention.",
        hint: "Active engagement beats passive reading."
      },
      {
        question: `When preparing for MANEB assessments in ${subject}, what should you review frequently?`,
        options: [
          "Curriculum objectives, past paper questions, and teacher feedback",
          "Only social media study groups",
          "Outdated non-aligned foreign syllabi without reference to MIE",
          "Only topics you already find easy"
        ],
        correctIndex: 0,
        explanation: "MIE syllabus learning outcomes and MANEB past questions give direct alignment with exam expectations.",
        hint: "Align with syllabus outcomes."
      },
      {
        question: `Why is time management essential during a ${subject} secondary school examination?`,
        options: [
          "It ensures you can attempt all required sections and review answers before time expires",
          "It allows you to finish in 10 minutes and leave early",
          "It is only required for multiple choice questions",
          "Time management has no impact on total marks"
        ],
        correctIndex: 0,
        explanation: "Pacing yourself prevents getting stuck on a single difficult question and leaving easy marks behind.",
        hint: "Budget minutes per mark."
      }
    ];
    return res.json({ questions: fallbackQuizzes });
  }
  try {
    const prompt = `Generate a high quality, 5-question multiple choice test for Malawi Secondary School Form ${form} students studying ${subject}, topic: "${topic}".
Align questions with the Malawi Institute of Education (MIE) syllabus and MANEB exam style (JCE for Forms 1-2, MSCE for Forms 3-4).
Make each question realistic, educational, with 4 distinct options, an accurate correct index (0-3), an educational explanation, and a helpful hint.

Respond with ONLY a raw JSON object (no markdown fences, no commentary) of the exact shape:
{"questions": [{"question": string, "options": [string, string, string, string], "correctIndex": number, "explanation": string, "hint": string}, ... (5 total)]}`;
    const raw = await callNvidia(
      [
        { role: "system", content: "You are a senior MANEB examination specialist and teacher in Malawi. Generate accurate, clear, multiple-choice questions. You always respond with strictly valid JSON and nothing else." },
        { role: "user", content: prompt }
      ],
      { temperature: 0.6, json: true }
    );
    let questions = [];
    try {
      const cleaned = raw.trim().replace(/^```json\s*|```$/g, "");
      const parsed = JSON.parse(cleaned);
      questions = Array.isArray(parsed) ? parsed : parsed.questions || [];
    } catch (parseErr) {
      console.error("Quiz JSON parse error:", parseErr, raw.slice(0, 300));
    }
    return res.json({ questions });
  } catch (err) {
    console.error("NVIDIA quiz error:", err);
    return res.status(500).json({ error: "Failed to generate quiz", questions: [] });
  }
});
app.post("/api/gemini/summary", async (req, res) => {
  const form = clampForm(req.body?.form);
  const subject = clampString(req.body?.subject, 60, "Mathematics");
  const topic = clampString(req.body?.topic, 120, "General");
  if (!getNvidiaKey()) {
    return res.json({
      summary: `### Quick Study Guide: ${subject} - ${topic} (Form ${form})

**Core Learning Objectives:**
- Understand fundamental definitions and key terminology in **${topic}**.
- Apply principles to solve standard examination problems.
- Connect practical real-world applications in Malawi and everyday science.

**Key Formula / Rule of Thumb:**
Always show step-by-step working and state appropriate units.

*Attach your NVIDIA_API_KEY to generate customized AI-powered revision sheets with interactive diagrams and past paper tips.*`
    });
  }
  try {
    const prompt = `Create a concise, high-yield study revision summary for Form ${form} students in Malawi studying "${subject}", topic: "${topic}".
Include:
1. Key Definitions & Core Concepts (bullet points)
2. Important Formulas, Rules or Steps to remember
3. Common Examination Pitfalls (what students often lose marks on in MANEB exams)
4. 3 Quick Self-Check Questions for Revision`;
    const summaryText = await callNvidia(
      [
        { role: "system", content: "You are an experienced secondary school instructor preparing concise, top-scoring revision sheets." },
        { role: "user", content: prompt }
      ],
      { temperature: 0.5 }
    );
    return res.json({ summary: summaryText || "Summary generated." });
  } catch (err) {
    console.error("NVIDIA summary error:", err);
    return res.status(500).json({ error: "Failed to generate summary", summary: "Unable to generate summary notes." });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
