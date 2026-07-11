function renderReminders() {
  $("#reminderList").innerHTML = state.reminders.length ? state.reminders.slice(0,8).map((item,index)=>`<div class="item"><div class="item-head"><span>${escapeHtml(item)}</span><button data-reminder-delete="${index}" class="danger">Done</button></div></div>`).join("") : "<p class='muted'>No reminders.</p>";
  $$('[data-reminder-delete]').forEach(button => button.addEventListener("click", () => { state.reminders.splice(Number(button.dataset.reminderDelete),1); persistRender(); }));
}
function renderMaintenance() {
  const items = state.maintenance.filter(item => showCompletedMaintenance || !item.complete).sort((a,b) => Number(a.complete)-Number(b.complete) || priorityRank(a.priority)-priorityRank(b.priority) || String(a.due||"9999").localeCompare(String(b.due||"9999")));
  $("#maintenanceList").innerHTML = items.length ? items.map(item => `<div class="item"><div class="item-head"><div><h4>${escapeHtml(item.task)}</h4><span class="badge ${String(item.priority).toLowerCase()}">${escapeHtml(item.priority)}</span> <span class="badge">${escapeHtml(item.area)}</span></div><div class="row-actions"><button data-maint-complete="${item.id}" class="secondary">${item.complete?"Reopen":"Done"}</button><button data-maint-delete="${item.id}" class="danger">Delete</button></div></div><p>Due: ${escapeHtml(item.due || "not set")}</p>${item.notes?`<p>${escapeHtml(item.notes)}</p>`:""}</div>`).join("") : "<p>No matching maintenance items.</p>";
  $$('[data-maint-complete]').forEach(button => button.addEventListener("click", () => { const item=state.maintenance.find(x=>x.id===button.dataset.maintComplete); if(item)item.complete=!item.complete; persistRender(); }));
  $$('[data-maint-delete]').forEach(button => button.addEventListener("click", () => { if(confirm("Delete this maintenance item?")){state.maintenance=state.maintenance.filter(x=>x.id!==button.dataset.maintDelete);persistRender();} }));
}
function renderHealth() {
  const latest = state.health[0];
  setText("#healthLatest", latest ? `${latest.date}: BP ${latest.bp||"--"} · weight ${latest.weight||"--"} · sleep ${latest.sleep||"--"}h · recovery ${latest.recovery||"--"}% · HR ${latest.heartRate||"--"} · glucose ${latest.glucose||"--"}` : "No entries.");
  $("#healthHistory").innerHTML = state.health.length ? state.health.map(entry=>`<div class="item"><div class="item-head"><strong>${escapeHtml(entry.date)}</strong><button data-health-delete="${entry.id}" class="danger">Delete</button></div><p>BP ${escapeHtml(entry.bp||"--")} · weight ${escapeHtml(entry.weight||"--")} · sleep ${escapeHtml(entry.sleep||"--")}h · recovery ${escapeHtml(entry.recovery||"--")}% · HR ${escapeHtml(entry.heartRate||"--")} · glucose ${escapeHtml(entry.glucose||"--")}</p>${entry.notes?`<p>${escapeHtml(entry.notes)}</p>`:""}</div>`).join("") : "<p>No health history.</p>";
  $$('[data-health-delete]').forEach(button=>button.addEventListener("click",()=>{if(confirm("Delete this health entry?")){state.health=state.health.filter(x=>x.id!==button.dataset.healthDelete);persistRender();}}));
}
function renderRetirement() {
  $("#retirementTarget").value = state.retirementTarget || "2033-05-15";
  const latest = state.retirement[0];
  const days = daysUntil(state.retirementTarget);
  setText("#retirementCountdown", `${days.toLocaleString()} days until ${formatDate(state.retirementTarget)}.`);
  $("#retirementStats").innerHTML = latest ? [["401(k)",currency(latest.k401,0)],["457(b)",currency(latest.b457,0)],["Combined",currency(Number(latest.k401)+Number(latest.b457),0)],["Annual pension",currency(latest.pension,0)],["Monthly contribution",currency(latest.monthlyContribution,0)],["Cash",currency(latest.cash,0)]].map(([l,v])=>statTile(l,v)).join("") : "<p>No snapshots.</p>";
  $("#retirementHistory").innerHTML = state.retirement.length ? state.retirement.map(entry=>`<div class="item"><div class="item-head"><strong>${escapeHtml(entry.date)}</strong><button data-retire-delete="${entry.id}" class="danger">Delete</button></div><p>401(k) ${currency(entry.k401)} · 457(b) ${currency(entry.b457)} · pension ${currency(entry.pension)} · contribution ${currency(entry.monthlyContribution)}/mo · cash ${currency(entry.cash)}</p></div>`).join("") : "<p>No retirement history.</p>";
  $$('[data-retire-delete]').forEach(button=>button.addEventListener("click",()=>{if(confirm("Delete this retirement snapshot?")){state.retirement=state.retirement.filter(x=>x.id!==button.dataset.retireDelete);persistRender();}}));
}
function renderDashboard() {
  const fuel = calculatedFuel(VEHICLES[0]).find(row=>row.mpg);
  setText("#dashboardVehicle", fuel ? `Silverado ${formatNumber(fuel.mpg,1)} MPG · ${currency(fuel.costPerMile,3)}/mile` : "No completed Silverado MPG calculation yet.");
  const open = state.maintenance.filter(item=>!item.complete);
  setText("#dashboardMaintenance", open.length ? `${open.length} open · next: ${open[0].task}` : "No open maintenance items.");
  const readingTitle = $("#readerTitle")?.value || state.fields.readerTitle;
  setText("#dashboardReader", readingTitle ? `${readingTitle} · section ${readerIndex+1} of ${readerChunks.length}` : "No active reading.");
  setText("#dashboardRetirement", `${daysUntil(state.retirementTarget).toLocaleString()} days until ${formatDate(state.retirementTarget)}.`);
  renderSystemSummary();
}
function renderAll() {
  renderNetwork(); renderReminders(); renderFuel(); renderMaintenance(); renderHealth(); renderRetirement(); renderReaderLibrary(); renderWeather(); renderNews(); renderDashboard(); renderBuildStatus();
  $("#healthForm").elements.date.value ||= todayYmd();
  $("#retirementForm").elements.date.value ||= todayYmd();
}
function persistRender(message) { saveState(); renderAll(); if(message) showToast(message); }

function bindSettings() {
  $("#themeSelect").value = state.theme;
  $("#themeSelect").addEventListener("change", event => { state.theme=event.target.value;saveState();applyTheme(); });
  $("#installButton").addEventListener("click", installApp);
  $("#exportAll").addEventListener("click", () => downloadJson(`cp-command-center-backup-${todayYmd()}.json`, { app:"CP Command Center",version:VERSION,exported:new Date().toISOString(),state }));
  $("#importAll").addEventListener("change", event => { readJsonFile(event.target.files[0], data => { state=normalizeState(data.state||data); saveState(); location.reload(); }); event.target.value=""; });
  $("#resetAll").addEventListener("click", () => { if(confirm("Reset all locally saved CP Command Center data? Export a backup first.")){localStorage.removeItem(STORE_KEY);location.reload();} });
}
function restoreFields() { $$('[data-field]').forEach(input => { input.value = state.fields[input.dataset.field] || ""; }); }
function applyTheme() { document.documentElement.dataset.theme = resolvedTheme(); if($("#themeSelect")) $("#themeSelect").value=state.theme; }
function resolvedTheme() { if(["dark","light"].includes(state.theme))return state.theme; return matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"; }
async function installApp() { if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;renderInstallStatus();}else showToast("On iPhone, tap Share, then Add to Home Screen.",5000); }
function renderInstallStatus() { setText("#installHelp", installPrompt ? "Install prompt is ready." : "On iPhone: Share → Add to Home Screen."); }

async function registerServiceWorker() {
  if(!("serviceWorker" in navigator)){renderBuildStatus();return;}
  try{const registration=await navigator.serviceWorker.register(`./sw-v6.js?v=${VERSION}`);await registration.update();}
  catch(error){console.warn("Service worker",error);} renderBuildStatus();
}
function renderNetwork() { setText("#networkState", navigator.onLine?"Online":"Offline"); }
function renderSystemSummary() { const storage=testStorage()?"storage ready":"storage blocked"; const offline=navigator.serviceWorker?.controller?"offline cache active":"offline cache pending"; setText("#dashboardSystem", `${storage} · ${offline}`); }
function renderBuildStatus() {
  const rows = [["Version",VERSION],["Build date",BUILD_DATE],["Host",location.hostname||"local file"],["Network",navigator.onLine?"Online":"Offline"],["Local storage",testStorage()?"Available":"Unavailable"],["Offline cache",navigator.serviceWorker?.controller?"Active":"Installing / unavailable"],["Saved fuel entries",String(state.fuel.length)],["Saved readings",String(state.readings.length)],["Data storage","This browser/device only unless exported"]];
  $("#buildStatus").innerHTML=rows.map(([k,v])=>`<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join(""); renderInstallStatus();
}
function testStorage(){try{localStorage.setItem("cp.test","1");localStorage.removeItem("cp.test");return true}catch{return false}}

function updateClock() { const now=new Date(); setText("#clock",now.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}));setText("#dateLine",now.toLocaleDateString([],{weekday:"long",month:"long",day:"numeric",year:"numeric"}));setText("#todayLabel",now.toLocaleDateString([],{weekday:"long"}));setText("#lastRefresh",state.weatherCache?`Weather ${formatDateTime(state.weatherCache.updated)}`:"No live data yet"); }
function showToast(message, duration=3200){const toast=$("#toast");if(!toast)return;clearTimeout(toastTimer);toast.textContent=message;toast.classList.add("show");toastTimer=setTimeout(()=>toast.classList.remove("show"),duration)}
function setText(selector,value){const el=$(selector);if(el)el.textContent=value}
function safeJson(value,fallback){try{return value?JSON.parse(value):fallback}catch{return fallback}}
function numberOr(...values){for(const value of values){const n=Number(value);if(Number.isFinite(n)&&n!==0)return n}return 0}
function normalizeDate(value){if(!value)return todayYmd();const d=new Date(value);return Number.isNaN(d.getTime())?String(value).slice(0,10):d.toISOString().slice(0,10)}
function todayYmd(){const now=new Date();return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`}
function formatDate(value){if(!value)return "--";return new Date(`${value}T12:00:00`).toLocaleDateString([],{month:"long",day:"numeric",year:"numeric"})}
function formatDateTime(value){if(!value)return "--";const d=new Date(value);return Number.isNaN(d.getTime())?String(value):d.toLocaleString([],{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}
function formatHour(value){return new Date(value).toLocaleTimeString([],{hour:"numeric"})}
function formatNumber(value,digits=1){return Number(value||0).toLocaleString(undefined,{minimumFractionDigits:digits,maximumFractionDigits:digits})}
function currency(value,digits=2){return Number(value||0).toLocaleString(undefined,{style:"currency",currency:"USD",minimumFractionDigits:digits,maximumFractionDigits:digits})}
function sum(items,key){return items.reduce((total,item)=>total+Number(item[key]||0),0)}
function daysUntil(value){const target=new Date(`${value||"2033-05-15"}T00:00:00`);const now=new Date();now.setHours(0,0,0,0);return Math.max(0,Math.ceil((target-now)/86400000))}
function titleCase(value){return String(value).replace(/-/g," ").replace(/\b\w/g,char=>char.toUpperCase())}
function priorityRank(value){return value==="High"?0:value==="Medium"?1:2}
function statTile(label,value){return `<div class="stat-tile"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"})[char])}
function stripHtml(value){const div=document.createElement("div");div.innerHTML=String(value||"");return div.textContent||""}
function safeUrl(value){try{const url=new URL(value);return ["http:","https:"].includes(url.protocol)?url.href:"#"}catch{return "#"}}
function cssEscape(value){return window.CSS?.escape?CSS.escape(value):String(value).replace(/[^a-zA-Z0-9_-]/g,"")}
function csvCell(value){const text=String(value??"");return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}
function downloadText(filename,text,type="text/plain"){const blob=new Blob([text],{type});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function downloadJson(filename,data){downloadText(filename,JSON.stringify(data,null,2),"application/json")}
function readJsonFile(file,onSuccess){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{onSuccess(JSON.parse(String(reader.result)))}catch(error){showToast(`Import failed: ${error.message}`,5000)}};reader.readAsText(file)}
