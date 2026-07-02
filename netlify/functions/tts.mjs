const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const MAX_INPUT_CHARS = 3000;
const ALLOWED_VOICES = new Set(["marin", "cedar", "coral", "shimmer", "nova", "sage"]);
const ALLOWED_PRESETS = new Set(["bella", "news", "bedtime", "lecture"]);

const PRESET_INSTRUCTIONS = {
  bella: "Speak as a warm, calm, natural female narrator. Use gentle emotional variation, clear phrasing, unhurried pacing, and brief natural pauses. Avoid sounding theatrical, robotic, overly cheerful, or breathy. This is a Bella-style delivery but not an imitation of any real person.",
  news: "Speak as a polished professional news anchor. Use confident pacing, crisp pronunciation, restrained emotion, and short pauses between topics. Avoid hype and dramatic emphasis.",
  bedtime: "Speak softly and reassuringly at a slow, steady pace. Use longer natural pauses, low intensity, smooth transitions, and no sudden emphasis. The goal is relaxation and sleep.",
  lecture: "Speak as an engaging expert lecturer. Use clear structure, measured emphasis, natural pacing, and thoughtful pauses after important ideas. Sound conversational rather than scripted."
};

const rateBuckets = new Map();

export async function handler(event) {
  const origin = event.headers?.origin || "";
  const cors = corsHeaders(origin);

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed." }, cors);
  }

  if (!isAllowedOrigin(origin)) {
    return json(403, { error: "This voice service is not authorized for that site." }, cors);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(503, { error: "The secure voice server is not configured with OPENAI_API_KEY." }, cors);
  }

  const clientIp = event.headers?.["x-nf-client-connection-ip"]
    || event.headers?.["x-forwarded-for"]?.split(",")[0]?.trim()
    || "unknown";

  if (!withinRateLimit(clientIp)) {
    return json(429, { error: "Too many voice requests. Try again shortly." }, cors);
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Invalid request body." }, cors);
  }

  const input = String(body.input || "").trim();
  const voice = ALLOWED_VOICES.has(body.voice) ? body.voice : "marin";
  const preset = ALLOWED_PRESETS.has(body.preset) ? body.preset : "bella";
  const speed = clamp(Number(body.speed || 0.96), 0.8, 1.15);

  if (!input) {
    return json(400, { error: "No text was provided." }, cors);
  }

  if (input.length > MAX_INPUT_CHARS) {
    return json(413, { error: `Text section exceeds ${MAX_INPUT_CHARS} characters.` }, cors);
  }

  try {
    const response = await fetch(OPENAI_SPEECH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice,
        input,
        instructions: PRESET_INSTRUCTIONS[preset],
        response_format: "aac",
        speed
      })
    });

    if (!response.ok) {
      const detail = await safeOpenAIError(response);
      const status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
      return json(status, { error: detail }, cors);
    }

    const audio = Buffer.from(await response.arrayBuffer());
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...cors,
        "Content-Type": "audio/aac",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      },
      body: audio.toString("base64")
    };
  } catch (error) {
    console.error("TTS request failed", error);
    return json(502, { error: "The neural voice service could not generate audio." }, cors);
  }
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const configured = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);

  const defaults = [
    "https://pcal3278-blip.github.io",
    "http://localhost:8888",
    "http://127.0.0.1:8888"
  ];

  if (configured.includes(origin) || defaults.includes(origin)) return true;
  return /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/i.test(origin)
    || /^https:\/\/[a-z0-9-]+\.netlify\.app$/i.test(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) && origin ? origin : "https://pcal3278-blip.github.io",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

function withinRateLimit(key) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const limit = 40;
  const bucket = rateBuckets.get(key) || { start: now, count: 0 };

  if (now - bucket.start > windowMs) {
    bucket.start = now;
    bucket.count = 0;
  }

  bucket.count += 1;
  rateBuckets.set(key, bucket);
  return bucket.count <= limit;
}

async function safeOpenAIError(response) {
  try {
    const data = await response.json();
    const message = data?.error?.message || "OpenAI speech generation failed.";
    if (/api key|authentication/i.test(message)) return "The secure voice server has an API-key configuration problem.";
    if (/quota|billing|credit/i.test(message)) return "The neural voice account needs API billing or additional credit.";
    if (response.status === 429) return "The neural voice service is temporarily rate-limited.";
    return message.slice(0, 240);
  } catch {
    return "OpenAI speech generation failed.";
  }
}

function json(statusCode, payload, headers) {
  return {
    statusCode,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(payload)
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0.96;
  return Math.min(max, Math.max(min, value));
}
