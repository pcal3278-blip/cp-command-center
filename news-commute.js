(() => {
  "use strict";

  const ENHANCEMENT_VERSION = "5.2.3";
  const NEWS_CACHE_KEY = "cpCommandCenter.news.v5.2.2";
  const NEWS_CACHE_TTL = 15 * 60 * 1000;
  const RSS_PROXY = "https://api.rss2json.com/v1/api.json?rss_url=";

  // Every Penn departure Paul requested that reaches Babylon, including
  // Montauk/Speonk trains and transfer routes—not only Babylon-destination trains.
  const AFTERNOON_TRAINS = [
    {
      depart: "2:32 PM",
      arrive: "3:35 PM",
      minutes: 63,
      label: "Saved early train",
      route: "Direct Penn → Babylon",
      destination: "Babylon",
      trainNumber: "158",
      inWindow: false
    },
    {
      depart: "6:01 PM",
      arrive: "7:14 PM",
      minutes: 73,
      label: "Evening option 1",
      route: "Penn → Jamaica 6:23 PM; transfer to Montauk train departing Jamaica 6:31 PM",
      destination: "Montauk",
      trainNumber: "22",
      inWindow: true,
      transfer: true,
      caution: "8-minute Jamaica connection—confirm track in TrainTime"
    },
    {
      depart: "6:07 PM",
      arrive: "7:25 PM",
      minutes: 78,
      label: "Evening option 2",
      route: "Penn train 1172 → Wantagh 6:58 PM; transfer to train 272 about 7:03 PM",
      destination: "Babylon via Wantagh",
      trainNumber: "1172 → 272",
      inWindow: true,
      transfer: true,
      caution: "5-minute Wantagh connection—most delay-sensitive option"
    },
    {
      depart: "6:28 PM",
      arrive: "7:30 PM",
      minutes: 62,
      label: "Evening option 3",
      route: "Direct Penn → Babylon; train continues east to Speonk",
      destination: "Speonk",
      trainNumber: "44",
      inWindow: true
    },
    {
      depart: "6:31 PM",
      arrive: "7:38 PM",
      minutes: 67,
      label: "First backup after 6:30",
      route: "Direct Penn → Babylon",
      destination: "Babylon",
      trainNumber: "176",
      inWindow: false,
      backup: true
    }
  ];

  const NEWS_FEEDS = [
    ["ai", "AI Top Stories", '("artificial intelligence" OR "AI model" OR "generative AI") when:2d'],
    ["ai", "OpenAI & ChatGPT", '(OpenAI OR ChatGPT OR Codex OR Sora) when:7d'],
    ["ai", "Anthropic & Claude", '(Anthropic OR Claude AI) when:7d'],
    ["ai", "Google Gemini & DeepMind", '(Google Gemini OR Google DeepMind OR Gemini AI) when:7d'],
    ["ai", "Apple, Microsoft & Meta AI", '("Apple Intelligence" OR "Microsoft Copilot" OR "Meta AI" OR Llama) when:7d'],
    ["ai", "AI Chips, Agents & Robotics", '(NVIDIA AI OR AMD AI OR "AI agent" OR robotics OR automation) when:7d'],
    ["ai", "AI Safety, Law & Jobs", '("AI safety" OR "AI regulation" OR "AI law" OR "AI jobs") when:7d'],
    ["general", "Babylon, Long Island & Suffolk", '("West Babylon" OR "North Babylon" OR "Town of Babylon" OR "Suffolk County" OR "Long Island") when:3d'],
    ["general", "NYC, MTA & LIRR", '("New York City" OR MTA OR LIRR OR subway OR "Long Island Rail Road") when:3d'],
    ["general", "U.S. & Politics", '("United States" OR Congress OR White House OR politics) when:2d'],
    ["general", "Markets & Retirement", '("stock market" OR S&P 500 OR Federal Reserve OR retirement OR 401k) when:3d'],
    ["general", "World", '("world news" OR geopolitics OR Europe OR Asia OR Middle East) when:2d']
  ].map(([group, title, query]) => ({ group, title, query }));

  let currentNews = { updated: 0, feeds: [] };
  let refreshInProgress = false;

  document.addEventListener("DOMContentLoaded", () => {
    injectStyles();
    rewriteVersionLabels();
    rewriteCommuteDescription();
    renderAfternoonTrains();
    bindNewsControls();
    installStatusVersionObserver();
    renderCachedNews();
    refreshNews(false);
    window.setInterval(() => refreshNews(false), NEWS_CACHE_TTL);
  });

  function injectStyles() {
    const style = document.createElement("style");
    style.id = "cp-news-commute-styles";
    style.textContent = `
      .news-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}
      .news-status,.source-note{color:var(--muted);font-size:.88rem;line-height:1.5}
      .news-grid{display:grid;gap:12px}
      .news-category,.news-item{border:1px solid var(--line);border-radius:18px;background:rgba(0,0,0,.14);overflow:hidden}
      .news-category>summary,.news-item>summary{cursor:pointer;padding:14px;font-weight:800;line-height:1.4}
      .news-category>summary{display:flex;justify-content:space-between;gap:12px;align-items:center}
      .news-category>summary::-webkit-details-marker,.news-item>summary::-webkit-details-marker{display:none}
      .news-category-count,.news-item-meta{color:var(--muted);font-size:.78rem;font-weight:500}
      .news-item-meta{display:block;margin-top:5px}
      .news-category-body{display:grid;gap:9px;padding:0 10px 12px}
      .news-item{border-radius:15px;background:rgba(255,255,255,.045)}
      .news-item-body{padding:0 12px 12px;color:var(--muted);line-height:1.5}
      .news-item-body a{display:inline-flex;min-height:42px;align-items:center;padding:9px 12px;border-radius:12px;background:var(--accent);color:#06111d;text-decoration:none;font-weight:800}
      .feed-error{padding:12px;color:var(--muted)}
      .train-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px;margin:12px 0}
      .train-option{border:1px solid var(--line);border-radius:18px;padding:13px;background:rgba(0,0,0,.16)}
      .train-option.next-train{outline:2px solid var(--accent);background:rgba(101,214,255,.10)}
      .train-option.backup{opacity:.78}
      .train-option small,.train-option span{display:block;color:var(--muted);line-height:1.4}
      .train-option strong{display:block;font-size:1.18rem;margin:4px 0}
      .train-route{margin-top:7px;font-weight:700;color:var(--text)!important}
      .train-destination{margin-top:6px;color:var(--text)!important}
      .train-caution{margin-top:6px;color:#ffcc66!important;font-size:.78rem}
      .news-badge{display:inline-block!important;width:max-content;margin-top:8px;padding:5px 8px;border-radius:999px;border:1px solid var(--line);font-size:.74rem}
      @media(max-width:520px){.news-toolbar>*{width:100%}.train-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function rewriteVersionLabels() {
    document.title = `CP Command Center Version ${ENHANCEMENT_VERSION}`;
    document.querySelectorAll(".version-line").forEach(element => {
      element.innerHTML = `Version ${ENHANCEMENT_VERSION} · Build: ${ENHANCEMENT_VERSION} · <span id="lastUpdated">Last Updated: ${new Date().toLocaleString()}</span>`;
    });
    const loadingVersion = document.querySelector("#loading span");
    if (loadingVersion) loadingVersion.textContent = `Version ${ENHANCEMENT_VERSION}`;
    patchStatusVersion();
  }

  function rewriteCommuteDescription() {
    const container = document.querySelector("#afternoonTrainList");
    const intro = container?.previousElementSibling;
    if (intro) {
      intro.textContent = "Your saved 2:32 PM train and every Penn departure from 6:00 through 6:30 PM that reaches Babylon—including Montauk, Speonk, Babylon, and transfer routes.";
    }
  }

  function installStatusVersionObserver() {
    const status = document.querySelector("#statusList");
    if (!status) return;
    new MutationObserver(patchStatusVersion).observe(status, { childList: true, subtree: true, characterData: true });
  }

  function patchStatusVersion() {
    document.querySelectorAll("#statusList dd").forEach(dd => {
      const next = dd.textContent.replaceAll("5.2.1", ENHANCEMENT_VERSION).replaceAll("5.2.2", ENHANCEMENT_VERSION);
      if (next !== dd.textContent) dd.textContent = next;
    });
  }

  function renderAfternoonTrains() {
    const container = document.querySelector("#afternoonTrainList");
    if (!container) return;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const nextIndex = AFTERNOON_TRAINS.findIndex(train => parseClockMinutes(train.depart) >= nowMinutes);

    container.innerHTML = `
      <div class="train-grid">
        ${AFTERNOON_TRAINS.map((train, index) => `
          <div class="train-option ${index === nextIndex ? "next-train" : ""} ${train.backup ? "backup" : ""}">
            <small>${escapeHtml(train.label)}</small>
            <strong>${escapeHtml(train.depart)}</strong>
            <span>Arrives Babylon ${escapeHtml(train.arrive)} · ${train.minutes} min</span>
            <span class="train-destination">Destination: ${escapeHtml(train.destination)} · Train ${escapeHtml(train.trainNumber)}</span>
            <span class="train-route">${escapeHtml(train.route)}</span>
            ${train.inWindow ? '<span class="news-badge">6:00–6:30 departure</span>' : ""}
            ${train.transfer ? '<span class="news-badge">Transfer route</span>' : '<span class="news-badge">Single-seat ride</span>'}
            ${train.caution ? `<span class="train-caution">${escapeHtml(train.caution)}</span>` : ""}
          </div>
        `).join("")}
      </div>
      <p class="source-note">
        All Penn departures in your requested 6:00–6:30 PM window that reach Babylon are included: 6:01 via Jamaica to Montauk train 22, 6:07 via Wantagh using trains 1172 and 272, and 6:28 on Speonk train 44. The 6:31 Babylon train 176 is shown as the first backup after the window. Official weekday timetable effective May 11–September 7, 2026, except holidays. Always confirm tracks and transfer protection in TrainTime.
      </p>
    `;

    const dashboardDetail = document.querySelector("#dashboardCommuteDetail");
    if (dashboardDetail) {
      dashboardDetail.textContent = "2:32 Babylon · 6:01 Montauk via Jamaica · 6:07 via Wantagh · 6:28 Speonk · 6:31 Babylon backup.";
    }
  }

  function parseClockMinutes(value) {
    const match = value.match(/^(\d{1,2}):(\d{2})\s(AM|PM)$/);
    if (!match) return Number.POSITIVE_INFINITY;
    let hour = Number(match[1]) % 12;
    if (match[3] === "PM") hour += 12;
    return hour * 60 + Number(match[2]);
  }

  function bindNewsControls() {
    document.querySelector("#refreshNews")?.addEventListener("click", () => refreshNews(true));
    document.querySelector("#sendNewsToReader")?.addEventListener("click", sendNewsDigestToReader);
  }

  function renderCachedNews() {
    try {
      const cached = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY) || "null");
      if (!cached?.feeds?.length) return;
      currentNews = cached;
      renderNews(cached, { cached: true });
    } catch {
      // News cache corruption must never stop the app.
    }
  }

  async function refreshNews(force) {
    if (refreshInProgress) return;
    if (!force && currentNews.updated && Date.now() - currentNews.updated < NEWS_CACHE_TTL) return;
    refreshInProgress = true;
    setNewsStatus("Refreshing 12 feeds, including seven AI categories…");

    const settled = await Promise.allSettled(NEWS_FEEDS.map(loadFeed));
    const feeds = settled.map((result, index) => result.status === "fulfilled"
      ? result.value
      : { ...NEWS_FEEDS[index], items: [], error: result.reason?.message || "Feed unavailable" });

    if (feeds.some(feed => feed.items.length)) {
      currentNews = { updated: Date.now(), feeds };
      try { localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(currentNews)); } catch {}
      renderNews(currentNews, { cached: false });
    } else if (currentNews.feeds.length) {
      renderNews(currentNews, { cached: true, failedRefresh: true });
    } else {
      renderNews({ updated: Date.now(), feeds }, { failedRefresh: true });
    }
    refreshInProgress = false;
  }

  async function loadFeed(feed) {
    const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(feed.query)}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetchWithTimeout(`${RSS_PROXY}${encodeURIComponent(rss)}`, 9000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.status && data.status !== "ok") throw new Error(data.message || "Feed service error");
    const items = (data.items || []).map(normalizeArticle).filter(item => item.title && item.link).slice(0, 5);
    if (!items.length) throw new Error("No current articles returned");
    return { ...feed, items };
  }

  async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(url, { cache: "no-store", signal: controller.signal }); }
    finally { window.clearTimeout(timeout); }
  }

  function normalizeArticle(item) {
    const cleaned = stripHtml(item.title || "");
    const splitAt = cleaned.lastIndexOf(" - ");
    const title = splitAt >= 0 ? cleaned.slice(0, splitAt).trim() : cleaned;
    const source = splitAt >= 0 ? cleaned.slice(splitAt + 3).trim() : (item.author || "News source");
    return {
      title,
      source,
      link: safeHttpUrl(item.link),
      published: item.pubDate || "",
      summary: shorten(stripHtml(item.description || item.content || ""), 340)
    };
  }

  function renderNews(news, flags = {}) {
    renderFeedGroup("#aiNewsFeed", news.feeds.filter(feed => feed.group === "ai"));
    renderFeedGroup("#generalNewsFeed", news.feeds.filter(feed => feed.group === "general"));
    const successful = news.feeds.filter(feed => feed.items?.length).length;
    const updated = news.updated ? new Date(news.updated).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "not yet";
    setNewsStatus(`${successful} of ${NEWS_FEEDS.length} feeds loaded · ${flags.cached ? "cached articles" : "live refresh"} · updated ${updated}${flags.failedRefresh ? " · refresh failed; keeping available stories" : ""}.`);

    const ai = news.feeds.filter(feed => feed.group === "ai").flatMap(feed => feed.items || []).slice(0, 3).map(item => item.title);
    const dashboard = document.querySelector("#foxNewsSummary");
    if (dashboard) dashboard.textContent = ai.length ? `AI updates: ${ai.join(" · ")}` : "Open News & AI for current articles.";
  }

  function renderFeedGroup(selector, feeds) {
    const container = document.querySelector(selector);
    if (!container) return;
    container.innerHTML = feeds.map((feed, index) => `
      <details class="news-category" ${index < 2 ? "open" : ""}>
        <summary><span>${escapeHtml(feed.title)}</span><span class="news-category-count">${feed.items?.length || 0} articles</span></summary>
        <div class="news-category-body">
          ${feed.items?.length ? feed.items.map(articleMarkup).join("") : `<div class="feed-error">${escapeHtml(feed.error || "Feed unavailable. Refresh to try again.")}</div>`}
        </div>
      </details>`).join("");
  }

  function articleMarkup(article) {
    const date = formatArticleDate(article.published);
    return `<details class="news-item">
      <summary>${escapeHtml(article.title)}<span class="news-item-meta">${escapeHtml(article.source)}${date ? ` · ${escapeHtml(date)}` : ""}</span></summary>
      <div class="news-item-body"><p>${escapeHtml(article.summary || "Open the source for the complete article.")}</p><a href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">Read full article</a></div>
    </details>`;
  }

  function sendNewsDigestToReader() {
    const feeds = currentNews.feeds.filter(feed => feed.items?.length);
    if (!feeds.length) return setNewsStatus("No articles are loaded yet. Refresh first.");
    const digest = feeds.map(feed => `${feed.title}.\n\n${feed.items.map((item, index) => `${index + 1}. ${item.title}. Source: ${item.source}. ${item.summary || ""}`).join("\n\n")}`).join("\n\nPause point.\n\n");
    const title = document.querySelector("#readerTitle");
    const text = document.querySelector("#readerText");
    if (!title || !text) return;
    title.value = `CP News & AI Digest — ${new Date().toLocaleDateString()}`;
    text.value = digest;
    title.dispatchEvent(new Event("input", { bubbles: true }));
    text.dispatchEvent(new Event("input", { bubbles: true }));
    if (typeof window.setScreen === "function") window.setScreen("reader");
  }

  function setNewsStatus(message) {
    const element = document.querySelector("#newsStatus");
    if (element) element.textContent = message;
  }

  function formatArticleDate(value) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  }

  function stripHtml(value) {
    const doc = new DOMParser().parseFromString(String(value), "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function shorten(value, max) { return value.length <= max ? value : `${value.slice(0, max - 1).trim()}…`; }

  function safeHttpUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
    } catch { return "#"; }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
  }
})();
