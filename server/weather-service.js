import { validDate, shiftDate, weatherCategory } from "../src/wellness.js";

async function fetchJSON(url, fetcher) {
  const response = await fetcher(url, {
    signal: AbortSignal.timeout(12000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      "気象サービスに接続できません。少し時間をおくか、手入力で記録してください。",
    );
  return response.json();
}
export async function searchLocations(query, fetcher = fetch) {
  if (
    typeof query !== "string" ||
    query.trim().length < 2 ||
    query.trim().length > 60
  )
    throw new Error("地域名を2〜60文字で入力してください。");
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name: query.trim(),
    count: "5",
    language: "ja",
    format: "json",
  });
  const data = await fetchJSON(url, fetcher);
  return (data.results || [])
    .filter(
      (item) =>
        typeof item.name === "string" &&
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude) &&
        typeof item.timezone === "string",
    )
    .map((item) => ({
      name: [item.name, item.admin1, item.country]
        .filter(
          (value, index, array) => value && array.indexOf(value) === index,
        )
        .join("・"),
      latitude: Math.round(item.latitude * 100) / 100,
      longitude: Math.round(item.longitude * 100) / 100,
      timezone: item.timezone,
    }));
}
export async function fetchWeather(
  { latitude, longitude, timezone, date },
  fetcher = fetch,
  now = new Date(),
) {
  const lat = Number(latitude),
    lon = Number(longitude);
  if (
    latitude == null ||
    latitude === "" ||
    longitude == null ||
    longitude === "" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    !validDate(date) ||
    typeof timezone !== "string" ||
    timezone.length > 64
  )
    throw new Error("地域と日付を選び直してください。");
  let today;
  try {
    today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    throw new Error("地域のタイムゾーンを確認してください。");
  }
  if (date > shiftDate(today, 14) || date < "1940-01-02")
    throw new Error("この日付の天気は取得できません。手入力で記録できます。");
  const recent = date >= shiftDate(today, -5);
  const url = new URL(
    recent
      ? "https://api.open-meteo.com/v1/forecast"
      : "https://archive-api.open-meteo.com/v1/archive",
  );
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone,
    start_date: shiftDate(date, -1),
    end_date: date,
    hourly: "temperature_2m,relative_humidity_2m,pressure_msl,weather_code",
  });
  const data = await fetchJSON(url, fetcher),
    h = data.hourly;
  if (!h || !Array.isArray(h.time))
    throw new Error("この日の気象データがありません。手入力で記録できます。");
  const indexes = (day) =>
    h.time.flatMap((time, index) =>
      typeof time === "string" && time.slice(0, 10) === day ? [index] : [],
    );
  const current = indexes(date),
    previous = indexes(shiftDate(date, -1));
  const average = (key, items) => {
    const values = items
      .map((index) => h[key]?.[index])
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    return values.length >= 23 && values.length === items.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  };
  const round = (value) => (value == null ? null : Math.round(value * 10) / 10);
  const pressure = average("pressure_msl", current),
    previousPressure = average("pressure_msl", previous);
  const noon = current.find((index) => h.time[index].slice(11, 13) === "12");
  const category = weatherCategory(
    noon === undefined ? null : h.weather_code?.[noon],
  );
  const result = {
    date,
    source: "open-meteo",
    kind: date >= today ? "forecast" : "estimated",
    category,
    temperature: round(average("temperature_2m", current)),
    humidity: round(average("relative_humidity_2m", current)),
    pressure: round(pressure),
    pressureChange:
      pressure == null || previousPressure == null
        ? null
        : round(pressure - previousPressure),
    fetchedAt: now.toISOString(),
  };
  if (
    !current.length ||
    [result.temperature, result.humidity, result.pressure].every(
      (value) => value == null,
    )
  )
    throw new Error("十分な気象データがありません。手入力で記録できます。");
  return result;
}

export async function serveWeather(request, response, kind) {
  if (request.method !== "GET") {
    response.status(405).json({ error: "GETのみ利用できます。" });
    return;
  }
  try {
    const result =
      kind === "locations"
        ? await searchLocations(request.query.q)
        : await fetchWeather(request.query);
    response.setHeader(
      "Cache-Control",
      "public, s-maxage=1800, stale-while-revalidate=3600",
    );
    response.status(200).json(result);
  } catch (error) {
    response.status(400).json({
      error:
        error.name === "TimeoutError"
          ? "気象サービスへの接続がタイムアウトしました。手入力も利用できます。"
          : error.message,
    });
  }
}
