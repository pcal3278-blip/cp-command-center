"use strict";

const VERSION = "7.3.3";
const BUILD_DATE = "2026-07-15";
const STORE_KEY = "cpCommandCenter.v6.1";
const LEGACY_KEYS = [
  "cpCommandCenter.v5.2",
  "cpCommandCenter.v5.1",
  "cpCommandCenter.v6.live",
  "cpFuelLogV2",
  "cpFuelLogV2Backup",
  "cpFuelLogV1",
  "cp_mpg",
  "fuelHistory"
];
const FUEL_MIGRATION_KEY = "cpCommandCenter.fuelMigration.2026-07-15-v2";
const VEHICLES = ["2021 Chevy Silverado RST", "2007 Honda Civic"];
const LOCATIONS = {
  westBabylon: { name: "West Babylon", latitude: 40.7182, longitude: -73.3543 },
  nyc: { name: "Hell's Kitchen", latitude: 40.7644, longitude: -73.9924 }
};
const NEWS_FEEDS = {
  local: "https://news.google.com/rss/search?q=%28Long+Island+OR+Suffolk+County+OR+Nassau+County+OR+MTA+OR+NYC%29&hl=en-US&gl=US&ceid=US:en",
  ai: "https://news.google.com/rss/search?q=%28OpenAI+OR+ChatGPT+OR+artificial+intelligence+OR+Apple+Intelligence+OR+Claude+OR+Gemini%29&hl=en-US&gl=US&ceid=US:en",
  markets: "https://news.google.com/rss/search?q=%28stock+market+OR+retirement+OR+401k+OR+Federal+Reserve%29&hl=en-US&gl=US&ceid=US:en",
  world: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en"
};

const defaultState = {
  theme: "auto",
  activeScreen: "dashboard",
  reminders: ["Check TrainTime before leaving", "Review weather before commute"],
  fields: {},
  readings: [],
  currentReadingId: null,
  readerPosition: 0,
  readerRate: "0.93",
  readerEngine: "auto",
  readerNeuralVoice: "af_bella",
  readerVoice: "",
  fuel: [],
  maintenance: [],
  health: [],
  retirement: [],
  retirementTarget: "2033-05-15",
  weatherCache: null,
  newsCache: null
};

let state;
let readerChunks = [];
let readerIndex = 0;
let readerVoices = [];
let activeUtterance = null;
let editingFuelId = null;
let showCompletedMaintenance = false;
let installPrompt = null;
let toastTimer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const uid = () => (window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

window.addEventListener("DOMContentLoaded", init);
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  renderInstallStatus();
});
window.addEventListener("online", () => {
  if (typeof renderNetwork === "function") renderNetwork();
  if (typeof refreshExternalData === "function") refreshExternalData();
});
window.addEventListener("offline", () => {
  if (typeof renderNetwork === "function") renderNetwork();
});

function init() {
  try {
    state = loadAndMigrate();
    applyTheme();
    bindNavigation();
    bindGeneralForms();
    bindFuel();
    bindReader();
    bindWeatherNews();
    bindSettings();
    restoreFields();
    renderAll();
    updateClock();
    setInterval(updateClock, 1000);
    registerServiceWorker();
    refreshExternalData();
  } catch (error) {
    console.error("CP Command Center startup failure", error);
    showToast(`Startup recovery: ${error.message || "unknown error"}`, 7000);
  } finally {
    setTimeout(() => $("#loading")?.classList.add("hidden"), 350);
  }
}

function loadAndMigrate() {
  const current = safeJson(localStorage.getItem(STORE_KEY), null);
  const legacy = safeJson(localStorage.getItem("cpCommandCenter.v5.2"), {});
  const base = current ? { ...defaultState, ...current } : {
    ...defaultState,
    ...legacy,
    maintenance: Array.isArray(legacy.home) ? legacy.home.map(item => ({
      id: item.id || uid(), area: item.area || "Home", task: item.task || "Maintenance item", due: item.due || "",
      priority: item.priority || "Medium", notes: item.notes || "", complete: Boolean(item.complete), created: item.created || new Date().toISOString()
    })) : [],
    retirementTarget: legacy.retirementTarget || "2033-05-15"
  };
  const migrated = normalizeState(base);

  if (localStorage.getItem(FUEL_MIGRATION_KEY) !== "done") {
    const legacyFuel = LEGACY_KEYS.flatMap(key => legacyFuelItems(safeJson(localStorage.getItem(key), null), key));
    migrated.fuel = normalizeFuel([...(migrated.fuel || []), ...legacyFuel]);
    localStorage.setItem(FUEL_MIGRATION_KEY, "done");
  }

  localStorage.setItem(STORE_KEY, JSON.stringify(migrated));
  return migrated;
}

function legacyFuelItems(raw, sourceKey) {
  if (Array.isArray(raw)) return raw.map(item => ({ ...item, sourceKey }));
  if (!raw || typeof raw !== "object") return [];
  const candidates = ["fuel", "entries", "history", "log", "records", "mpg", "fuelHistory", "fuelLog", "data"];
  return candidates.flatMap(key => Array.isArray(raw[key]) ? raw[key].map(item => ({ ...item, sourceKey })) : []);
}

function normalizeState(raw) {
  return {
    ...defaultState,
    ...raw,
    reminders: Array.isArray(raw.reminders) ? raw.reminders : defaultState.reminders,
    fields: raw.fields && typeof raw.fields === "object" ? raw.fields : {},
    readings: Array.isArray(raw.readings) ? raw.readings : [],
    fuel: normalizeFuel(Array.isArray(raw.fuel) ? raw.fuel : []),
    maintenance: Array.isArray(raw.maintenance) ? raw.maintenance : [],
    health: Array.isArray(raw.health) ? raw.health : [],
    retirement: Array.isArray(raw.retirement) ? raw.retirement : []
  };
}

function normalizeFuel(items) {
  const seen = new Set();
  return items.map(item => {
    if (!item || typeof item !== "object") return null;
    let vehicle = item.vehicle || item.car || item.vehicleName || VEHICLES[0];
    if (/2021 Chevrolet Silverado RST/i.test(vehicle)) vehicle = VEHICLES[0];
    if (/2007 Honda Civic/i.test(vehicle)) vehicle = VEHICLES[1];

    const odometer = numberOr(item.odometer, item.currentMileage, item.currentOdometer, item.mileage);
    const gallons = numberOr(item.gallons, item.gal, item.gallonsFilled, item.gallonsAdded);
    let totalPaid = numberOr(item.totalPaid, item.totalCost, item.cost, item.amountPaid, item.paid);
    const legacyPriceIsTotal = item.sourceKey === "cpCommandCenter.v6.live" || Number(item.previous) > 0 || Number(item.cpm) > 0;
    if (!totalPaid && Number(item.price)) totalPaid = legacyPriceIsTotal ? Number(item.price) : Number(item.price) * gallons;
    if (!totalPaid && Number(item.pricePerGallon)) totalPaid = Number(item.pricePerGallon) * gallons;
    if (!totalPaid && Number(item.pricePerGal)) totalPaid = Number(item.pricePerGal) * gallons;

    const date = normalizeDate(item.date || item.dateFueled || item.fueledAt || item.created);
    const previousOdometer = numberOr(item.previousOdometer, item.previous, item.lastMileage);
    const savedMpg = numberOr(item.mpg);
    const milesDriven = numberOr(item.milesDriven, item.miles, savedMpg && gallons ? savedMpg * gallons : 0);
    const id = String(item.id || uid());
    const key = `${vehicle}|${date}|${odometer}|${gallons}|${totalPaid}`;
    if (seen.has(key)) return null;
    seen.add(key);

    return {
      id, vehicle, date, odometer: odometer || null, gallons, totalPaid,
      previousOdometer: previousOdometer || null,
      milesDriven: milesDriven || null,
      station: item.station || item.location || "",
      notes: item.notes || item.note || "",
      created: item.created || new Date().toISOString()
    };
  }).filter(item => item && (item.odometer > 0 || item.milesDriven > 0) && item.gallons > 0 && item.totalPaid >= 0);
}

function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
  catch (error) { console.error(error); showToast("Could not save local data."); return false; }
}

function bindNavigation() {
  $$('[data-nav]').forEach(button => button.addEventListener("click", () => setScreen(button.dataset.nav)));
  $$('[data-nav-target]').forEach(button => button.addEventListener("click", () => setScreen(button.dataset.navTarget)));
  $("#themeToggle").addEventListener("click", () => {
    state.theme = resolvedTheme() === "dark" ? "light" : "dark";
    saveState(); applyTheme();
  });
  setScreen(state.activeScreen || "dashboard", false);
}

function setScreen(screen, scroll = true) {
  const valid = $(`[data-screen="${cssEscape(screen)}"]`);
  if (!valid) screen = "dashboard";
  state.activeScreen = screen;
  saveState();
  $$(".screen").forEach(section => section.classList.toggle("active", section.dataset.screen === screen));
  $$('[data-nav]').forEach(button => button.classList.toggle("active", button.dataset.nav === screen));
  $("#screenTitle").textContent = screen === "vehicles" ? "MPG / Vehicles" : titleCase(screen);
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  $("#app")?.focus({ preventScroll: true });
}

function bindGeneralForms() {
  $("#reminderForm").addEventListener("submit", event => {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get("text")?.trim();
    if (!text) return;
    state.reminders.unshift(text.slice(0, 100));
    event.currentTarget.reset();
    persistRender("Reminder added.");
  });

  $("#maintenanceForm").addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (!data.task?.trim()) return;
    state.maintenance.unshift({ id: uid(), area: data.area, task: data.task.trim(), due: data.due || "", priority: data.priority, notes: data.notes?.trim() || "", complete: false, created: new Date().toISOString() });
    event.currentTarget.reset();
    persistRender("Maintenance item saved.");
  });

  $("#showCompletedMaintenance").addEventListener("click", () => {
    showCompletedMaintenance = !showCompletedMaintenance;
    $("#showCompletedMaintenance").textContent = showCompletedMaintenance ? "Hide completed" : "Show completed";
    renderMaintenance();
  });

  $("#healthForm").addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.health.unshift({ id: uid(), ...data, date: data.date || todayYmd(), created: new Date().toISOString() });
    event.currentTarget.reset();
    event.currentTarget.elements.date.value = todayYmd();
    persistRender("Health entry saved.");
  });

  $("#retirementForm").addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    state.retirement.unshift({
      id: uid(), date: data.date || todayYmd(), k401: Number(data.k401 || 0), b457: Number(data.b457 || 0),
      pension: Number(data.pension || 0), monthlyContribution: Number(data.monthlyContribution || 0), cash: Number(data.cash || 0)
    });
    event.currentTarget.reset();
    event.currentTarget.elements.date.value = todayYmd();
    persistRender("Retirement snapshot saved.");
  });

  $("#retirementTarget").addEventListener("change", event => {
    state.retirementTarget = event.target.value || "2033-05-15";
    saveState(); renderRetirement();
  });

  $$('[data-field]').forEach(input => input.addEventListener("input", () => {
    state.fields[input.dataset.field] = input.value;
    saveState();
  }));
}
