(() => {
  "use strict";

  const BUILD = "5.3.1";
  const ENDPOINT_KEY = "cpCommandCenter.neuralVoiceEndpoint";
  const SETTINGS_KEY = "cpCommandCenter.neuralVoiceSettings";
  const DEFAULT_ENDPOINT = "/api/tts";
  const MAX_CHUNK_CHARS = 2400;

  const PRESETS = {
    bella: {
      label: "Bella Calm",
      voice: "marin",
      speed: 0.95,
      description: "Warm, calm and natural with gentle emotion and deliberate pauses."
    },
    news: {
      label: "News Anchor",
      voice: "marin",
      speed: 1.0,
      description: "Clear professional delivery with confident pacing and restrained emotion."
    },
    bedtime: {
      label: "Bedtime",
      voice: "shimmer",
      speed: 0.88,
      description: "Soft, reassuring and slow with longer pauses and no sudden emphasis."
    },
    lecture: {
      label: "Lecture",
      voice: "cedar",
      speed: 0.98,
      description: "Engaging explanatory delivery with clear phrasing and measured emphasis."
    }
  };

  let chunks = [];
  let audioUrls = [];
  let currentIndex = 0;
  let stopped = true;
  let prefetchPromise = null;
  let activeAudio = null;

  const ready = document.readyState === "loading"
    ? new Promise(resolve => document.addEventListener("DOMContentLoaded", resolve, { once: true }))
    : Promise.resolve();

  ready.then(init);

  function init() {
    const readerMain = document.querySelector(".reader-main");
    const readerText = document.querySelector("#readerText");
    if (!readerMain || !readerText || document.querySelector("#neuralReaderPanel")) return;

    injectStyles();
    const settings = loadSettings();

    const panel = document.createElement("section");
    panel.id = "neuralReaderPanel";
    panel.className = "neural-reader-panel";
    panel.innerHTML = `
      <div class="neural-reader-heading">
        <div>
          <p class="eyebrow">CP Human Voice</p>
          <h3>Neural Reader</h3>
        </div>
        <span class="neural-badge">Build ${BUILD}</span>
      </div>
      <p id="neuralVoiceStatus" class="neural-status">Checking the secure voice connection…</p>
      <div class="neural-settings">
        <label>Style
          <select id="neuralPreset">
            ${Object.entries(PRESETS).map(([value, preset]) => `<option value="${value}">${preset.label}</option>`).join("")}
          </select>
        </label>
        <label>Voice
          <select id="neuralVoice">
            <option value="marin">Marin — recommended</option>
            <option value="cedar">Cedar — recommended</option>
            <option value="coral">Coral</option>
            <option value="shimmer">Shimmer</option>
            <option value="nova">Nova</option>
            <option value="sage">Sage</option>
          </select>
        </label>
        <label>Speed
          <select id="neuralSpeed">
            <option value="0.85">0.85×</option>
            <option value="0.88">0.88×</option>
            <option value="0.9">0.90×</option>
            <option value="0.95">0.95×</option>
            <option value="0.98">0.98×</option>
            <option value="1">1.00×</option>
            <option value="1.05">1.05×</option>
            <option value="1.1">1.10×</option>
          </select>
        </label>
      </div>
      <div class="neural-controls">
        <button id="neuralPlay" type="button">🎙 Generate & Play</button>
        <button id="neuralPause" type="button">⏸ Pause</button>
        <button id="neuralResume" type="button">▶ Resume</button>
        <button id="neuralStop" type="button">■ Stop</button>
        <button id="neuralRestart" type="button">↺ Restart</button>
      </div>
      <progress id="neuralProgress" max="100" value="0"></progress>
      <p id="neuralSection" class="neural-section">Section 0 of 0</p>
      <audio id="neuralAudio" controls playsinline preload="auto"></audio>
      <details class="neural-advanced">
        <summary>Secure voice connection</summary>
        <label>Voice service URL
          <input id="neuralEndpoint" type="text" inputmode="url" value="${escapeAttribute(settings.endpoint)}">
        </label>
        <div class="neural-connection-actions">
          <button id="neuralTest" type="button">Test connection</button>
          <button id="neuralResetEndpoint" type="button">Use this site</button>
        </div>
        <p>The OpenAI key is never stored in this browser or repository. It stays in the secure Cloudflare environment.</p>
      </details>
    `;

    readerMain.insertBefore(panel, readerText);

    activeAudio = document.querySelector("#neuralAudio");
    document.querySelector("#neuralPreset").value = settings.preset;
    document.querySelector("#neuralVoice").value = settings.voice;
    document.querySelector("#neuralSpeed").value = nearestSpeed(settings.speed);

    document.querySelector("#neuralPreset").addEventListener("change", applyPreset);
    document.querySelector("#neuralVoice").addEventListener("change", saveControls);
    document.querySelector("#neuralSpeed").addEventListener("change", saveControls);
    document.querySelector("#neuralEndpoint").addEventListener("change", saveControls);
    document.querySelector("#neuralPlay").addEventListener("click", startNeuralPlayback);
    document.querySelector("#neuralPause").addEventListener("click", () => activeAudio.pause());
    document.querySelector("#neuralResume").addEventListener("click", resumePlayback);
    document.querySelector("#neuralStop").addEventListener("click", () => stopNeuralPlayback(true));
    document.querySelector("#neuralRestart").addEventListener("click", restartNeuralPlayback);
    document.querySelector("#neuralTest").addEventListener("click", checkConnection);
    document.querySelector("#neuralResetEndpoint").addEventListener("click", useSameOriginEndpoint);
    activeAudio.addEventListener("ended", playNextChunk);
    activeAudio.addEventListener("error", () => setStatus("Audio playback failed. Tap the audio control once, or use the regular iPhone Reader below."));

    applyPreset(false);
    checkConnection();
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .neural-reader-panel{border:1px solid var(--line);border-radius:20px;padding:14px;margin-bottom:14px;background:rgba(101,214,255,.07)}
      .neural-reader-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .neural-reader-heading h3{margin:0}
      .neural-badge{border:1px solid var(--line);border-radius:999px;padding:5px 9px;color:var(--muted);font-size:.75rem}
      .neural-status,.neural-section,.neural-advanced p{color:var(--muted);line-height:1.45}
      .neural-settings{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:12px 0}
      .neural-settings label,.neural-advanced label{display:grid;gap:6px;font-size:.84rem;color:var(--muted)}
      .neural-controls,.neural-connection-actions{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
      .neural-controls button{flex:1 1 130px}
      #neuralAudio{width:100%;margin-top:8px}
      #neuralProgress{width:100%}
      .neural-advanced{margin-top:10px;border-top:1px solid var(--line);padding-top:10px}
      .neural-advanced summary{cursor:pointer;font-weight:700}
      .neural-advanced input{width:100%}
      @media(max-width:600px){.neural-settings{grid-template-columns:1fr}.neural-controls button{flex:1 1 45%}}
    `;
    document.head.appendChild(style);
  }

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); } catch {}
    const storedEndpoint = localStorage.getItem(ENDPOINT_KEY) || saved.endpoint || "";
    const endpoint = normalizeEndpoint(storedEndpoint) || DEFAULT_ENDPOINT;
    return {
      preset: saved.preset && PRESETS[saved.preset] ? saved.preset : "bella",
      voice: saved.voice || "marin",
      speed: Number(saved.speed || 0.95),
      endpoint
    };
  }

  function normalizeEndpoint(value) {
    const endpoint = String(value || "").trim();
    if (!endpoint) return "";
    if (endpoint === DEFAULT_ENDPOINT) return DEFAULT_ENDPOINT;
    try {
      const parsed = new URL(endpoint, location.origin);
      if (!/^https?:$/.test(parsed.protocol)) return "";
      return parsed.origin === location.origin ? `${parsed.pathname}${parsed.search}` : parsed.href;
    } catch {
      return "";
    }
  }

  function getEndpoint() {
    return normalizeEndpoint(document.querySelector("#neuralEndpoint")?.value) || DEFAULT_ENDPOINT;
  }

  function saveControls() {
    const settings = {
      preset: document.querySelector("#neuralPreset").value,
      voice: document.querySelector("#neuralVoice").value,
      speed: Number(document.querySelector("#neuralSpeed").value),
      endpoint: getEndpoint()
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    localStorage.setItem(ENDPOINT_KEY, settings.endpoint);
    document.querySelector("#neuralEndpoint").value = settings.endpoint;
  }

  function useSameOriginEndpoint() {
    document.querySelector("#neuralEndpoint").value = DEFAULT_ENDPOINT;
    saveControls();
    checkConnection();
  }

  function applyPreset(save = true) {
    const key = document.querySelector("#neuralPreset").value;
    const preset = PRESETS[key] || PRESETS.bella;
    document.querySelector("#neuralVoice").value = preset.voice;
    document.querySelector("#neuralSpeed").value = nearestSpeed(preset.speed);
    setStatus(`${preset.label}: ${preset.description}`);
    if (save) saveControls();
  }

  function nearestSpeed(speed) {
    const values = [0.85, 0.88, 0.9, 0.95, 0.98, 1, 1.05, 1.1];
    return String(values.reduce((best, value) => Math.abs(value - speed) < Math.abs(best - speed) ? value : best));
  }

  async function checkConnection() {
    saveControls();
    setStatus("Checking the secure voice connection…");
    try {
      const response = await fetch(getEndpoint(), { method: "GET", cache: "no-store" });
      let body = {};
      try { body = await response.json(); } catch {}
      if (response.ok && body.configured) {
        setStatus("Neural voice is connected. Add a reading and press Generate & Play.");
      } else if (body && body.configured === false) {
        setStatus("The Cloudflare voice function is installed, but OPENAI_API_KEY still needs to be added as a secure environment variable.");
      } else {
        setStatus(body.error || `Voice connection returned ${response.status}.`);
      }
    } catch (error) {
      setStatus(humanizeError(error));
    }
  }

  async function startNeuralPlayback() {
    const text = document.querySelector("#readerText")?.value.trim();
    if (!text) return setStatus("Add or load a reading first.");

    stopNeuralPlayback(false);
    stopped = false;
    chunks = chunkText(text, MAX_CHUNK_CHARS);
    audioUrls = new Array(chunks.length).fill(null);
    currentIndex = 0;
    updateProgress();
    setStatus(`Preparing section 1 of ${chunks.length}…`);

    try {
      audioUrls[0] = await generateChunk(chunks[0]);
      if (stopped) return;
      prefetchPromise = prefetchChunk(1);
      await playCurrentChunk();
    } catch (error) {
      setStatus(humanizeError(error));
    }
  }

  async function generateChunk(input) {
    const response = await fetch(getEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input,
        voice: document.querySelector("#neuralVoice").value,
        speed: Number(document.querySelector("#neuralSpeed").value),
        preset: document.querySelector("#neuralPreset").value
      })
    });

    if (!response.ok) {
      let message = `Voice service error ${response.status}`;
      try {
        const body = await response.json();
        if (body.error) message = body.error;
      } catch {}
      throw new Error(message);
    }

    const blob = await response.blob();
    if (!blob.size) throw new Error("Voice service returned empty audio.");
    return URL.createObjectURL(blob);
  }

  async function prefetchChunk(index) {
    if (index >= chunks.length || audioUrls[index] || stopped) return;
    try {
      audioUrls[index] = await generateChunk(chunks[index]);
    } catch (error) {
      if (!stopped) setStatus(`Next section could not be prepared: ${humanizeError(error)}`);
    }
  }

  async function playCurrentChunk() {
    if (stopped || !activeAudio || currentIndex >= chunks.length) return;
    if (!audioUrls[currentIndex]) {
      setStatus(`Preparing section ${currentIndex + 1} of ${chunks.length}…`);
      audioUrls[currentIndex] = await generateChunk(chunks[currentIndex]);
    }

    activeAudio.src = audioUrls[currentIndex];
    activeAudio.load();
    updateProgress();
    setStatus(`Playing section ${currentIndex + 1} of ${chunks.length}. Preparing the next section in the background.`);
    try {
      await activeAudio.play();
    } catch (error) {
      if (/NotAllowedError/i.test(String(error?.name || error))) {
        setStatus("Audio is ready. Tap the play control in the audio bar once; the remaining sections will continue automatically.");
      } else {
        throw error;
      }
    }
  }

  async function playNextChunk() {
    if (stopped) return;
    currentIndex += 1;
    updateProgress();
    if (currentIndex >= chunks.length) {
      setStatus("Reading complete.");
      document.querySelector("#neuralProgress").value = 100;
      return;
    }

    try {
      if (prefetchPromise) await prefetchPromise;
      prefetchPromise = prefetchChunk(currentIndex + 1);
      await playCurrentChunk();
    } catch (error) {
      setStatus(humanizeError(error));
    }
  }

  function resumePlayback() {
    activeAudio.play().catch(error => setStatus(humanizeError(error)));
  }

  function stopNeuralPlayback(showMessage) {
    stopped = true;
    prefetchPromise = null;
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.removeAttribute("src");
      activeAudio.load();
    }
    audioUrls.forEach(url => url && URL.revokeObjectURL(url));
    audioUrls = [];
    chunks = [];
    currentIndex = 0;
    updateProgress();
    if (showMessage) setStatus("Neural reading stopped.");
  }

  async function restartNeuralPlayback() {
    if (!chunks.length) return startNeuralPlayback();
    stopped = false;
    currentIndex = 0;
    updateProgress();
    try { await playCurrentChunk(); }
    catch (error) { setStatus(humanizeError(error)); }
  }

  function chunkText(text, maxChars) {
    const paragraphs = text.split(/\n{2,}/).map(value => value.trim()).filter(Boolean);
    const output = [];
    let buffer = "";

    for (const paragraph of paragraphs) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
      for (const sentence of sentences) {
        const clean = sentence.trim();
        if (!clean) continue;
        if ((buffer + " " + clean).length > maxChars && buffer) {
          output.push(buffer.trim());
          buffer = clean;
        } else {
          buffer += `${buffer ? " " : ""}${clean}`;
        }
      }
      if (buffer && buffer.length > maxChars * 0.72) {
        output.push(buffer.trim());
        buffer = "";
      }
    }

    if (buffer) output.push(buffer.trim());
    return output.length ? output : [text.slice(0, maxChars)];
  }

  function updateProgress() {
    const total = chunks.length;
    const current = total ? Math.min(currentIndex + 1, total) : 0;
    const percent = total ? Math.round((currentIndex / total) * 100) : 0;
    const progress = document.querySelector("#neuralProgress");
    const section = document.querySelector("#neuralSection");
    if (progress) progress.value = percent;
    if (section) section.textContent = `Section ${current} of ${total}`;
  }

  function setStatus(message) {
    const status = document.querySelector("#neuralVoiceStatus");
    if (status) status.textContent = message;
  }

  function humanizeError(error) {
    const message = String(error?.message || error || "Unknown error");
    if (/Failed to fetch|NetworkError/i.test(message)) return "The secure voice server could not be reached. Check the cellular or Wi-Fi connection and retry.";
    if (/OPENAI_API_KEY|401|API key|authentication/i.test(message)) return "The Cloudflare voice function needs a valid OPENAI_API_KEY secret.";
    if (/429|limit|quota|billing|credit/i.test(message)) return "The neural voice account reached a usage, credit, or billing limit.";
    if (/NotAllowedError/i.test(message)) return "Audio is ready. Tap the play control in the audio bar once.";
    return message;
  }

  function escapeAttribute(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    }[character]));
  }
})();
