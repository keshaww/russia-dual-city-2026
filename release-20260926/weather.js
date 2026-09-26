(() => {
  "use strict";

  const cities = [
    { name: "莫斯科", latitude: 55.7558, longitude: 37.6173 },
    { name: "圣彼得堡", latitude: 59.9343, longitude: 30.3351 }
  ];
  const cacheKey = "russia-dual-city-weather-v1";
  const grid = document.querySelector("#weather-grid");
  if (!grid) return;
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(cacheKey) || "{}"); } catch { /* Storage may be unavailable. */ }

  const descriptions = {
    0: "晴", 1: "大致晴", 2: "局部多云", 3: "阴", 45: "雾", 48: "雾凇",
    51: "小毛毛雨", 53: "毛毛雨", 55: "较强毛毛雨", 56: "冻毛毛雨", 57: "冻毛毛雨",
    61: "小雨", 63: "雨", 65: "大雨", 66: "冻雨", 67: "冻雨",
    71: "小雪", 73: "雪", 75: "大雪", 77: "雪粒", 80: "阵雨", 81: "阵雨", 82: "强阵雨",
    85: "阵雪", 86: "强阵雪", 95: "雷雨", 96: "雷雨伴冰雹", 99: "雷雨伴冰雹"
  };
  const text = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const condition = (code) => descriptions[code] || "天气变化";
  const degrees = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value))}°` : "—";
  const valid = (data) => data?.current && Array.isArray(data?.daily?.time) && data.daily.time.length > 0;

  function forDay(date, cityHint) {
    const hints = Array.isArray(cityHint) ? cityHint : [cityHint];
    const city = cities.find((candidate) => hints.includes(candidate.name));
    const data = city && cache[city.name]?.data;
    const index = data?.daily?.time?.indexOf(date) ?? -1;
    if (index < 0) return null;
    const rainyHour = (data.hourly?.time || []).findIndex((time, hour) =>
      time.startsWith(date) && Number(time.slice(11, 13)) >= 14 && Number(data.hourly.precipitation_probability?.[hour]) >= 60
    );
    return {
      city: city.name, date, condition: condition(data.daily.weather_code[index]),
      minimum: Math.round(data.daily.temperature_2m_min[index]),
      maximum: Math.round(data.daily.temperature_2m_max[index]),
      rainProbability: Math.round(Number(data.daily.precipitation_probability_max[index]) || 0),
      rainAfter: rainyHour >= 0 ? data.hourly.time[rainyHour].slice(11, 16) : ""
    };
  }
  window.TravelWeather = { forDay };

  function card(city, entry, stale = false) {
    if (!entry || !valid(entry.data)) {
      return `<article class="weather-card"><h3>${city.name}</h3><p>${stale || !navigator.onLine ? "暂无已缓存天气；联网后会自动更新。" : "正在获取天气…"}</p></article>`;
    }
    const { current, daily } = entry.data;
    const days = daily.time.map((day, index) => `<div class="weather-day">
      <time datetime="${text(day)}">${text(day.slice(5))}</time>
      <span>${text(condition(daily.weather_code[index]))}</span>
      <strong>${degrees(daily.temperature_2m_min[index])}～${degrees(daily.temperature_2m_max[index])}</strong>
      <small>降水 ${Math.round(Number(daily.precipitation_probability_max[index]) || 0)}%</small>
      ${window.TRAVEL_PLAN_DATA?.days?.some((item) => item.date === day) ? `<button type="button" data-weather-day="${text(day)}">查看当天行程</button>` : ""}
    </div>`).join("");
    return `<article class="weather-card"><div class="weather-current">
      <div><h3>${city.name}</h3><p>${text(condition(current.weather_code))}</p></div>
      <strong>${degrees(current.temperature_2m)}</strong>
    </div><p class="weather-updated">${text(current.time?.replace("T", " ") || "")} 当地天气 · 最后更新 ${entry.fetchedAt ? new Date(entry.fetchedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "未知"}${stale ? " · 离线数据" : ""}</p>
    <div class="weather-days">${days}</div></article>`;
  }

  function render(stale = false) {
    grid.innerHTML = cities.map((city) => card(city, cache[city.name], stale || !navigator.onLine || cache[city.name]?.failed || Date.now() - (cache[city.name]?.fetchedAt || 0) > 60 * 60 * 1000)).join("");
    window.dispatchEvent(new Event("travel-weather:updated"));
  }

  async function refresh() {
    if (!navigator.onLine) { render(true); return; }
    const results = await Promise.allSettled(cities.map(async (city) => {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: String(city.latitude), longitude: String(city.longitude),
        current: "temperature_2m,weather_code",
        daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        hourly: "precipitation_probability",
        forecast_days: "7", timezone: "Europe/Moscow"
      });
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
      const data = await response.json();
      if (!valid(data)) throw new Error("Weather response missing forecast");
      return { name: city.name, data };
    }));
    let anyFresh = false;
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        cache[result.value.name] = { data: result.value.data, fetchedAt: Date.now(), failed: false };
        anyFresh = true;
      } else if (cache[cities[index].name]) {
        cache[cities[index].name].failed = true;
      }
    });
    if (anyFresh) {
      try { localStorage.setItem(cacheKey, JSON.stringify(cache)); } catch { /* Keep in memory. */ }
    }
    render(!anyFresh);
  }

  if (Object.keys(cache).length) render(true);
  document.addEventListener("travel-data-ready", () => render());
  grid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-weather-day]");
    if (button) window.TravelTrip?.openDay?.(button.dataset.weatherDay);
  });
  void refresh();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && cities.some((city) => Date.now() - (cache[city.name]?.fetchedAt || 0) > 60 * 60 * 1000)) void refresh();
  });
  window.addEventListener("offline", () => render(true));
  window.addEventListener("online", () => { void refresh(); });
  setInterval(() => { if (!document.hidden) void refresh(); }, 60 * 60 * 1000);
})();
