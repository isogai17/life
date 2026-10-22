import { fetchWeather, searchLocations } from "../server/weather-service.js";
// Vercel uses same-origin functions; static hosting uses Open-Meteo's public API.
async function api(path, fallback) {
  const response = await fetch(path, { signal: AbortSignal.timeout(18000) });
  if (
    response.status === 404 ||
    response.headers.get("content-type")?.includes("text/html")
  )
    return fallback();
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "気象サービスの応答を読み込めません。少し時間をおくか、手入力で記録してください。",
    );
  }
  if (!response.ok)
    throw new Error(
      data.error || "天気を取得できません。手入力も利用できます。",
    );
  return data;
}
export function findLocations(query) {
  return api(`/api/locations?${new URLSearchParams({ q: query })}`, () =>
    searchLocations(query),
  );
}
export function getWeather(location, date) {
  return api(
    `/api/weather?${new URLSearchParams({ latitude: location.latitude, longitude: location.longitude, timezone: location.timezone, date })}`,
    () => fetchWeather({ ...location, date }),
  );
}
