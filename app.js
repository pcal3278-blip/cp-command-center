const VERSION = "5.2.1";
const BUILD = "5.2.1";
const BUILD_TIME = new Date().toLocaleString();
const STORE_KEY = "cpCommandCenter.v5.2";
const FUEL_VEHICLES = ["2021 Chevy Silverado RST", "2007 Honda Civic"];
const WEST_BABYLON = { latitude: 40.7182, longitude: -73.3543 };
const FOX_NEWS_FEED = "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fmoxie.foxnews.com%2Fgoogle-publisher%2Flatest.xml";

const defaultState = {
  theme: "auto",
  activeScreen: "dashboard",
  reminders: ["Check commute before leaving", "Review morning briefing"],
  readings: [],
  currentReadingId: null,
  readerPosition: 0,
  fuel: [],
  retirement: [],
  health: [],
  home: [],
  fields: {},
  checks: {},
  retirementTarget: ""
};

let state = loadState();
let chunks = [];
let currentChunk = 0;
let activeUtterance = null;
let voices = [];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

window.addEventListener("DOMContentLoaded", () => {
  window.setTimeout(hideLoading, 750);
  try {
    applyTheme();
    bindNavigation();
    bindForms();
    bindReader();
    bindSettings();
    restoreFields();
    renderAll();
    loadLiveDashboardData();
    registerServiceWorker();
    setInterval(updateClock, 1000);
    updateClock();
  } catch (error) {
    console.error("CP Command Center startup failed", error);
    showDashboardFallback(error);
  } finally {
    hideLoading();
  }
});

function hideLoading() {
  $("#loading")?.classList.add("hidden");
  document.body.classList.add("app-ready");
}

function showDashboardFallback(error) {
  document.querySelector('[data-screen="dashboard"]')?.classList.add("active");
  document.querySelector('[data-nav="dashboard"]')?.classList.add("active");
  const title = $("#screenTitle");
  if (title) title.textContent = "Dashboard";
  const status = $("#statusList");
  if (status) {
    status.innerHTML = `
      <dt>Version</dt><dd>CP Command Center Version ${VERSION}</dd>
      <dt>Startup status</dt><dd>Dashboard opened after startup recovery.</dd>
      <dt>Startup detail</dt><dd>${escapeHtml(error?.message || "Unknown startup error")}</dd>
    `;
  }
}

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function setScreen(screen) {
  state.activeScreen = screen;
  saveState();
  $$(".screen").forEach(section => section.classList.toggle("active", section.dataset.screen === screen));
  $$("[data-nav]").forEach(button => button.classList.toggle("active", button.dataset.nav === screen));
  $("#screenTitle").textContent = screen === "mpg" ? "MPG" : titleCase(screen);
  $("#app").focus({ preventScroll: true });
  renderStatus();
}

function titleCase(value) {
  return value.replace(/-/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function bindNavigation() {
  $$("[data-nav]").forEach(button => button.addEventListener("click", () => setScreen(button.dataset.nav)));
  $$("[data-jump]").forEach(button => button.addEventListener("click", () => setScreen(button.dataset.jump)));
  setScreen(state.activeScreen || "dashboard");
  $("#themeToggle").addEventListener("click", () => {
    state.theme = getResolvedTheme() === "dark" ? "light" : "dark";
    saveState();
    applyTheme();
  });
}

function updateClock() {
  const now = new Date();
  $("#clock").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  $("#dateLine").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  $("#todayLabel").textContent = now.toLocaleDateString([], { weekday: "long" });
  $("#lastUpdated").textContent = `Last Updated: ${BUILD_TIME}`;
  $("#briefUpdated").textContent = BUILD_TIME;
}

function bindForms() {
  $("#reminderForm").addEventListener("submit", event => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("reminder")?.trim();
    if (value) state.reminders.unshift(value);
    event.currentTarget.reset();
    persistRender();
  });

  $("#fuelForm").addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const vehicle = data.vehicle;
    const date = data.date || new Date().toISOString().slice(0, 10);
    const currentMileage = Number(data.currentMileage);
    const gallons = Number(data.gallons);
    const cost = Number(data.cost);
    const previous = latestFuelEntry(vehicle);
    const lastMileage = previous?.currentMileage ?? null;
    const miles = lastMileage === null ? 0 : currentMileage - lastMileage;
    if (!vehicle || !Number.isFinite(currentMileage) || !Number.isFinite(gallons) || gallons <= 0 || !Number.isFinite(cost) || cost <= 0) return;
    if (lastMileage !== null && miles <= 0) return;
    state.fuel.unshift({
      id: crypto.randomUUID(),
      date,
      vehicle,
      lastMileage,
      currentMileage,
      gallons,
      cost,
      miles,
      mpg: gallons ? miles / gallons : 0,
      costPerMile: miles ? cost / miles : 0
    });
    event.currentTarget.reset();
    $("#fuelVehicle").value = vehicle;
    $("#fuelDate").value = todayYmd();
    persistRender();
  });

  $("#openMtaStatus")?.addEventListener("click", () => window.open("https://www.mta.info/", "_blank"));
  $("#openTrainTime")?.addEventListener("click", () => window.open("https://new.mta.info/traintime", "_blank"));

  $("#retirementForm").addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const snapshot = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Number(value || 0)]));
    state.retirement.unshift({ id: crypto.randomUUID(), date: new Date().toLocaleDateString(), ...snapshot });
    event.currentTarget.reset();
    persistRender();
  });

  $("#healthForm").addEventListener("submit", event => {
    event.preventDefault();
    state.health.unshift({ id: crypto.randomUUID(), date: new Date().toLocaleString(), ...Object.fromEntries(new FormData(event.currentTarget)) });
    event.currentTarget.reset();
    persistRender();
  });

  $("#homeForm").addEventListener("submit", event => {
    event.preventDefault();
    state.home.unshift({ id: crypto.randomUUID(), complete: false, ...Object.fromEntries(new FormData(event.currentTarget)) });
    event.currentTarget.reset();
    persistRender();
  });

  $$("[data-store]").forEach(input => {
    input.value = state.fields[input.dataset.store] || input.value || "";
    input.addEventListener("input", () => {
      state.fields[input.dataset.store] = input.value;
      saveState();
    });
  });

  $$("[data-store-check]").forEach(input => {
    input.checked = Boolean(state.checks[input.dataset.storeCheck]);
    input.addEventListener("change", () => {
      state.checks[input.dataset.storeCheck] = input.checked;
      saveState();
    });
  });
}

function persistRender() {
  saveState();
  renderAll();
}

function renderAll() {
  renderReminders();
  renderDashboardSummaries();
  renderFuel();
  renderRetirement();
  renderHealth();
  renderHome();
  renderLibrary();
  renderStatus();
}

function renderReminders() {
  $("#reminderList").innerHTML = state.reminders.slice(0, 5).map((item, index) =>
    `<li><button class="text-delete" data-reminder="${index}" title="Remove reminder">×</button> ${escapeHtml(item)}</li>`
  ).join("");
  $$("[data-reminder]").forEach(button => button.addEventListener("click", () => {
    state.reminders.splice(Number(button.dataset.reminder), 1);
    persistRender();
  }));
}

function renderDashboardSummaries() {
  const health = state.health[0];
  $("#healthSummary").textContent = health ? `${health.bp || "BP --"} · ${health.weight || "--"} lb · sleep ${health.sleep || "--"}h · HR ${health.heartRate || "--"}` : "No health entries yet.";
  const fuel = state.fuel.find(entry => entry.miles > 0);
  $("#vehicleSummary").textContent = fuel ? `${fuel.vehicle}: ${fuel.mpg.toFixed(1)} MPG · $${fuel.costPerMile.toFixed(2)}/mile` : "No completed MPG entries yet.";
  const retirement = state.retirement[0];
  $("#retirementSummary").textContent = retirement ? `Net worth estimate $${formatMoney(retirement.netWorth)} · contributions $${formatMoney(retirement.contribution)}/mo` : "No retirement entries yet.";
}

function renderFuel() {
  const formVehicle = $("#fuelVehicle");
  const vehicleSelect = $("#vehicleSelect");
  const options = FUEL_VEHICLES.map(vehicle => `<option>${escapeHtml(vehicle)}</option>`).join("");
  const selected = vehicleSelect.value || formVehicle.value || FUEL_VEHICLES[0];
  formVehicle.innerHTML = options;
  vehicleSelect.innerHTML = options;
  $("#fuelDate").value ||= todayYmd();
  formVehicle.value = selected;
  vehicleSelect.value = selected;
  vehicleSelect.onchange = () => {
    formVehicle.value = vehicleSelect.value;
    renderFuel();
  };
  formVehicle.onchange = () => {
    vehicleSelect.value = formVehicle.value;
    renderFuel();
  };
  const entries = fuelEntriesFor(selected);
  const stats = fuelStats(selected);
  const latest = entries[0];
  const lastMpg = entries.find(entry => entry.miles > 0)?.mpg;
  $("#mpgStats").textContent = latest
    ? `Previous odometer ${latest.lastMileage === null ? "none" : latest.lastMileage.toLocaleString()} · Last odometer ${latest.currentMileage.toLocaleString()} · Last MPG ${lastMpg ? lastMpg.toFixed(1) : "pending"} · Average MPG ${stats.averageMpg ? stats.averageMpg.toFixed(1) : "pending"} · Lifetime MPG ${stats.lifetimeMpg ? stats.lifetimeMpg.toFixed(1) : "pending"} · Total gallons ${stats.totalGallons.toFixed(2)} · Total fuel $${stats.totalCost.toFixed(2)}`
    : `Previous odometer -- · Last odometer -- · Last MPG -- · Average MPG -- · Total gallons 0.00 · Total fuel $0.00`;
  $("#fuelHistory").innerHTML = entries.map(entry => `<p><strong>${escapeHtml(entry.vehicle)}</strong> ${escapeHtml(entry.date)}<br>Previous odometer ${entry.lastMileage === null ? "none" : entry.lastMileage.toLocaleString()} · Current odometer ${entry.currentMileage.toLocaleString()} · ${entry.lastMileage === null ? "Initial odometer saved" : `${entry.miles.toFixed(0)} miles · ${entry.mpg.toFixed(1)} MPG · $${entry.costPerMile.toFixed(2)}/mile`} · ${entry.gallons.toFixed(2)} gal · $${entry.cost.toFixed(2)}</p>`).join("") || "<p>No fuel history.</p>";
  drawChart("mpgChart", entries.slice(0, 12).reverse().filter(entry => entry.miles > 0).map(entry => entry.mpg), "#65d6ff");
}

function fuelEntriesFor(vehicle) {
  return state.fuel.filter(entry => entry.vehicle === vehicle);
}

function latestFuelEntry(vehicle) {
  return fuelEntriesFor(vehicle)[0];
}

function fuelStats(vehicle) {
  const entries = fuelEntriesFor(vehicle);
  const completed = entries.filter(entry => entry.miles > 0);
  const totalMiles = sum(completed, "miles");
  const totalGallons = sum(completed, "gallons");
  const totalCost = sum(entries, "cost");
  return {
    totalMiles,
    totalGallons: sum(entries, "gallons"),
    totalCost,
    lifetimeMpg: totalGallons ? totalMiles / totalGallons : 0,
    averageMpg: totalGallons ? totalMiles / totalGallons : 0
  };
}

async function loadLiveDashboardData() {
  await Promise.allSettled([loadWeather(), loadFoxNews()]);
}

async function loadWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEST_BABYLON.latitude}&longitude=${WEST_BABYLON.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&hourly=temperature_2m,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FNew_York&forecast_days=3`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("weather unavailable");
    const data = await response.json();
    const current = data.current || {};
    const description = weatherDescription(current.weather_code);
    const temp = Math.round(current.temperature_2m);
    const detail = `Feels ${Math.round(current.apparent_temperature)}°F · Humidity ${current.relative_humidity_2m}% · Wind ${Math.round(current.wind_speed_10m)} mph`;
    setText("#dashboardWeatherMetric", `${temp}°F · ${description}`);
    setText("#dashboardWeatherDetail", detail);
    setText("#weatherHeroMetric", `${temp}°F · ${description}`);
    setText("#weatherHeroDetail", `${detail} · Sunrise ${formatTime(data.daily?.sunrise?.[0])} · Sunset ${formatTime(data.daily?.sunset?.[0])}`);
    setText("#commuteWeather", `${temp}°F · ${description} · wind ${Math.round(current.wind_speed_10m)} mph for the Babylon commute.`);
    setText("#hourlyForecast", (data.hourly?.time || []).slice(0, 6).map((time, index) => `${formatTime(time)} ${Math.round(data.hourly.temperature_2m[index])}°`).join(" · "));
    setText("#dailyForecast", (data.daily?.time || []).slice(0, 3).map((day, index) => `${new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: "short" })} ${Math.round(data.daily.temperature_2m_min[index])}°/${Math.round(data.daily.temperature_2m_max[index])}° · rain ${data.daily.precipitation_probability_max[index]}%`).join(" · "));
  } catch {
    setText("#dashboardWeatherMetric", "Live weather unavailable");
    setText("#dashboardWeatherDetail", "Open Weather tab or retry with network access.");
    setText("#weatherHeroMetric", "Live weather unavailable");
    setText("#weatherHeroDetail", "Weather source could not be reached.");
  }
}

async function loadFoxNews() {
  try {
    const response = await fetch(FOX_NEWS_FEED, { cache: "no-store" });
    if (!response.ok) throw new Error("news unavailable");
    const data = await response.json();
    const items = (data.items || []).slice(0, 3).map(item => item.title).filter(Boolean);
    setText("#foxNewsSummary", items.length ? items.join(" · ") : "Fox News feed returned no current headlines.");
  } catch {
    setText("#foxNewsSummary", "Fox News feed unavailable · use FoxNews.com for current headlines.");
  }
}

function weatherDescription(code) {
  const descriptions = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Showers",
    81: "Showers",
    82: "Heavy showers",
    95: "Thunderstorms"
  };
  return descriptions[code] || "Updated";
}

function formatTime(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function renderRetirement() {
  const latest = state.retirement[0];
  $("#retirementStats").textContent = latest ? `401(k) $${formatMoney(latest.k401)} · 457(b) $${formatMoney(latest.b457)} · Pension $${formatMoney(latest.pension)} · Net worth $${formatMoney(latest.netWorth)}` : "No snapshots.";
  $("#retirementCountdown").textContent = state.retirementTarget ? daysUntil(state.retirementTarget) : "Set a target date in Settings.";
  drawChart("retirementChart", state.retirement.slice(0, 12).reverse().map(entry => entry.netWorth), "#a2f5bf");
}

function renderHealth() {
  const latest = state.health[0];
  $("#latestHealth").textContent = latest ? `${latest.date}: BP ${latest.bp || "--"} · Weight ${latest.weight || "--"} · Sleep ${latest.sleep || "--"}h · Recovery ${latest.recovery || "--"}% · HR ${latest.heartRate || "--"} · Glucose ${latest.glucose || "--"}` : "No entries.";
  drawChart("healthChart", state.health.slice(0, 12).reverse().map(entry => Number(entry.weight || 0)).filter(Boolean), "#ffcc66");
}

function renderHome() {
  $("#homeHistory").innerHTML = state.home.map(item => `<p><strong>${escapeHtml(item.area)}</strong><br>${escapeHtml(item.task)} · due ${escapeHtml(item.due || "not set")}</p>`).join("") || "<p>No home maintenance history.</p>";
}

function bindReader() {
  const text = $("#readerText");
  text.value = state.fields.readerText || "";
  $("#readerTitle").value = state.fields.readerTitle || "";
  $("#speechRate").value = state.fields.speechRate || "1.0";
  $("#largeText").checked = Boolean(state.checks.largeText);
  $("#darkReader").checked = Boolean(state.checks.darkReader);
  updateReaderClass();
  updateChunks();

  text.addEventListener("input", () => {
    state.fields.readerText = text.value;
    updateChunks();
    saveState();
  });
  $("#readerTitle").addEventListener("input", event => {
    state.fields.readerTitle = event.target.value;
    saveState();
  });
  $("#speechRate").addEventListener("change", event => {
    state.fields.speechRate = event.target.value;
    saveState();
  });
  $("#largeText").addEventListener("change", event => {
    state.checks.largeText = event.target.checked;
    updateReaderClass();
    saveState();
  });
  $("#darkReader").addEventListener("change", event => {
    state.checks.darkReader = event.target.checked;
    updateReaderClass();
    saveState();
  });
  $("#fileImport").addEventListener("change", importTextFile);
  $("#saveReading").addEventListener("click", saveReading);
  $("#favoriteReading").addEventListener("click", toggleFavorite);
  $("#fullscreenReader").addEventListener("click", () => $(".reader-screen").classList.toggle("fullscreen"));
  $("#playReader").addEventListener("click", () => speakFrom(currentChunk));
  $("#pauseReader").addEventListener("click", () => window.speechSynthesis?.pause());
  $("#resumeReader").addEventListener("click", () => window.speechSynthesis?.resume());
  $("#stopReader").addEventListener("click", stopReader);
  $("#restartReader").addEventListener("click", () => {
    currentChunk = 0;
    state.readerPosition = 0;
    saveState();
    speakFrom(0);
  });
  window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
  loadVoices();
}

function updateReaderClass() {
  $(".reader-main").classList.toggle("large", $("#largeText").checked);
  $(".reader-main").classList.toggle("reader-dark", $("#darkReader").checked);
}

function updateChunks() {
  chunks = chunkText($("#readerText").value);
  currentChunk = Math.min(state.readerPosition || 0, Math.max(chunks.length - 1, 0));
  const words = $("#readerText").value.trim().split(/\s+/).filter(Boolean).length;
  $("#sectionStatus").textContent = `Section ${chunks.length ? currentChunk + 1 : 0} of ${chunks.length}`;
  $("#readingTime").textContent = `Estimated reading time: ${Math.max(0, Math.ceil(words / 180))} min`;
  $("#readerProgress").value = chunks.length ? Math.round((currentChunk / chunks.length) * 100) : 0;
}

function chunkText(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|\S.+$/g) || [clean];
  const result = [];
  let buffer = "";
  for (const sentence of sentences) {
    if ((buffer + sentence).length > 900 && buffer) {
      result.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer += ` ${sentence}`;
    }
  }
  if (buffer.trim()) result.push(buffer.trim());
  return result;
}

function speakFrom(index) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  if (!chunks.length) updateChunks();
  if (!chunks.length) return;
  window.speechSynthesis.cancel();
  currentChunk = Math.max(0, Math.min(index, chunks.length - 1));
  state.readerPosition = currentChunk;
  saveState();
  updateChunks();
  activeUtterance = new window.SpeechSynthesisUtterance(chunks[currentChunk]);
  activeUtterance.rate = Number($("#speechRate").value);
  activeUtterance.voice = voices.find(voice => voice.name === $("#voiceSelect").value) || null;
  activeUtterance.onend = () => {
    if (currentChunk < chunks.length - 1) {
      currentChunk += 1;
      state.readerPosition = currentChunk;
      saveState();
      updateChunks();
      speakFrom(currentChunk);
    } else {
      $("#readerProgress").value = 100;
      saveReadingHistory();
    }
  };
  window.speechSynthesis.speak(activeUtterance);
}

function stopReader() {
  window.speechSynthesis?.cancel();
  saveReadingHistory();
}

function loadVoices() {
  const voiceSelect = $("#voiceSelect");
  if (!voiceSelect) return;
  if (!window.speechSynthesis) {
    voices = [];
    voiceSelect.innerHTML = "<option>Speech unavailable</option>";
    return;
  }
  voices = window.speechSynthesis.getVoices();
  voiceSelect.innerHTML = voices.length ? voices.map(voice => `<option>${escapeHtml(voice.name)}</option>`).join("") : "<option>Default voice</option>";
  if (state.fields.voice) $("#voiceSelect").value = state.fields.voice;
  voiceSelect.addEventListener("change", event => {
    state.fields.voice = event.target.value;
    saveState();
  }, { once: true });
}

function importTextFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $("#readerTitle").value = file.name.replace(/\.[^.]+$/, "");
    $("#readerText").value = String(reader.result);
    state.fields.readerTitle = $("#readerTitle").value;
    state.fields.readerText = $("#readerText").value;
    updateChunks();
    saveState();
  };
  reader.readAsText(file);
}

function saveReading() {
  const title = $("#readerTitle").value.trim() || `Reading ${new Date().toLocaleDateString()}`;
  const text = $("#readerText").value;
  if (!text.trim()) return;
  const existing = state.currentReadingId && state.readings.find(reading => reading.id === state.currentReadingId);
  const record = existing || { id: crypto.randomUUID(), favorite: false, history: [] };
  Object.assign(record, { title, text, updated: new Date().toLocaleString(), position: currentChunk });
  if (!existing) state.readings.unshift(record);
  state.currentReadingId = record.id;
  persistRender();
}

function toggleFavorite() {
  saveReading();
  const reading = state.readings.find(item => item.id === state.currentReadingId);
  if (reading) reading.favorite = !reading.favorite;
  persistRender();
}

function saveReadingHistory() {
  saveReading();
  const reading = state.readings.find(item => item.id === state.currentReadingId);
  if (reading) {
    reading.position = currentChunk;
    reading.history = [{ date: new Date().toLocaleString(), section: currentChunk + 1 }, ...(reading.history || [])].slice(0, 10);
    persistRender();
  }
}

function renderLibrary() {
  $("#libraryList").innerHTML = state.readings.map(reading => `<button class="library-item" data-reading="${reading.id}">${reading.favorite ? "★ " : ""}${escapeHtml(reading.title)}<br><small>${escapeHtml(reading.updated || "")}</small></button>`).join("") || "<p>No saved readings.</p>";
  $("#historyList").innerHTML = state.readings.flatMap(reading => (reading.history || []).map(item => `<p>${escapeHtml(reading.title)}<br><small>${escapeHtml(item.date)} · section ${item.section}</small></p>`)).slice(0, 6).join("") || "<p>No reading history.</p>";
  $$("[data-reading]").forEach(button => button.addEventListener("click", () => loadReading(button.dataset.reading)));
}

function loadReading(id) {
  const reading = state.readings.find(item => item.id === id);
  if (!reading) return;
  state.currentReadingId = id;
  $("#readerTitle").value = reading.title;
  $("#readerText").value = reading.text;
  currentChunk = reading.position || 0;
  state.readerPosition = currentChunk;
  state.fields.readerTitle = reading.title;
  state.fields.readerText = reading.text;
  updateChunks();
  saveState();
}

function bindSettings() {
  $("#themeSelect").value = state.theme;
  $("#themeSelect").addEventListener("change", event => {
    state.theme = event.target.value;
    saveState();
    applyTheme();
  });
  $("#exportData").addEventListener("click", () => {
    $("#backupOutput").value = JSON.stringify({ version: VERSION, build: BUILD, exported: new Date().toISOString(), state }, null, 2);
  });
  $("#importData").addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(String(reader.result));
        state = { ...defaultState, ...(backup.state || backup) };
        saveState();
        location.reload();
      } catch {
        $("#backupOutput").value = "Import failed: invalid JSON backup.";
      }
    };
    reader.readAsText(file);
  });
  $("#resetData").addEventListener("click", () => {
    if (confirm("Reset all local CP Command Center data?")) {
      localStorage.removeItem(STORE_KEY);
      location.reload();
    }
  });
}

function restoreFields() {
  Object.entries(state.fields || {}).forEach(([key, value]) => {
    const el = $$("[data-store]").find(input => input.dataset.store === key);
    if (el) el.value = value;
  });
}

function applyTheme() {
  const theme = getResolvedTheme();
  document.documentElement.dataset.theme = theme;
  const select = $("#themeSelect");
  if (select) select.value = state.theme;
}

function getResolvedTheme() {
  if (state.theme === "light" || state.theme === "dark") return state.theme;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    renderStatus();
    return;
  }
  try {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem("cpCommandCenter.swReloaded") === BUILD) return;
      sessionStorage.setItem("cpCommandCenter.swReloaded", BUILD);
      location.reload();
    });
    const registration = await navigator.serviceWorker.register("./sw.js");
    await registration.update?.();
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  } catch {
    // Status page reports unavailable when registration fails.
  }
  renderStatus();
}

function renderStatus() {
  const canStore = testLocalStorage();
  const deployment = location.hostname.includes("github.io") ? "GitHub Pages active" : "Not running on GitHub Pages";
  const offline = "serviceWorker" in navigator ? (navigator.serviceWorker.controller ? "Offline cache active" : "Offline cache installing or pending refresh") : "Service worker unavailable";
  $("#statusList").innerHTML = `
    <dt>Version</dt><dd>CP Command Center Version ${VERSION}</dd>
    <dt>Build number</dt><dd>${BUILD}</dd>
    <dt>Last update</dt><dd>${BUILD_TIME}</dd>
    <dt>Offline cache status</dt><dd>${offline}</dd>
    <dt>Local storage status</dt><dd>${canStore ? "Available" : "Unavailable"}</dd>
    <dt>GitHub deployment status</dt><dd>${deployment}</dd>
  `;
}

function testLocalStorage() {
  try {
    localStorage.setItem("cpCommandCenter.test", "1");
    localStorage.removeItem("cpCommandCenter.test");
    return true;
  } catch {
    return false;
  }
}

function drawChart(id, values, color) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width = canvas.clientWidth * devicePixelRatio;
  const height = canvas.height = 130 * devicePixelRatio;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1 * devicePixelRatio;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (height / 4) * i);
    ctx.lineTo(width, (height / 4) * i);
    ctx.stroke();
  }
  if (!values.length) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * devicePixelRatio;
  ctx.beginPath();
  values.forEach((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height * 0.72) - height * 0.14;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString();
}

function daysUntil(date) {
  const days = Math.ceil((new Date(date) - new Date()) / 86400000);
  return days >= 0 ? `${days.toLocaleString()} days until target retirement date` : "Target date has passed.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}
