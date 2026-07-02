(() => {
  "use strict";

  const ENHANCEMENT_VERSION = "5.2.2";
  const NEWS_CACHE_KEY = "cpCommandCenter.news.v5.2.2";
  const NEWS_CACHE_TTL = 15 * 60 * 1000;
  const RSS_PROXY = "https://api.rss2json.com/v1/api.json?rss_url=";

  const AFTERNOON_TRAINS = [
    { depart: "2:32 PM", arrive: "3:35 PM", minutes: 63, label: "Early afternoon", inWindow: false },
    { depart: "6:01 PM", arrive: "7:14 PM", minutes: 73, label: "Evening option 1", inWindow: true },
    { depart: "6:28 PM", arrive: "7:30 PM", minutes: 62, label: "Evening option 2", inWindow: true },
    { depart: "6:31 PM", arrive: "7:38 PM", minutes: 67, label: "First backup after 6:30", inWindow: false, backup: true }
  ];

  const NEWS_FEEDS = [
    {
      group: "ai",
      title: "AI Top Stories",
      query: '("artificial intelligence" OR "AI model" OR "generative AI") when:2d'
    },
    {
      group: "ai",
      title: "OpenAI & ChatGPT",
      query: '(OpenAI OR ChatGPT OR Codex OR Sora) when:7d'
    },
    {
      group: "ai",
      title: "Anthropic & Claude",
      query: '(Anthropic OR Claude AI) when:7d'
    },
    {
      group: "ai",
      title: "Google Gemini & DeepMind",
      query: '(Google Gemini OR Google DeepMind OR Gemini AI) when:7d'
    },
    {
      group: "ai",
      title: "Apple, Microsoft & Meta AI",
      query: '("Apple Intelligence" OR "Microsoft Copilot" OR "Meta AI" OR Llama) when:7d'
    },
    {
      group: "ai",
      title: "AI Chips, Agents & Robotics",
      query: '(NVIDIA AI OR AMD AI OR "AI agent" OR robotics OR automation) when:7d'
    },
    {
      group: "ai",
      title: "AI Safety, Law & Jobs",
      query: '("AI safety" OR "AI regulation" OR "AI law" OR "AI jobs") when:7d'
    },
    {
      group: "general",
      title: "Babylon, Long Island & Suffolk",
      query: '("West Babylon" OR "North Babylon" OR "Town of Babylon" OR "Suffolk County" OR "Long Island") when:3d'
    },
    {
      group: "general",
      title: "NYC, MTA & LIRR",
      query: '("New York City" OR MTA OR LIRR OR subway OR "Long Island Rail Road") when:3d'
    },
    {
      group: "general",
      title: "U.S. & Politics",
      query: '("United States" OR Congress OR White House OR politics) when:2d'
    },
    {
      group: "general",
      title: "Markets & Retirement",
      query: '("stock market" OR S&P 500 OR Federal Reserve OR retirement OR 401k) when:3d'
    },
    {
      group: "general",
      title: "World",
      query: '("world news" OR geopolitics OR Europe OR Asia OR Middle East) when:2d'
    }
  ];

  let currentNews = { updated: 0, feeds: [] };
  let refreshInProgress = false;

  document.addEventListener("DOMContentLoaded", initEnhancements);

  function initEnhancements() {
    injectStyles();
    rewriteVersionLabels();
    renderAfternoonTrains();
    bindNewsControls();
    installStatusVersionObserver();
    renderCachedNews();
    refreshNews({ force: false });
    window.setInterval(() => refreshNews({ force: false }), NEWS_CACHE_TTL);
  }

  function injectStyles() {
    const style = document.createElement("style");
    style.id = "cp-news-commute-styles";
    style.textContent = `
      .news-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px}
      .news-status{color:var(--muted);font-size:.92rem;line-height:1.45}
      .news-grid{display:grid;gap:12px}
      .news-category{border:1px solid var(--line);border-radius:18px;background:rgba(0,0,0,.14);overflow:hidden}
      .news-category>summary{cursor:pointer;padding:14px;font-weight:800;display:flex;justify-content:space-between;gap:12px;align-items:center}
      .news-category>summary::-webkit-details-marker{display:none}
      .news-category-count{color:var(--muted);font-size:.8rem;font-weight:600}
      .news-category-body{display:grid;gap:9px;padding:0 10px 12px}
      .news-item{border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.045);overflow:hidden}
      .news-item>summary{cursor:pointer;padding:12px;line-height:1.35;font-weight:750}
      .news-item>summary::-webkit-details-marker{display:none}
      .news-item-meta{display:block;color:var(--muted);font-size:.78rem;font-weight:500;margin-top:5px}
      .news-item-body{padding:0 12px 12px;color:var(--muted);line-height:1.5}
      .news-item-body p{margin:0 0 10px}
      .news-item-body a{display:inline-flex;align-items:center;min-height:42px;padding:9px 12px;border-radius:12px;background:var(--accent);color:#06111d;text-decoration:none;font-weight:800}
      .feed-error{padding:12px;color:var(--muted)}
      .train-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:12px 0}
      .train-option{border:1px solid var(--line);border-radius:18px;padding:13px;background:rgba(0,0,0,.16)}
      .train-option.next-train{outline:2px solid var(--accent);background:rgba(101,214,255,.10)}
      .train-option.backup{opacity:.78}
      .train-option small{display:block;color:var(--muted)}
      .train-option strong{display:block;font-size:1.18rem;margin:4px 0}
      .train-option span{display:block;color:var(--muted);font-size:.85rem;line-height:1.35}
      .source-note{color:var(--muted);font-size:.8rem;line-height:1.45}
      .news-badge{display:inline-block;padding:5px 8px;border-radius:999px;border:1px solid var(--line);font-size:.75rem;color:var(--muted);margin-right:5px}
      @media(max-width:520px){.news-toolbar>*{width:100%}.train-grid{grid-template-columns:1fr 1fr}}
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

  function installStatusVersionObserver() {
    const status = document.querySelector("#statusList");
    if (!status) return;
    new MutationObserver(patchStatusVersion).observe(status, { childList: true, subtree: true, characterData: true });
  }

  function patchStatusVersion() {
    const status = document.querySelector("#statusList");
    if (!status) return;
    status.querySelectorAll("dd").forEach(dd => {
      dd.textContent = dd.textContent.replaceAll("5.2.1", ENHANCEMENT_VERSION);
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
            <span>Penn Station → Babylon</span>
            <span>Arrives ${escapeHtml(train.arrive)} · ${train.minutes} min · direct</span>
            ${train.inWindow ? '<span class="news-badge">6:00–6:30 window</span>' : ""}
          </div>
        `).join("")}
      </div>
      <p class="source-note">
        Weekday timetable effective May 11–September 7, 2026, except holidays. The direct Penn departures inside your 6:00–6:30 PM window are 6:01 PM and 6:28 PM. The 6:31 PM is shown as the immediate backup after the window. Check TrainTime before leaving because tracks, delays and special schedules can change.
      </p>
    `;

    const dashboardDetail = document.querySelector("#dashboardCommuteDetail");
    if (dashboardDetail) {
      dashboardDetail.textContent = "AM 4:10 Babylon → Penn · PM 2:32 Penn → Babylon · evening 6:01 or 6:28.";
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
    document.querySelector("#refreshNews")?.addEventListener("click", () => refreshNews({ force: true }));
    document.querySelector("#sendNewsToReader")?.addEventListener("click", sendNewsDigestToReader);
  }

  function renderCachedNews() {
    try {
      const cached = JSON.parse(localStorage.getItem(NEWS_CACHE_KEY) || "null");
      if (!cached?.feeds?.length) return;
      currentNews = cached;
      renderNews(cached, { cached: true });
    } catch {
      // A bad news cache must never block the app.
    }
  }

  async function refreshNews({ force }) {
    if (refreshInProgress) return;
    if (!force && currentNews.updated && Date.now() - currentNews.updated < NEWS_CACHE_TTL) return;

    refreshInProgress = true;
    setNewsStatus("Refreshing 12 news feeds, including seven AI categories…");

    const settled = await Promise.allSettled(NEWS_FEEDS.map(loadFeed));
    const feeds = settled.map((result, index) => {
      if (result.status === "fulfilled") return result.value;
      return {
        ...NEWS_FEEDS[index],
        items: [],
        error: result.reason?.message || "Feed unavailable"
      };
    });

    const successful = feeds.filter(feed => feed.items.length);
    if (successful.length) {
      currentNews = { updated: Date.now(), feeds };
      try {
        localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(currentNews));
      } catch {
        // News remains usable even if the cache is full.
      }
      renderNews(currentNews, { cached: false });
    } else if (currentNews.feeds.length) {
      renderNews(currentNews, { cached: true, failedRefresh: true });
    } else {
      renderNews({ updated: Date.now(), feeds }, { cached: false, failedRefresh: true });
    }

    refreshInProgress = false;
  }

  async function loadFeed(feed) {
    const rssUrl = googleNewsRss(feed.query);
    const response = await fetchWithTimeout(`${RSS_PROXY}${encodeURIComponent(rssUrl)}`, 9000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (data.status && data.status !== "ok") throw new Error(data.message || "Feed service error");

    const items = (data.items || [])
      .map(normalizeArticle)
      .filter(article => article.title && article.link)
      .slice(0, 5);

    if (!items.length) throw new Error("No current articles returned");
    return { ...feed, items };
  }

  function googleNewsRss(query) {
    return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  }

  async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { cache: "no-store", signal: controller.signal });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function normalizeArticle(item) {
    const cleanTitle = stripHtml(item.title || "").trim();
    const split = splitTitleAndSource(cleanTitle);
    return {
      title: split.title,
      source: split.source || item.author || "News source",
      link: safeHttpUrl(item.link),
      published: item.pubDate || "",
      summary: shorten(stripHtml(item.description || item.content || ""), 340)
    };
  }

  function splitTitleAndSource(value) {
    const index = value.lastIndexOf(" - ");
    if (index < 0) return { title: value, source: "" };
    return {
      title: value.slice(0, index).trim(),
      source: value.slice(index + 3).trim()
    };
  }

  function renderNews(news, flags = {}) {
    renderFeedGroup("#aiNewsFeed", news.feeds.filter(feed => feed.group === "ai"));
    renderFeedGroup("#generalNewsFeed", news.feeds.filter(feed => feed.group === "general"));

    const updatedText = news.updated
      ? new Date(news.updated).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "not yet";

    const successfulCount = news.feeds.filter(feed => feed.items?.length).length;
    const mode = flags.cached ? "cached articles" : "live refresh";
    const failureText = flags.failedRefresh ? " · current refresh failed, keeping the last available articles" : "";
    setNewsStatus(`${successfulCount} of ${NEWS_FEEDS.length} feeds loaded · ${mode} · updated ${updatedText}${failureText}.`);

    const aiHeadlines = news.feeds
      .filter(feed => feed.group === "ai")
      .flatMap(feed => feed.items || [])
      .slice(0, 3)
      .map(article => article.title);

    const dashboard = document.querySelector("#foxNewsSummary");
    if (dashboard) {
      dashboard.textContent = aiHeadlines.length
        ? `AI updates: ${aiHeadlines.join(" · ")}`
        : "News Center is ready. Open News & AI for current articles.";
    }
  }

  function renderFeedGroup(selector, feeds) {
    const container = document.querySelector(selector);
    if (!container) return;

    container.innerHTML = feeds.map((feed, feedIndex) => `
      <details class="news-category" ${feedIndex < 2 ? "open" : ""}>
        <summary>
          <span>${escapeHtml(feed.title)}</span>
          <span class="news-category-count">${feed.items?.length || 0} articles</span>
        </summary>
        <div class="news-category-body">
          ${feed.items?.length
            ? feed.items.map(article => articleMarkup(article)).join("")
            : `<div class="feed-error">${escapeHtml(feed.error || "Feed unavailable. Use Refresh to try again.")}</div>`}
        </div>
      </details>
    `).join("");
  }

  function articleMarkup(article) {
    const date = formatArticleDate(article.published);
    return `
      <details class="news-item">
        <summary>
          ${escapeHtml(article.title)}
          <span class="news-item-meta">${escapeHtml(article.source)}${date ? ` · ${escapeHtml(date)}` : ""}</span>
        </summary>
        <div class="news-item-body">
          <p>${escapeHtml(article.summary || "Open the source for the complete article.")}</p>
          <a href="${escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">Read full article</a>
        </div>
      </details>
    `;
  }

  function sendNewsDigestToReader() {
    const loadedFeeds = currentNews.feeds.filter(feed => feed.items?.length);
    if (!loadedFeeds.length) {
      setNewsStatus("No articles are loaded yet. Refresh the News Center first.");
      return;
    }

    const digest = loadedFeeds.map(feed => {
      const stories = feed.items.map((article, index) =>
        `${index + 1}. ${article.title}. Source: ${article.source}. ${article.summary || ""}`
      ).join("\n\n");
      return `${feed.title}.\n\n${stories}`;
    }).join("\n\nPause point.\n\n");

    const title = document.querySelector("#readerTitle");
    const text = document.querySelector("#readerText");
    if (!title || !text) return;

    title.value = `CP News & AI Digest — ${new Date().toLocaleDateString()}`;
    text.value = digest;
    title.dispatchEvent(new Event("input", { bubbles: true }));
    text.dispatchEvent(new Event("input", { bubbles: true }));

    if (typeof window.setScreen === "function") {
      window.setScreen("reader");
    } else {
      document.querySelector('[data-screen="reader"]')?.classList.add("active");
    }
  }

  function setNewsStatus(message) {
    const status = document.querySelector("#newsStatus");
    if (status) status.textContent = message;
  }

  function formatArticleDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function stripHtml(value) {
    const doc = new DOMParser().parseFromString(String(value), "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function shorten(value, maxLength) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 1).trim()}…`;
  }

  function safeHttpUrl(value) {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
    } catch {
      return "#";
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }
})();
