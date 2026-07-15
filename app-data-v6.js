let readerVoiceNeedsDeviceReset = false;
let neuralTtsPromise = null;
let neuralAudio = null;
let neuralAudioUrl = "";
let neuralRunId = 0;
let neuralNextAudio = null;
let neuralReady = false;
let neuralAudioUnlocked = false;
const NEURAL_MODULE_URL = "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";
const READER_SETTINGS_SCHEMA = "ios-stable-v1";
const NOVELTY_VOICE_PATTERN = /Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox/i;
const NEURAL_VOICES = [
  { id: "af_bella", name: "Bella — warm and expressive" },
  { id: "af_heart", name: "Heart — clear and natural" },
  { id: "af_nicole", name: "Nicole — calm narration" }
];

function bindFuel() {
  $("#fuelDate").value = todayYmd();
  $("#fuelForm").addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const odometer = Number(data.odometer);
    const gallons = Number(data.gallons);
    const totalPaid = Number(data.totalPaid);
    if (!data.vehicle || !data.date || !Number.isFinite(odometer) || odometer <= 0 || !Number.isFinite(gallons) || gallons <= 0 || !Number.isFinite(totalPaid) || totalPaid < 0) {
      showToast("Enter a valid date, odometer, gallons, and total paid."); return;
    }
    const duplicateOdo = state.fuel.some(entry => entry.vehicle === data.vehicle && Number(entry.odometer) === odometer && entry.id !== editingFuelId);
    if (duplicateOdo) { showToast("That vehicle already has an entry at this odometer."); return; }
    const lower = chronologicalFuel(data.vehicle).filter(entry => entry.id !== editingFuelId && entry.odometer < odometer).at(-1);
    if (!lower && state.fuel.some(entry => entry.vehicle === data.vehicle && entry.id !== editingFuelId)) {
      const minimum = Math.min(...state.fuel.filter(entry => entry.vehicle === data.vehicle && entry.id !== editingFuelId).map(entry => entry.odometer));
      if (odometer > minimum) {
        // Valid insertion after the first reading. Recalculation will handle it.
      }
    }
    if (editingFuelId) {
      const index = state.fuel.findIndex(entry => entry.id === editingFuelId);
      if (index >= 0) state.fuel[index] = { ...state.fuel[index], vehicle: data.vehicle, date: data.date, odometer, gallons, totalPaid };
      editingFuelId = null;
      $("#fuelSubmit").textContent = "Save fuel entry";
      $("#cancelFuelEdit").classList.add("hidden");
    } else {
      state.fuel.push({ id: uid(), vehicle: data.vehicle, date: data.date, odometer, gallons, totalPaid, created: new Date().toISOString() });
    }
    event.currentTarget.reset();
    $("#fuelDate").value = todayYmd();
    $("#fuelVehicle").value = data.vehicle;
    $("#vehicleFilter").value = data.vehicle;
    persistRender("Fuel entry saved.");
  });

  $("#vehicleFilter").addEventListener("change", renderFuel);
  $("#fuelVehicle").addEventListener("change", event => { $("#vehicleFilter").value = event.target.value; renderFuel(); });
  $("#cancelFuelEdit").addEventListener("click", cancelFuelEdit);
  $("#duplicateFuel").addEventListener("click", duplicateFuelDraft);
  $("#exportFuelCsv").addEventListener("click", exportFuelCsv);
  $("#exportFuelJson").addEventListener("click", () => downloadJson("cp-fuel-backup.json", { version: VERSION, exported: new Date().toISOString(), fuel: state.fuel }));
  $("#importFuelJson").addEventListener("change", importFuelJson);
}

function chronologicalFuel(vehicle) {
  return state.fuel.filter(entry => entry.vehicle === vehicle).sort((a, b) => a.odometer - b.odometer || String(a.date).localeCompare(String(b.date)));
}

function calculatedFuel(vehicle) {
  const rows = chronologicalFuel(vehicle);
  return rows.map((entry, index) => {
    const previous = rows[index - 1];
    const miles = previous ? entry.odometer - previous.odometer : null;
    const mpg = miles && miles > 0 ? miles / entry.gallons : null;
    const costPerMile = miles && miles > 0 ? entry.totalPaid / miles : null;
    const pricePerGallon = entry.gallons ? entry.totalPaid / entry.gallons : null;
    return { ...entry, previousOdometer: previous?.odometer ?? null, miles, mpg, costPerMile, pricePerGallon };
  }).sort((a, b) => b.odometer - a.odometer);
}

function fuelStats(vehicle) {
  const rows = calculatedFuel(vehicle);
  const completed = rows.filter(row => row.miles > 0 && row.mpg > 0);
  const now = new Date();
  const sameYear = row => new Date(`${row.date}T12:00:00`).getFullYear() === now.getFullYear();
  const sameMonth = row => { const d = new Date(`${row.date}T12:00:00`); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); };
  const aggregate = list => ({ miles: sum(list, "miles"), gallons: sum(list, "gallons"), paid: sum(list, "totalPaid") });
  const lifetime = aggregate(completed);
  const ytd = aggregate(completed.filter(sameYear));
  const month = aggregate(completed.filter(sameMonth));
  return {
    rows, completed,
    lastMpg: completed[0]?.mpg || 0,
    averageMpg: lifetime.gallons ? lifetime.miles / lifetime.gallons : 0,
    bestMpg: completed.length ? Math.max(...completed.map(row => row.mpg)) : 0,
    worstMpg: completed.length ? Math.min(...completed.map(row => row.mpg)) : 0,
    costPerMile: lifetime.miles ? lifetime.paid / lifetime.miles : 0,
    totalPaid: sum(rows, "totalPaid"),
    lifetime, ytd, month
  };
}

function renderFuel() {
  const vehicle = $("#vehicleFilter").value || VEHICLES[0];
  $("#vehicleFilter").value = vehicle;
  const stats = fuelStats(vehicle);
  $("#fuelStats").innerHTML = [
    ["Last MPG", formatNumber(stats.lastMpg, 1)], ["Lifetime MPG", formatNumber(stats.averageMpg, 1)],
    ["Best / worst", stats.completed.length ? `${formatNumber(stats.bestMpg,1)} / ${formatNumber(stats.worstMpg,1)}` : "--"],
    ["Cost / mile", stats.costPerMile ? currency(stats.costPerMile, 3) : "--"],
    ["This month", stats.month.miles ? `${formatNumber(stats.month.miles,0)} mi · ${currency(stats.month.paid)}` : "--"],
    ["YTD", stats.ytd.miles ? `${formatNumber(stats.ytd.miles,0)} mi · ${currency(stats.ytd.paid)}` : "--"],
    ["Total spent", currency(stats.totalPaid)], ["Fill-ups", String(stats.rows.length)]
  ].map(([label, value]) => statTile(label, value)).join("");

  $("#fuelHistory").innerHTML = stats.rows.length ? `<table class="data-table"><thead><tr><th>Date</th><th>Odometer</th><th>Miles</th><th>Gallons</th><th>Paid</th><th>$/gal</th><th>MPG</th><th>$/mile</th><th>Actions</th></tr></thead><tbody>${stats.rows.map(row => `<tr><td>${escapeHtml(row.date)}</td><td>${formatNumber(row.odometer,1)}</td><td>${row.miles ? formatNumber(row.miles,1) : "Initial"}</td><td>${formatNumber(row.gallons,3)}</td><td>${currency(row.totalPaid)}</td><td>${currency(row.pricePerGallon,3)}</td><td>${row.mpg ? formatNumber(row.mpg,1) : "--"}</td><td>${row.costPerMile ? currency(row.costPerMile,3) : "--"}</td><td><div class="row-actions"><button data-fuel-edit="${row.id}" class="secondary">Edit</button><button data-fuel-delete="${row.id}" class="danger">Delete</button></div></td></tr>`).join("")}</tbody></table>` : "<p>No fuel entries for this vehicle.</p>";
  $$('[data-fuel-edit]').forEach(button => button.addEventListener("click", () => editFuel(button.dataset.fuelEdit)));
  $$('[data-fuel-delete]').forEach(button => button.addEventListener("click", () => deleteFuel(button.dataset.fuelDelete)));
}

function editFuel(id) {
  const entry = state.fuel.find(item => item.id === id);
  if (!entry) return;
  editingFuelId = id;
  const form = $("#fuelForm");
  form.elements.vehicle.value = entry.vehicle;
  form.elements.date.value = entry.date;
  form.elements.odometer.value = entry.odometer;
  form.elements.gallons.value = entry.gallons;
  form.elements.totalPaid.value = entry.totalPaid;
  $("#fuelSubmit").textContent = "Save changes";
  $("#cancelFuelEdit").classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelFuelEdit() {
  editingFuelId = null;
  $("#fuelForm").reset();
  $("#fuelDate").value = todayYmd();
  $("#fuelSubmit").textContent = "Save fuel entry";
  $("#cancelFuelEdit").classList.add("hidden");
}

function deleteFuel(id) {
  if (!confirm("Delete this fuel entry? Later MPG calculations will be recalculated.")) return;
  state.fuel = state.fuel.filter(entry => entry.id !== id);
  persistRender("Fuel entry deleted.");
}

function duplicateFuelDraft() {
  const vehicle = $("#vehicleFilter").value || VEHICLES[0];
  const last = calculatedFuel(vehicle)[0];
  if (!last) { showToast("No previous entry to duplicate."); return; }
  cancelFuelEdit();
  const form = $("#fuelForm");
  form.elements.vehicle.value = vehicle;
  form.elements.date.value = todayYmd();
  form.elements.odometer.value = "";
  form.elements.gallons.value = last.gallons;
  form.elements.totalPaid.value = last.totalPaid;
  showToast("Last gallons and total paid copied. Enter the new odometer.");
  form.elements.odometer.focus();
}

function exportFuelCsv() {
  const rows = VEHICLES.flatMap(vehicle => calculatedFuel(vehicle));
  const header = ["date","vehicle","previous_odometer","current_odometer","miles_driven","gallons","total_paid","price_per_gallon","mpg","cost_per_mile"];
  const lines = [header.join(","), ...rows.map(row => [row.date,row.vehicle,row.previousOdometer ?? "",row.odometer,row.miles ?? "",row.gallons,row.totalPaid,row.pricePerGallon ?? "",row.mpg ?? "",row.costPerMile ?? ""].map(csvCell).join(","))];
  downloadText("cp-fuel-history.csv", lines.join("\n"), "text/csv");
}

function importFuelJson(event) {
  readJsonFile(event.target.files[0], data => {
    const incoming = Array.isArray(data) ? data : data.fuel;
    if (!Array.isArray(incoming)) throw new Error("No fuel array found");
    state.fuel = normalizeFuel(incoming);
    saveState(); renderAll(); showToast("Fuel data imported.");
  });
  event.target.value = "";
}

function bindReader() {
  $("#readerText").value = state.fields.readerText || "";
  $("#readerTitle").value = state.fields.readerTitle || "";
  const readerSettingsNeedReset = localStorage.getItem("cpCommandCenter.readerSettingsSchema") !== READER_SETTINGS_SCHEMA;
  readerVoiceNeedsDeviceReset = readerSettingsNeedReset;
  if (readerSettingsNeedReset) {
    state.readerRate = "0.93";
    state.readerEngine = isAppleMobileDevice() ? "system" : "neural";
    state.readerNeuralVoice = "af_bella";
    state.readerVoice = "";
  }
  if (!["neural", "system"].includes(state.readerEngine)) state.readerEngine = isAppleMobileDevice() ? "system" : "neural";
  if (isAppleMobileDevice()) {
    state.readerEngine = "system";
    const neuralOption = $('#readerEngine option[value="neural"]');
    if (neuralOption) {
      neuralOption.disabled = true;
      neuralOption.textContent = "Desktop neural — not supported on iPhone";
    }
  }
  $("#readerEngine").value = state.readerEngine;
  $("#readerRate").value = state.readerRate || "0.93";
  $("#readerLarge").checked = Boolean(state.fields.readerLarge);
  updateReaderClass();
  updateReaderChunks();

  $("#readerText").addEventListener("input", event => { state.fields.readerText = event.target.value; updateReaderChunks(); saveState(); renderDashboard(); });
  $("#readerTitle").addEventListener("input", event => { state.fields.readerTitle = event.target.value; saveState(); renderDashboard(); });
  $("#readerEngine").addEventListener("change", event => { stopReader(); state.readerEngine = event.target.value; renderReaderVoiceOptions(); saveState(); });
  $("#readerRate").addEventListener("change", event => { state.readerRate = event.target.value; saveState(); });
  $("#readerVoice").addEventListener("change", event => {
    if (state.readerEngine === "neural") state.readerNeuralVoice = event.target.value;
    else state.readerVoice = event.target.value;
    saveState();
  });
  $("#readerLarge").addEventListener("change", event => { state.fields.readerLarge = event.target.checked; updateReaderClass(); saveState(); });
  $("#readerPlay").addEventListener("click", async () => { await unlockNeuralAudio(); speakReader(readerIndex); });
  $("#readerTestVoice").addEventListener("click", async () => { await unlockNeuralAudio(); testReaderVoice(); });
  $("#readerPause").addEventListener("click", pauseReader);
  $("#readerResume").addEventListener("click", resumeReader);
  $("#readerStop").addEventListener("click", stopReader);
  $("#readerRestart").addEventListener("click", async () => { await unlockNeuralAudio(); readerIndex = 0; state.readerPosition = 0; saveState(); speakReader(0); });
  $("#readerImport").addEventListener("change", importReaderText);
  $("#saveReading").addEventListener("click", saveReading);
  $("#favoriteReading").addEventListener("click", toggleReadingFavorite);
  $("#newReading").addEventListener("click", newReading);
  window.speechSynthesis?.addEventListener("voiceschanged", loadReaderVoices);
  loadReaderVoices();
  renderReaderVoiceOptions();
  renderReaderCategories();
  localStorage.setItem("cpCommandCenter.readerSettingsSchema", READER_SETTINGS_SCHEMA);
  if (isAppleMobileDevice()) setText("#readerStatus", "iPhone Reader ready. Your selected voice will now stay selected.");
  saveState();
}

const readerCategoryPrompts = {
  "Cast25 Live": "Paste or generate a full 25-minute Cast25 Live briefing here. Use labeled sections, natural spoken pacing, and pause points.",
  "Calm Commute": "Create a calm 20–25 minute commute reading with practical reflection, short sections, and pause points.",
  "AI Learning": "Create a practical AI learning lesson for a building maintenance professional. Explain concepts plainly and connect them to real workflows.",
  "Work / Maintenance": "Create a hands-on technical reading about HVAC, pumps, electrical troubleshooting, preventive maintenance, safety, and diagnostics.",
  "Retirement / Finance": "Create a practical retirement-planning reading covering pension, 457(b), 401(k), taxes, healthcare, and age-55 decisions.",
  "Faith / Reflection": "Create a calm faith-based reading with grounded encouragement, scripture context, and pause points.",
  "Long Island": "Create a realistic Long Island story or local history reading with Babylon, Suffolk, Nassau, NYC, transit, and community context.",
  "Sleep Reading": "Create a slow, calm bedtime reading with gentle pacing, no alarming topics, and frequent pause points."
};

function renderReaderCategories() {
  $("#readerCategories").innerHTML = Object.keys(readerCategoryPrompts).map(name => `<button class="category-button" data-reader-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join("");
  $$('[data-reader-category]').forEach(button => button.addEventListener("click", () => {
    const name = button.dataset.readerCategory;
    $("#readerTitle").value = name;
    $("#readerText").value = readerCategoryPrompts[name];
    state.fields.readerTitle = name; state.fields.readerText = readerCategoryPrompts[name]; state.readerPosition = 0; readerIndex = 0;
    updateReaderChunks(); saveState(); renderDashboard(); showToast(`${name} template loaded.`);
  }));
}

function updateReaderClass() { $(".reader-main")?.classList.toggle("large", $("#readerLarge").checked); }
function updateReaderChunks() {
  readerChunks = chunkText($("#readerText").value);
  readerIndex = Math.min(Number(state.readerPosition || 0), Math.max(readerChunks.length - 1, 0));
  const words = $("#readerText").value.trim().split(/\s+/).filter(Boolean).length;
  setText("#readerSection", `Section ${readerChunks.length ? readerIndex + 1 : 0} of ${readerChunks.length}`);
  setText("#readerTime", `${Math.ceil(words / 165) || 0} min at reading pace`);
  $("#readerProgress").value = readerChunks.length ? Math.round((readerIndex / readerChunks.length) * 100) : 0;
}

function chunkText(text) {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n\s*\n/).map(p => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const result = [];
  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
    let buffer = "";
    for (const sentence of sentences) {
      const pieces = splitLongReaderSentence(sentence.trim(), 340);
      for (const piece of pieces) {
        if ((buffer + " " + piece).length > 340 && buffer) { result.push(buffer.trim()); buffer = piece; }
        else buffer += ` ${piece}`;
      }
    }
    if (buffer.trim()) result.push(buffer.trim());
  }
  return result;
}

function splitLongReaderSentence(sentence, maxLength) {
  if (sentence.length <= maxLength) return [sentence];
  const words = sentence.split(/\s+/);
  const pieces = [];
  let buffer = "";
  for (const word of words) {
    if ((buffer + " " + word).trim().length > maxLength && buffer) { pieces.push(buffer.trim()); buffer = word; }
    else buffer += ` ${word}`;
  }
  if (buffer.trim()) pieces.push(buffer.trim());
  return pieces;
}

function speakReader(index) {
  if (state.readerEngine === "neural") { speakNeuralReader(index); return; }
  speakSystemReader(index);
}

function speakSystemReader(index, continuation = false) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { showToast("Speech is not available in this browser."); return; }
  updateReaderChunks();
  if (!readerChunks.length) { showToast("Add text to the Reader first."); return; }
  if (!continuation) {
    stopNeuralAudio(false);
    window.speechSynthesis.cancel();
  }
  readerIndex = Math.max(0, Math.min(index, readerChunks.length - 1));
  state.readerPosition = readerIndex; saveState(); updateReaderChunks();
  activeUtterance = new window.SpeechSynthesisUtterance(readerChunks[readerIndex]);
  activeUtterance.rate = Number($("#readerRate").value || 0.93);
  activeUtterance.voice = readerVoices.find(voice => voice.name === $("#readerVoice").value) || null;
  activeUtterance.pitch = 1.0;
  activeUtterance.volume = 1.0;
  activeUtterance.onstart = () => setText("#readerStatus", `Playing section ${readerIndex + 1} with ${activeUtterance.voice?.name || "the iPhone voice"}.`);
  activeUtterance.onend = () => {
    if (readerIndex < readerChunks.length - 1) {
      readerIndex += 1; state.readerPosition = readerIndex; saveState(); updateReaderChunks();
      setTimeout(() => speakSystemReader(readerIndex, true), 110);
    } else {
      $("#readerProgress").value = 100; setText("#readerStatus", "Reading complete."); saveReadingHistory();
    }
  };
  activeUtterance.onerror = event => {
    if (event.error !== "canceled" && event.error !== "interrupted") {
      setText("#readerStatus", `Speech stopped at section ${readerIndex + 1}. Tap Play to continue. (${event.error})`);
    }
  };
  const start = () => window.speechSynthesis.speak(activeUtterance);
  if (continuation) start();
  else setTimeout(start, 120);
}

async function speakNeuralReader(index) {
  updateReaderChunks();
  if (!readerChunks.length) { showToast("Add text to the Reader first."); return; }
  window.speechSynthesis?.cancel();
  stopNeuralAudio(false);
  const runId = ++neuralRunId;
  readerIndex = Math.max(0, Math.min(index, readerChunks.length - 1));
  state.readerPosition = readerIndex; saveState(); updateReaderChunks();
  try {
    const tts = await getNeuralTts();
    if (runId !== neuralRunId) return;
    setText("#readerStatus", `Preparing Bella, section ${readerIndex + 1}…`);
    const audio = await generateNeuralAudio(tts, readerChunks[readerIndex]);
    if (runId !== neuralRunId) return;
    await playNeuralAudio(audio, runId, tts);
  } catch (error) {
    console.error("Neural Reader error", error);
    if (runId !== neuralRunId) return;
    setText("#readerStatus", navigator.onLine
      ? "Neural voice could not start. Close and reopen the app, then tap Test voice."
      : "Neural voice needs its one-time download. Reconnect, then tap Test voice.");
    showToast("Neural voice did not load. Your reading position is saved.", 7000);
  }
}

async function getNeuralTts() {
  if (neuralTtsPromise) return neuralTtsPromise;
  setText("#readerStatus", "Loading the free neural reader…");
  neuralTtsPromise = import(NEURAL_MODULE_URL)
    .then(({ KokoroTTS }) => KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
      device: "wasm",
      progress_callback: updateNeuralDownloadProgress
    }))
    .then(tts => {
      neuralReady = true;
      $("#readerDownloadNote")?.classList.add("hidden");
      setText("#readerStatus", "Free neural voice ready.");
      return tts;
    })
    .catch(error => { neuralTtsPromise = null; throw error; });
  return neuralTtsPromise;
}

function updateNeuralDownloadProgress(event) {
  if (event?.status === "progress" && Number.isFinite(event.progress)) {
    const percent = Math.max(0, Math.min(100, Math.round(event.progress)));
    setText("#readerStatus", `Downloading free neural voice: ${percent}% — keep this screen open.`);
  } else if (event?.status === "initiate") {
    setText("#readerStatus", "Starting the one-time neural voice download…");
  }
}

function generateNeuralAudio(tts, text) {
  return tts.generate(text, {
    voice: state.readerNeuralVoice || "af_bella",
    speed: Number($("#readerRate").value || 0.93)
  });
}

async function playNeuralAudio(rawAudio, runId, tts) {
  if (!neuralAudio) neuralAudio = new Audio();
  releaseNeuralAudioUrl();
  neuralAudioUrl = URL.createObjectURL(rawAudio.toBlob());
  neuralAudio.src = neuralAudioUrl;
  neuralAudio.volume = 1;
  neuralAudio.playbackRate = 1;
  neuralAudio.playsInline = true;
  neuralNextAudio = readerIndex < readerChunks.length - 1
    ? generateNeuralAudio(tts, readerChunks[readerIndex + 1]).catch(() => null)
    : null;
  neuralAudio.onplay = () => setText("#readerStatus", `Playing neural voice, section ${readerIndex + 1}.`);
  neuralAudio.onended = async () => {
    if (runId !== neuralRunId) return;
    releaseNeuralAudioUrl();
    if (readerIndex < readerChunks.length - 1) {
      readerIndex += 1; state.readerPosition = readerIndex; saveState(); updateReaderChunks();
      setText("#readerStatus", `Preparing section ${readerIndex + 1}…`);
      const next = await neuralNextAudio;
      if (runId !== neuralRunId) return;
      try {
        await playNeuralAudio(next || await generateNeuralAudio(tts, readerChunks[readerIndex]), runId, tts);
      } catch (error) {
        console.error(error); setText("#readerStatus", "Neural playback stopped. Tap Play to continue.");
      }
    } else {
      $("#readerProgress").value = 100; setText("#readerStatus", "Reading complete."); saveReadingHistory();
    }
  };
  neuralAudio.onerror = () => { if (runId === neuralRunId) setText("#readerStatus", "Audio playback stopped. Tap Play to continue."); };
  await neuralAudio.play();
}

async function unlockNeuralAudio() {
  if (state.readerEngine !== "neural" || neuralAudioUnlocked) return;
  if (!neuralAudio) neuralAudio = new Audio();
  neuralAudio.playsInline = true;
  neuralAudio.preload = "auto";
  neuralAudio.volume = 0;
  neuralAudio.src = "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICA";
  try {
    await neuralAudio.play();
    neuralAudio.pause();
    neuralAudio.removeAttribute("src");
    neuralAudio.load();
    neuralAudioUnlocked = true;
  } catch (error) {
    console.warn("iPhone audio unlock will retry at playback", error);
  } finally {
    neuralAudio.volume = 1;
  }
}

function pauseReader() {
  if (state.readerEngine === "neural" && neuralAudio && !neuralAudio.paused) neuralAudio.pause();
  else window.speechSynthesis?.pause();
  setText("#readerStatus", "Paused.");
}

function resumeReader() {
  if (state.readerEngine === "neural" && neuralAudio?.src) neuralAudio.play().catch(() => setText("#readerStatus", "Tap Play to continue."));
  else window.speechSynthesis?.resume();
  setText("#readerStatus", "Resumed.");
}

function stopNeuralAudio(incrementRun = true) {
  if (incrementRun) neuralRunId += 1;
  neuralNextAudio = null;
  if (neuralAudio) { neuralAudio.pause(); neuralAudio.removeAttribute("src"); neuralAudio.load(); }
  releaseNeuralAudioUrl();
}

function releaseNeuralAudioUrl() {
  if (!neuralAudioUrl) return;
  URL.revokeObjectURL(neuralAudioUrl);
  neuralAudioUrl = "";
}

function stopReader() {
  neuralRunId += 1;
  stopNeuralAudio(false);
  window.speechSynthesis?.cancel();
  setText("#readerStatus", `Stopped at section ${readerIndex + 1}. Position saved.`);
  state.readerPosition = readerIndex; saveState();
}

async function testReaderVoice() {
  stopReader();
  const sample = "Good afternoon. This is the new CP neural reader. The voice should sound clear, warm, and natural, without the crackling system speech.";
  if (state.readerEngine === "system") {
    await new Promise(resolve => setTimeout(resolve, 140));
    const utterance = new SpeechSynthesisUtterance(sample);
    utterance.rate = Number($("#readerRate").value || 0.93);
    utterance.voice = readerVoices.find(voice => voice.name === $("#readerVoice").value) || null;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    setText("#readerStatus", `Testing ${utterance.voice?.name || "the iPhone voice"}.`);
    window.speechSynthesis.speak(utterance);
    return;
  }
  const runId = ++neuralRunId;
  try {
    const tts = await getNeuralTts();
    const audio = await generateNeuralAudio(tts, sample);
    if (runId !== neuralRunId) return;
    await playNeuralPreview(audio, runId);
  } catch (error) {
    console.error(error);
    setText("#readerStatus", navigator.onLine ? "Neural test could not start. Close and reopen the app, then try once more." : "Reconnect to finish the one-time neural voice download.");
  }
}

async function playNeuralPreview(rawAudio, runId) {
  if (!neuralAudio) neuralAudio = new Audio();
  releaseNeuralAudioUrl();
  neuralAudioUrl = URL.createObjectURL(rawAudio.toBlob());
  neuralAudio.src = neuralAudioUrl;
  neuralAudio.volume = 1;
  neuralAudio.playsInline = true;
  neuralAudio.onplay = () => setText("#readerStatus", "Playing free neural voice test.");
  neuralAudio.onended = () => { if (runId === neuralRunId) setText("#readerStatus", "Voice test complete. Tap Play for your reading."); releaseNeuralAudioUrl(); };
  await neuralAudio.play();
}

function loadReaderVoices() {
  readerVoices = window.speechSynthesis?.getVoices()
    .filter(voice => /^en/i.test(voice.lang) && !NOVELTY_VOICE_PATTERN.test(voice.name)) || [];
  if (!readerVoices.length) {
    renderReaderVoiceOptions();
    return;
  }
  const isIPhoneOrIPad = isAppleMobileDevice();
  const preferencePatterns = isIPhoneOrIPad
    ? [/^Ava/i, /^Zoe/i, /^Serena/i, /^Samantha$/i, /^Samantha/i, /^Allison/i, /^Karen/i, /^Moira/i]
    : [/^Allison/i, /^Ava/i, /^Samantha$/i, /^Samantha/i, /^Zoe/i, /^Serena/i];
  const deviceVoice = preferencePatterns
    .map(pattern => readerVoices.find(voice => pattern.test(voice.name) && /^en[-_]US/i.test(voice.lang))
      || readerVoices.find(voice => pattern.test(voice.name)))
    .find(Boolean) || null;
  const settingsAreCurrent = !readerVoiceNeedsDeviceReset
    && localStorage.getItem("cpCommandCenter.readerSettingsSchema") === READER_SETTINGS_SCHEMA;
  const savedVoice = settingsAreCurrent && state.readerVoice
    && readerVoices.some(voice => voice.name === state.readerVoice) ? state.readerVoice : "";
  const preferred = savedVoice || deviceVoice?.name || readerVoices[0]?.name || "";
  if (preferred) state.readerVoice = preferred;
  readerVoiceNeedsDeviceReset = false;
  localStorage.setItem("cpCommandCenter.readerSettingsSchema", READER_SETTINGS_SCHEMA);
  renderReaderVoiceOptions();
  saveState();
}

function isAppleMobileDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function renderReaderVoiceOptions() {
  const select = $("#readerVoice");
  if (!select) return;
  const isNeural = state.readerEngine === "neural";
  if (isNeural) {
    select.innerHTML = NEURAL_VOICES.map(voice => `<option value="${voice.id}">${escapeHtml(voice.name)}</option>`).join("");
    select.value = NEURAL_VOICES.some(voice => voice.id === state.readerNeuralVoice) ? state.readerNeuralVoice : "af_bella";
    state.readerNeuralVoice = select.value;
    $("#readerDownloadNote")?.classList.toggle("hidden", neuralReady);
  } else {
    select.innerHTML = readerVoices.length
      ? readerVoices.map(voice => `<option value="${escapeHtml(voice.name)}">${escapeHtml(voice.name)} (${escapeHtml(voice.lang)})</option>`).join("")
      : "<option>Waiting for iPhone voices…</option>";
    if (readerVoices.some(voice => voice.name === state.readerVoice)) select.value = state.readerVoice;
    $("#readerDownloadNote")?.classList.add("hidden");
  }
}

function importReaderText(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => { $("#readerTitle").value = file.name.replace(/\.[^.]+$/, ""); $("#readerText").value = String(reader.result); state.fields.readerTitle = $("#readerTitle").value; state.fields.readerText = $("#readerText").value; state.readerPosition = 0; updateReaderChunks(); saveState(); renderDashboard(); showToast("Text imported."); };
  reader.readAsText(file); event.target.value = "";
}

function saveReading() {
  const title = $("#readerTitle").value.trim() || `Reading ${new Date().toLocaleDateString()}`;
  const text = $("#readerText").value.trim(); if (!text) { showToast("Nothing to save."); return null; }
  let record = state.readings.find(item => item.id === state.currentReadingId);
  if (!record) { record = { id: uid(), favorite: false, history: [] }; state.readings.unshift(record); }
  Object.assign(record, { title, text, position: readerIndex, updated: new Date().toISOString() });
  state.currentReadingId = record.id; state.fields.readerTitle = title; state.fields.readerText = text; saveState(); renderReaderLibrary(); renderDashboard(); showToast("Reading saved."); return record;
}
function toggleReadingFavorite() { const record = saveReading(); if (!record) return; record.favorite = !record.favorite; saveState(); renderReaderLibrary(); showToast(record.favorite ? "Added to favorites." : "Removed from favorites."); }
function saveReadingHistory() { const record = saveReading(); if (!record) return; record.history = [{ date: new Date().toISOString(), section: readerIndex + 1 }, ...(record.history || [])].slice(0, 12); saveState(); }
function newReading() { stopReader(); state.currentReadingId = null; state.readerPosition = 0; readerIndex = 0; $("#readerTitle").value = ""; $("#readerText").value = ""; state.fields.readerTitle = ""; state.fields.readerText = ""; saveState(); updateReaderChunks(); renderDashboard(); }
function renderReaderLibrary() {
  const sorted = [...state.readings].sort((a,b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || String(b.updated).localeCompare(String(a.updated)));
  $("#readingLibrary").innerHTML = sorted.length ? sorted.map(item => `<button class="library-button" data-reading-id="${item.id}">${item.favorite ? "★ " : ""}${escapeHtml(item.title)}<small>${formatDateTime(item.updated)} · section ${(item.position || 0) + 1}</small></button>`).join("") : "<p class='muted'>No saved readings.</p>";
  $$('[data-reading-id]').forEach(button => button.addEventListener("click", () => loadReading(button.dataset.readingId)));
}
function loadReading(id) { const record = state.readings.find(item => item.id === id); if (!record) return; state.currentReadingId = id; $("#readerTitle").value = record.title; $("#readerText").value = record.text; state.fields.readerTitle = record.title; state.fields.readerText = record.text; state.readerPosition = record.position || 0; readerIndex = state.readerPosition; updateReaderChunks(); saveState(); renderDashboard(); showToast("Reading loaded."); }
