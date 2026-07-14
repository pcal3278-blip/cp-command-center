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
  const freeReaderNeedsReset = localStorage.getItem("cpCommandCenter.freeReaderBuild") !== VERSION;
  if (freeReaderNeedsReset) state.readerRate = "0.93";
  $("#readerRate").value = state.readerRate || "0.93";
  $("#readerLarge").checked = Boolean(state.fields.readerLarge);
  updateReaderClass();
  updateReaderChunks();

  $("#readerText").addEventListener("input", event => { state.fields.readerText = event.target.value; updateReaderChunks(); saveState(); renderDashboard(); });
  $("#readerTitle").addEventListener("input", event => { state.fields.readerTitle = event.target.value; saveState(); renderDashboard(); });
  $("#readerRate").addEventListener("change", event => { state.readerRate = event.target.value; saveState(); });
  $("#readerVoice").addEventListener("change", event => { state.readerVoice = event.target.value; saveState(); });
  $("#readerLarge").addEventListener("change", event => { state.fields.readerLarge = event.target.checked; updateReaderClass(); saveState(); });
  $("#readerPlay").addEventListener("click", () => speakReader(readerIndex));
  $("#readerPause").addEventListener("click", () => { window.speechSynthesis?.pause(); setText("#readerStatus", "Paused."); });
  $("#readerResume").addEventListener("click", () => { window.speechSynthesis?.resume(); setText("#readerStatus", "Resumed."); });
  $("#readerStop").addEventListener("click", stopReader);
  $("#readerRestart").addEventListener("click", () => { readerIndex = 0; state.readerPosition = 0; saveState(); speakReader(0); });
  $("#readerImport").addEventListener("change", importReaderText);
  $("#saveReading").addEventListener("click", saveReading);
  $("#favoriteReading").addEventListener("click", toggleReadingFavorite);
  $("#newReading").addEventListener("click", newReading);
  window.speechSynthesis?.addEventListener("voiceschanged", loadReaderVoices);
  loadReaderVoices();
  renderReaderCategories();
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
      if ((buffer + " " + sentence).length > 520 && buffer) { result.push(buffer.trim()); buffer = sentence.trim(); }
      else buffer += ` ${sentence.trim()}`;
    }
    if (buffer.trim()) result.push(buffer.trim());
  }
  return result;
}

function speakReader(index) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) { showToast("Speech is not available in this browser."); return; }
  updateReaderChunks();
  if (!readerChunks.length) { showToast("Add text to the Reader first."); return; }
  window.speechSynthesis.cancel();
  readerIndex = Math.max(0, Math.min(index, readerChunks.length - 1));
  state.readerPosition = readerIndex; saveState(); updateReaderChunks();
  activeUtterance = new window.SpeechSynthesisUtterance(readerChunks[readerIndex]);
  activeUtterance.rate = Number($("#readerRate").value || 0.93);
  activeUtterance.pitch = 1.03;
  activeUtterance.voice = readerVoices.find(voice => voice.name === $("#readerVoice").value) || null;
  activeUtterance.onstart = () => setText("#readerStatus", `Playing section ${readerIndex + 1}.`);
  activeUtterance.onend = () => {
    if (readerIndex < readerChunks.length - 1) {
      readerIndex += 1; state.readerPosition = readerIndex; saveState(); updateReaderChunks();
      setTimeout(() => speakReader(readerIndex), 35);
    } else {
      $("#readerProgress").value = 100; setText("#readerStatus", "Reading complete."); saveReadingHistory();
    }
  };
  activeUtterance.onerror = event => { if (event.error !== "canceled" && event.error !== "interrupted") setText("#readerStatus", `Speech error: ${event.error}`); };
  window.speechSynthesis.speak(activeUtterance);
}

function stopReader() { window.speechSynthesis?.cancel(); setText("#readerStatus", `Stopped at section ${readerIndex + 1}. Position saved.`); state.readerPosition = readerIndex; saveState(); }
function loadReaderVoices() {
  readerVoices = window.speechSynthesis?.getVoices().filter(v => /^en/i.test(v.lang)) || [];
  const select = $("#readerVoice");
  const samantha = readerVoices.find(voice => /^Samantha$/i.test(voice.name) && /^en[-_]US/i.test(voice.lang))
    || readerVoices.find(voice => /Samantha/i.test(voice.name) && /^en[-_]US/i.test(voice.lang))
    || null;
  select.innerHTML = readerVoices.length ? readerVoices.map(voice => `<option value="${escapeHtml(voice.name)}">${voice === samantha ? "Recommended • " : ""}${escapeHtml(voice.name)} (${escapeHtml(voice.lang)})</option>`).join("") : "<option>Default system voice</option>";
  const settingsAreCurrent = localStorage.getItem("cpCommandCenter.freeReaderBuild") === VERSION;
  const savedVoice = settingsAreCurrent && state.readerVoice && readerVoices.some(voice => voice.name === state.readerVoice) ? state.readerVoice : "";
  const preferred = savedVoice || samantha?.name || readerVoices[0]?.name || "";
  if (preferred) { select.value = preferred; state.readerVoice = preferred; }
  localStorage.setItem("cpCommandCenter.freeReaderBuild", VERSION);
  saveState();
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
