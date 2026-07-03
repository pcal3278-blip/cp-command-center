const OPENAI_SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const MAX_INPUT_CHARS = 2800;
const ALLOWED_VOICES = new Set(["marin", "cedar", "coral", "shimmer", "nova", "sage"]);
const ALLOWED_PRESETS = new Set(["bella", "news", "bedtime", "lecture"]);

const PRESET_INSTRUCTIONS = {
  bella: "Speak as a warm, calm, natural female narrator. Use gentle emotional variation, clear phrasing, unhurried pacing, and brief natural pauses. Avoid sounding theatrical, robotic, overly cheerful, or breathy. This is a Bella-style delivery but not an imitation of any real person.",
  news: "Speak as a polished professional news anchor. Use confident pacing, crisp pronunciation, restrained emotion, and short pauses between topics. Avoid hype and dramatic emphasis.",
  bedtime: "Speak softly and reassuringly at a slow, steady pace. Use longer natural pauses, low intensity, smooth transitions, and no sudden emphasis. The goal is relaxation and sleep.",
  lecture: "Speak as an engaging expert lecturer. Use clear structure, measured emphasis, natural pacing, and thoughtful pauses after important ideas. Sound conversational rather than scripted."
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = request.headers.get("Origin") || "";
  const cors = corsHeaders(origin, url.origin);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (request.method === "GET") {
    return json({
      ok: true,
      configured: Boolean(env.OPENAI_API_KEY),
      service: "CP Command Center secure voice"
    }, env.OPENAI_API_KEY ? 200 : 503, cors);
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, cors);
  }

  if (origin && origin !== url.origin) {
    return json({ error: "This voice service is only available to the CP Command Center site." }, 403, cors);
  }

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    return json({ error: "OPENAI_API_KEY is not configured in Cloudflare Pages." }, 503, cors);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400, cors);
  }

  const input = String(body.input || "").trim();
  const voice = ALLOWED_VOICES.has(body.voice) ? body.voice : "marin";
  const preset = ALLOWED_PRESETS.has(body.preset) ? body.preset : "bella";
  const speed = clamp(Number(body.speed || 0.96), 0.8, 1.15);

  if (!input) {
    return json({ error: "No text was provided." }, 400, cors);
  }

  if (input.length > MAX_INPUT_CHARS) {
    return json({ error: `Text section exceeds ${MAX_INPUT_CHARS} characters.` }, 413, cors);
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
      return json({ error: detail }, status, cors);
    }

    const headers = new Headers(cors);
    headers.set("Content-Type", response.headers.get("Content-Type") || "audio/aac");
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    console.error("TTS request failed", error);
    return json({ error: "The neural voice service could not generate audio." }, 502, cors);
  }
}

function corsHeaders(origin, siteOrigin) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", origin && origin === siteOrigin ? origin : siteOrigin);
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Vary", "Origin");
  return headers;
}

function json(payload, status, baseHeaders) {
  const headers = new Headers(baseHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(payload), { status, headers });
}

async function safeOpenAIError(response) {
  try {
    const data = await response.json();
    const message = data?.error?.message || "OpenAI speech generation failed.";
    if (/api key|authentication/i.test(message)) return "The secure voice server has an API-key configuration problem.";
    if (/quota|billing|credit/i.test(message)) return "The neural voice account needs API billing or additional credit.";
    if (response.status === 429) return "The neural voice service is temporarily rate-limited.";
    return String(message).slice(0, 240);
  } catch {
    return "OpenAI speech generation failed.";
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return 0.96;
  return Math.min(max, Math.max(min, value));
}
