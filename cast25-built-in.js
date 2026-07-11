(() => {
  "use strict";

  const BUILTIN_ID = "builtin-cast25-2026-07-11";
  const TITLE = "Cast25 Live — July 11, 2026 — 35 Minutes";
  const TEXT_URL = "./readings/cast25-2026-07-11.txt?v=2026-07-11-1";

  async function installBuiltInReading() {
    try {
      const response = await fetch(TEXT_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`Cast25 file returned ${response.status}`);
      const text = (await response.text()).trim();
      if (!text) throw new Error("Cast25 file is empty");

      let record = state.readings.find(item => item.id === BUILTIN_ID);
      if (!record) {
        record = {
          id: BUILTIN_ID,
          title: TITLE,
          text,
          position: 0,
          favorite: true,
          history: [],
          builtIn: true,
          updated: new Date().toISOString()
        };
        state.readings.unshift(record);
        saveState();
        showToast("Today’s 35-minute Cast25 is ready in Reader.", 5000);
      } else if (record.text !== text || record.title !== TITLE) {
        record.title = TITLE;
        record.text = text;
        record.favorite = true;
        record.builtIn = true;
        record.updated = new Date().toISOString();
        saveState();
      }

      installButtons();
      renderReaderLibrary();
      renderDashboard();
    } catch (error) {
      console.error("Built-in Cast25 install failed", error);
      installButtons(true);
    }
  }

  function installButtons(loadFailed = false) {
    const dashboardReaderCard = document.querySelector('[data-nav-target="reader"]')?.closest(".card");
    if (dashboardReaderCard && !document.querySelector("#loadTodayCast25Dashboard")) {
      const button = document.createElement("button");
      button.id = "loadTodayCast25Dashboard";
      button.textContent = loadFailed ? "Retry today’s Cast25" : "▶ Play today’s 35-minute Cast25";
      button.addEventListener("click", loadBuiltInReading);
      dashboardReaderCard.appendChild(button);
    }

    const toolbar = document.querySelector(".reader-toolbar");
    if (toolbar && !document.querySelector("#loadTodayCast25Reader")) {
      const button = document.createElement("button");
      button.id = "loadTodayCast25Reader";
      button.className = "secondary";
      button.textContent = loadFailed ? "Retry Cast25" : "Today’s 35-min Cast25";
      button.addEventListener("click", loadBuiltInReading);
      toolbar.appendChild(button);
    }
  }

  function loadBuiltInReading() {
    const record = state.readings.find(item => item.id === BUILTIN_ID);
    if (!record) {
      installBuiltInReading();
      return;
    }
    loadReading(BUILTIN_ID);
    setScreen("reader");
    showToast("Cast25 loaded. Set 0.8× and tap Play.", 5000);
    document.querySelector("#readerPlay")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(installBuiltInReading, 300), { once: true });
  } else {
    setTimeout(installBuiltInReading, 300);
  }
})();
