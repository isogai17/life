import { serveWeather } from "../server/weather-service.js";
export default function handler(request, response) {
  return serveWeather(request, response, "weather");
}
