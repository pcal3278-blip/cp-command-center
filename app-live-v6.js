function bindWeatherNews() {
  $("#refreshWeather").addEventListener("click", loadWeather);
  $("#refreshNews").addEventListener("click", loadNews);
  $("#sendNewsToReader").addEventListener("click", sendNewsToReader);
}

async function refreshExternalData() { await Promise.allSettled([loadWeather(), loadNews(false)]); }

async function loadWeather() {
  setText("#weatherHero", "Updating…");
  try {
    const [westBabylon, nyc] = await Promise.all(Object.values(LOCATIONS).map(fetchWeather));
    state.weatherCache = { updated: new Date().toISOString(), westBabylon, nyc };
    saveState(); renderWeather(); showToast("Weather updated.", 1800);
  } catch (error) {
    console.warn(error);
    renderWeather();
    setText("#weatherHeroDetail", state.weatherCache ? "Showing last saved weather. Live refresh failed." : "Weather unavailable. Check your connection.");
  }
}

async function fetchWeather(location) {
  const params = new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m", hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m", daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset", temperature_unit: "fahrenheit", wind_speed_unit: "mph", precipitation_unit: "inch", timezone: "America/New_York", forecast_days: "3" });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`${location.name} weather failed`);
  return { name: location.name, ...(await response.json()) };
}

function renderWeather() {
  const cache = state.weatherCache;
  if (!cache) return;
  const wb = cache.westBabylon, nyc = cache.nyc;
  const wbNow = wb.current || {};
  setText("#weatherHero", `${Math.round(wbNow.temperature_2m)}°F · ${weatherText(wbNow.weather_code)}`);
  setText("#weatherHeroDetail", `West Babylon · feels ${Math.round(wbNow.apparent_temperature)}° · wind ${Math.round(wbNow.wind_speed_10m)} mph · updated ${formatDateTime(cache.updated)}`);
  $("#westBabylonWeather").innerHTML = weatherBlock(wb);
  $("#nycWeather").innerHTML = weatherBlock(nyc);
  $("#hourlyWeather").innerHTML = (wb.hourly?.time || []).slice(0, 12).map((time, i) => `<div class="hour"><small>${formatHour(time)}</small><strong>${weatherIcon(wb.hourly.weather_code[i])} ${Math.round(wb.hourly.temperature_2m[i])}°</strong><small>Rain ${wb.hourly.precipitation_probability[i]}%</small><small>${Math.round(wb.hourly.wind_speed_10m[i])} mph</small></div>`).join("");
  $("#dailyWeather").innerHTML = (wb.daily?.time || []).slice(0,3).map((day,i) => `<div class="day"><strong>${new Date(`${day}T12:00:00`).toLocaleDateString([], {weekday:"long"})}</strong><span>${weatherIcon(wb.daily.weather_code[i])} ${weatherText(wb.daily.weather_code[i])}</span><span>${Math.round(wb.daily.temperature_2m_min[i])}° / ${Math.round(wb.daily.temperature_2m_max[i])}°</span><small>Rain ${wb.daily.precipitation_probability_max[i]}%</small></div>`).join("");
  setText("#dashboardWeather", `${Math.round(wbNow.temperature_2m)}°F · ${weatherText(wbNow.weather_code)}`);
  setText("#dashboardWeatherDetail", `Feels ${Math.round(wbNow.apparent_temperature)}° · NYC ${Math.round(nyc.current.temperature_2m)}° · wind ${Math.round(wbNow.wind_speed_10m)} mph`);
  setText("#commuteWeather", `${weatherIcon(wbNow.weather_code)} West Babylon ${Math.round(wbNow.temperature_2m)}°F, feels ${Math.round(wbNow.apparent_temperature)}°, wind ${Math.round(wbNow.wind_speed_10m)} mph. Hell's Kitchen ${Math.round(nyc.current.temperature_2m)}°F. Check live radar and alerts before leaving.`);
}
function weatherBlock(data) { const c=data.current||{}; return `<div class="weather-now">${weatherIcon(c.weather_code)} ${Math.round(c.temperature_2m)}°F</div><div class="weather-detail">${weatherText(c.weather_code)} · feels ${Math.round(c.apparent_temperature)}° · humidity ${c.relative_humidity_2m}%</div><div class="weather-detail">Wind ${Math.round(c.wind_speed_10m)} mph · gusts ${Math.round(c.wind_gusts_10m)} mph · precipitation ${Number(c.precipitation||0).toFixed(2)} in</div>`; }
function weatherText(code) { return ({0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Cloudy",45:"Fog",48:"Freezing fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",77:"Snow grains",80:"Rain showers",81:"Showers",82:"Heavy showers",85:"Snow showers",86:"Heavy snow showers",95:"Thunderstorms",96:"Storms with hail",99:"Severe storms with hail"})[code] || "Updated"; }
function weatherIcon(code) { if (code===0) return "☀️"; if ([1,2].includes(code)) return "🌤️"; if (code===3) return "☁️"; if ([45,48].includes(code)) return "🌫️"; if ([71,73,75,77,85,86].includes(code)) return "❄️"; if ([95,96,99].includes(code)) return "⛈️"; return "🌧️"; }

async function loadNews(showMessage = true) {
  setText("#newsStatus", "Requesting current headlines…");
  const keys = Object.keys(NEWS_FEEDS);
  const results = await Promise.allSettled(keys.map(key => fetchNewsFeed(key, NEWS_FEEDS[key])));
  const cache = state.newsCache || { feeds: {} };
  cache.updated = new Date().toISOString(); cache.feeds ||= {};
  results.forEach((result, index) => { if (result.status === "fulfilled") cache.feeds[keys[index]] = result.value; });
  state.newsCache = cache; saveState(); renderNews();
  const successful = results.filter(result => result.status === "fulfilled").length;
  setText("#newsStatus", successful ? `${successful} of ${keys.length} feeds refreshed · ${formatDateTime(cache.updated)}` : "Live feeds were blocked. Showing saved headlines and source links.");
  if (showMessage) showToast(successful ? "News refreshed." : "Live feeds unavailable; source links remain available.");
}
async function fetchNewsFeed(key, rssUrl) {
  const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`;
  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`${key} feed failed`);
  const data = await response.json();
  if (data.status && data.status !== "ok") throw new Error(data.message || `${key} feed failed`);
  return (data.items || []).slice(0, 6).map(item => ({ title: stripHtml(item.title), link: item.link, date: item.pubDate, source: item.author || data.feed?.title || "News" }));
}
function renderNews() {
  const feeds = state.newsCache?.feeds || {};
  renderNewsList("#localNewsFeed", feeds.local);
  renderNewsList("#aiNewsFeed", feeds.ai);
  renderNewsList("#marketNewsFeed", feeds.markets);
  renderNewsList("#worldNewsFeed", feeds.world);
}
function renderNewsList(selector, items) { $(selector).innerHTML = items?.length ? items.map(item => `<a class="news-item" href="${safeUrl(item.link)}" target="_blank" rel="noopener"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.source)} · ${formatDateTime(item.date)}</small></a>`).join("") : "<p class='muted'>No saved headlines. Use the source links or refresh.</p>"; }
function sendNewsToReader() {
  const feeds = state.newsCache?.feeds || {};
  const sections = [["Long Island / NYC / MTA", feeds.local],["AI & technology", feeds.ai],["Markets & retirement", feeds.markets],["National & world", feeds.world]];
  const text = sections.map(([title,items]) => `${title}.\n\n${(items||[]).map((item,i)=>`${i+1}. ${item.title}. Source: ${item.source}.`).join("\n\n") || "No current saved headlines."}`).join("\n\nPause point.\n\n");
  $("#readerTitle").value = `News Digest ${new Date().toLocaleDateString()}`;
  $("#readerText").value = text; state.fields.readerTitle = $("#readerTitle").value; state.fields.readerText = text; state.readerPosition=0; readerIndex=0; updateReaderChunks(); saveState(); setScreen("reader"); showToast("News digest sent to Reader.");
}
