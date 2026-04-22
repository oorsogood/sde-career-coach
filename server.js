const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");

loadDotEnv(path.join(__dirname, ".env"));

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const APP_NAME = process.env.APP_NAME || "SDE Career Coach";

const SYSTEM_PROMPT = `
You are The SDE Career Negotiator & Communicator, a senior engineering career coach for software engineers.

Your job is to help users handle high-stakes professional communication such as salary negotiation, deadline extension requests, cross-team conflict, performance feedback, and return-offer conversations.

Behavior requirements:
- Give practical, concrete advice instead of generic motivation.
- Ask 1-3 clarifying questions only if missing context blocks a strong answer.
- If enough context exists, answer directly and move the conversation forward.
- Default to a calm, strategic, professional tone.
- Balance assertiveness with diplomacy.
- Respond like a real conversation, not like a long report.
- In most turns, reply in 2-5 sentences only.
- Usually focus on one idea at a time.
- Do not give a full multi-part plan unless the user explicitly asks for it.
- Prefer a short coaching response followed by one useful follow-up question.
- If the user asks for role-play, stay in role and keep each turn brief and natural.
- When useful, provide:
  1. a suggested strategy,
  2. a draft message or script,
  3. a stronger alternative phrasing,
  4. likely pushback and how to respond.
- Translate technical achievements into business impact when relevant.
- For negotiation, ground suggestions in evidence, leverage, timing, and trade-offs.
- For workplace conflict, avoid inflammatory language and focus on shared goals.
- Do not claim legal certainty or HR policy certainty.
- Keep responses concise, clear, and actionable.

Preferred response format:
- Default mode: short conversational reply plus one follow-up question.
- Only use structured sections if the user explicitly asks for a draft, script, bullet list, or full plan.
`.trim();

const EVALUATOR_SYSTEM_PROMPT = `
You are an evaluator agent for a career-coaching assistant designed for software engineers.

Your only job is to read one full conversation transcript and evaluate the assistant's overall performance as a professional career coach.

Evaluate the transcript as a whole. Do not evaluate turn by turn. Base your judgment on the assistant's overall behavior across the entire conversation.

You must evaluate these five criteria:

1. Competence / Expertise
Question: Does the assistant sound knowledgeable about workplace communication and negotiation?

2. Trustworthiness / Integrity
Question: Does the assistant give balanced and responsible advice?

3. Goodwill / Caring
Question: Does the assistant sound supportive and respectful toward the user?

4. Strategic Usefulness
Question: Does the assistant provide practical and actionable suggestions?

5. Role Consistency
Question: Does the assistant consistently act like a professional career coach?

Scoring scale:
- 5 = excellent
- 4 = strong
- 3 = acceptable
- 2 = weak
- 1 = poor

Required output rules:
- Score all five criteria based on the full transcript.
- For each criterion, give one score and one short explanation.
- Explanations should be concise and specific to this transcript.
- Avoid repetitive wording across criteria.
- Do not repeat the same explanation with minor wording changes.
- If one criterion is weaker or stronger than the others, say so clearly.
- Include Overall Score, Major Strength, Major Weakness, and Suggestion for Prompt Improvement.
- Output plain text only.

Use this simple format:

Evaluation Result

1. Competence / Expertise: [score]/5
Reason: [one short transcript-specific sentence]

2. Trustworthiness / Integrity: [score]/5
Reason: [one short transcript-specific sentence]

3. Goodwill / Caring: [score]/5
Reason: [one short transcript-specific sentence]

4. Strategic Usefulness: [score]/5
Reason: [one short transcript-specific sentence]

5. Role Consistency: [score]/5
Reason: [one short transcript-specific sentence]

Overall Score: [score]/5
Major Strength: [one short sentence]
Major Weakness: [one short sentence]
Suggestion for Prompt Improvement: [one short sentence]

Before finishing, check that your answer contains all five numbered criteria and the four summary lines.

Be specific, fair, and grounded in the transcript. Do not evaluate the user. Only evaluate the assistant.
`.trim();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(url.pathname, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Unexpected server error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SDE Career Coach running at ${APP_URL}`);
  console.log(`Open ${APP_URL} in your browser.`);
});

async function handleChat(req, res) {
  const body = await readJsonBody(req);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const mode = body?.mode === "evaluator" ? "evaluator" : "coach";

  if (!GEMINI_API_KEY) {
    sendJson(res, 400, {
      error:
        "Missing GEMINI_API_KEY. Copy .env.example to .env and add your Gemini API key.",
    });
    return;
  }

  const payload = {
    system_instruction: {
      parts: [{ text: mode === "evaluator" ? EVALUATOR_SYSTEM_PROMPT : SYSTEM_PROMPT }],
    },
    contents: messages
      .filter((message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string"
      )
      .slice(-16)
      .map((message, index, filtered) => {
        const isFinalUserMessage =
          mode === "evaluator" &&
          message.role === "user" &&
          index === filtered.length - 1;

        return {
          role: message.role === "assistant" ? "model" : "user",
          parts: [
            {
              text: isFinalUserMessage
                ? `Evaluate the transcript below. You must return all five criteria with scores and explanations, followed by the overall score, major strength, major weakness, and suggestion for prompt improvement.\n\nTranscript:\n${message.content}`
                : message.content,
            },
          ],
        };
      }),
    generationConfig: {
      temperature: mode === "evaluator" ? 0.2 : 0.7,
      maxOutputTokens: mode === "evaluator" ? 1200 : 900,
    },
  };

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const reply = await generateGeminiReply(endpoint, payload);

  if (!reply.ok) {
    sendJson(res, reply.statusCode, {
      error: reply.error,
      raw: reply.raw,
    });
    return;
  }

  if (!reply.text) {
    sendJson(res, 502, { error: "No reply returned by the model." });
    return;
  }

  sendJson(res, 200, { reply: reply.text });
}

async function serveStatic(pathname, res) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.promises.readFile(filePath);
    res.writeHead(200, { "Content-Type": getContentType(filePath) });
    res.end(file);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 1_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/, "$1");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function generateGeminiReply(endpoint, payload) {
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
      "x-goog-api-client": `${APP_NAME} (${APP_URL})`,
    },
    body: JSON.stringify(payload),
  });

  const data = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return {
      ok: false,
      statusCode: upstream.status,
      error: data?.error?.message || data?.message || "Upstream API error.",
      raw: data,
    };
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part?.text || "")
    .join("")
    .trim();

  return {
    ok: true,
    text,
    raw: data,
  };
}
