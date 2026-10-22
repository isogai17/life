import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyWellness,
  manualWeather,
  normalizeWellness,
  shiftDate,
  validWeather,
  validWellness,
} from "../src/wellness.js";
import { analyzeEntries, formatAnalysis } from "../src/trends.js";
import {
  formatEntry,
  normalizeEntry,
  readEntries,
  saveEntry,
  STORE_KEY,
  validateEntry,
} from "../src/diary.js";
import {
  fetchWeather,
  searchLocations,
  serveWeather,
} from "../server/weather-service.js";

const entry = (date, condition = 3) => ({
  date,
  condition,
  mood: 3,
  sleep: 7,
  insights: "",
  achievements: "",
});
const event = (type = "acupuncture") => ({
  id: "event-1",
  type,
  duration: 60,
  burden: 2,
  effect: "better",
  timing: "morning",
  note: "受診後の感想",
});
const weather = (date, location = "横浜市", pressureChange = -7) => ({
  ...manualWeather(date),
  location,
  category: "rain",
  temperature: 20,
  humidity: 80,
  pressure: 1007,
  pressureChange,
});
function hourly(date, { pressure = 1007, previous = 1014 } = {}) {
  const time = [shiftDate(date, -1), date].flatMap((day) =>
    Array.from(
      { length: 24 },
      (_, hour) => `${day}T${String(hour).padStart(2, "0")}:00`,
    ),
  );
  return {
    hourly: {
      time,
      temperature_2m: time.map(() => 20),
      relative_humidity_2m: time.map(() => 0),
      pressure_msl: time.map((_, index) => (index < 24 ? previous : pressure)),
      weather_code: time.map((_, index) => (index === 36 ? 61 : 3)),
    },
  };
}

test("optional new records preserve legacy diaries and retain zero as a real observation", () => {
  const old = entry("2026-10-22");
  assert.deepEqual(normalizeEntry(old), old);
  const data = {
    ...old,
    weather: weather(old.date),
    wellness: {
      ...emptyWellness(),
      symptoms: { headache: 0, fatigue: null },
      stress: 0,
      events: [event()],
      eventsRecorded: true,
    },
  };
  assert.deepEqual(validateEntry(data), {});
  const saved = normalizeEntry(data);
  assert.equal(saved.wellness.symptoms.headache, 0);
  assert.equal(saved.wellness.symptoms.fatigue, null);
  assert.equal(saved.wellness.symptoms.dizziness, undefined);
  assert.equal(saved.wellness.events[0].duration, 60);
  const text = formatEntry(saved);
  assert.match(text, /鍼灸: 朝 \/ 60分/);
  assert.match(text, /頭痛: 0\/4/);
  assert.match(text, /本人の手入力/);
  const parsed = JSON.parse(text.split("```json\n")[1].split("\n```")[0]);
  assert.deepEqual(parsed, saved);
});

test("invalid optional weather and event data cannot overwrite original saved records", () => {
  const old = entry("2026-10-22"),
    raw = JSON.stringify([old]);
  let value = raw;
  const store = {
    getItem: () => value,
    setItem: (_, next) => {
      value = next;
    },
  };
  for (const patch of [
    { weather: weather("2026-10-21") },
    { weather: { ...weather(old.date), humidity: 101 } },
    { wellness: { ...emptyWellness(), symptoms: { headache: -1 } } },
    {
      wellness: { ...emptyWellness(), events: [{ ...event(), duration: -10 }] },
    },
    { wellness: { ...emptyWellness(), events: [event(), event()] } },
  ]) {
    assert.ok(Object.keys(validateEntry({ ...old, ...patch })).length);
    assert.throws(() => saveEntry({ ...old, ...patch }, store));
    assert.equal(value, raw);
  }
  assert.deepEqual(readEntries(store), [old]);
  assert.equal(
    validWellness({ ...emptyWellness(), eventsRecorded: true }),
    true,
  );
  assert.equal(validWeather(undefined, old.date), true);
  assert.equal(validWellness({ ...emptyWellness(), stress: 0.5 }), false);
});

test("weather calculations use hourly daily means, previous calendar day, and noon weather", async () => {
  let requested;
  const result = await fetchWeather(
    {
      latitude: 35.5,
      longitude: 139.6,
      timezone: "Asia/Tokyo",
      date: "2026-10-22",
    },
    async (url) => {
      requested = url;
      return { ok: true, json: async () => hourly("2026-10-22") };
    },
    new Date("2026-10-22T03:00:00Z"),
  );
  assert.equal(requested.hostname, "api.open-meteo.com");
  assert.equal(requested.searchParams.get("start_date"), "2026-10-21");
  assert.equal(requested.searchParams.get("end_date"), "2026-10-22");
  assert.equal(result.pressure, 1007);
  assert.equal(result.pressureChange, -7);
  assert.equal(result.humidity, 0);
  assert.equal(result.category, "rain");
  assert.equal(result.kind, "forecast");
  assert.equal(
    validWeather({ ...result, location: "横浜市" }, result.date),
    true,
  );
});

test("historical weather uses archive; missing measurements and differences stay missing", async () => {
  let host;
  const data = hourly("2025-10-22", { previous: null });
  data.hourly.temperature_2m = data.hourly.temperature_2m.map((value, index) =>
    index >= 24 && index < 40 ? null : value,
  );
  const result = await fetchWeather(
    {
      latitude: 35,
      longitude: 139,
      timezone: "Asia/Tokyo",
      date: "2025-10-22",
    },
    async (url) => {
      host = url.hostname;
      return { ok: true, json: async () => data };
    },
    new Date("2026-10-22T00:00:00Z"),
  );
  assert.equal(host, "archive-api.open-meteo.com");
  assert.equal(result.kind, "estimated");
  assert.equal(result.temperature, null);
  assert.equal(result.pressureChange, null);
  await assert.rejects(() =>
    fetchWeather(
      {
        latitude: 35,
        longitude: 139,
        timezone: "Asia/Tokyo",
        date: "2026-02-30",
      },
      () => {
        throw new Error("must not request");
      },
    ),
  );
  await assert.rejects(() =>
    fetchWeather({
      latitude: 900,
      longitude: 139,
      timezone: "Asia/Tokyo",
      date: "2026-10-22",
    }),
  );
});

test("location lookup limits results to usable city coordinates; API rejects body uploads", async () => {
  let url;
  const cities = await searchLocations("Tokyo", async (next) => {
    url = next;
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            name: "東京",
            admin1: "東京都",
            country: "日本",
            latitude: 35.6895,
            longitude: 139.6917,
            timezone: "Asia/Tokyo",
          },
          { name: "invalid" },
        ],
      }),
    };
  });
  assert.equal(url.hostname, "geocoding-api.open-meteo.com");
  assert.equal(url.searchParams.get("name"), "Tokyo");
  assert.equal(cities.length, 1);
  assert.equal(cities[0].latitude, 35.69);
  const response = {
    status(code) {
      this.code = code;
      return this;
    },
    json(value) {
      this.body = value;
    },
  };
  await serveWeather(
    { method: "POST", body: { insights: "private" } },
    response,
    "weather",
  );
  assert.equal(response.code, 405);
  assert.ok(!JSON.stringify(response.body).includes("private"));
});

test("analysis does not treat missing symptoms as zero or undocumented events as absent", () => {
  const records = [
    {
      ...entry("2026-10-20"),
      wellness: {
        ...emptyWellness(),
        symptoms: { headache: 0 },
        events: [event()],
        eventsRecorded: true,
      },
    },
    entry("2026-10-21"),
    {
      ...entry("2026-10-22"),
      wellness: { ...emptyWellness(), eventsRecorded: true },
    },
  ];
  const report = analyzeEntries(records, 7, "2026-10-22");
  assert.equal(report.count, 3);
  assert.equal(report.missing, 4);
  assert.equal(report.symptoms[0].count, 1);
  assert.equal(report.symptoms[0].average, 0);
  assert.equal(report.symptoms[0].present, 0);
  assert.equal(report.eventsLogged, 2);
  assert.equal(report.events[0].comparison.rightCount, 1);
});

test("weather comparisons use one location, keep missing pressure out, and require both groups", () => {
  const records = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate("2026-10-16", index);
    return {
      ...entry(date, index < 3 ? 2 : 4),
      weather: weather(
        date,
        index === 6 ? "別の地域" : "横浜市",
        index < 3 ? -7 : -1,
      ),
    };
  });
  const report = analyzeEntries(records, 7, "2026-10-22");
  assert.equal(report.location, "横浜市");
  assert.equal(report.weatherCount, 6);
  assert.equal(report.weatherExcluded, 1);
  assert.equal(report.pressureComparison.enough, true);
  assert.equal(report.pressureComparison.leftAverage, 2);
  assert.equal(report.pressureComparison.rightAverage, 4);
  assert.equal(
    analyzeEntries(records.slice(1), 7, "2026-10-22").pressureComparison.enough,
    false,
  );
});

test("event comparisons pair the exact following day and exclude the period boundary", () => {
  const records = [
    {
      ...entry("2026-10-19", 1),
      wellness: { ...emptyWellness(), events: [event()] },
    },
    {
      ...entry("2026-10-21", 2),
      wellness: { ...emptyWellness(), events: [event()] },
    },
    {
      ...entry("2026-10-22", 4),
      wellness: { ...emptyWellness(), events: [event()] },
    },
  ];
  const item = analyzeEntries(records, 7, "2026-10-22").events[0];
  assert.equal(item.nextCount, 1);
  assert.equal(item.samePairedAverage, 2);
  assert.equal(item.nextAverage, 4);
  assert.equal(item.missingNext, 1);
  assert.equal(item.pendingNext, 1);
});

test("analysis excludes future records and copies auditable raw records with uncertainty", () => {
  const report = analyzeEntries(
    [entry("2026-10-22"), entry("2026-10-23"), entry("2020-01-01")],
    30,
    "2026-10-22",
  );
  assert.equal(report.count, 1);
  assert.equal(report.missing, 29);
  const text = formatAnalysis(report);
  assert.match(text, /因果|原因/);
  assert.match(text, /本人の感想/);
  assert.match(text, /未記録日は予定なしと扱わない/);
  assert.deepEqual(
    JSON.parse(text.split("```json\n")[1].split("\n```")[0]),
    report.records,
  );
  assert.equal(
    normalizeWellness({ ...emptyWellness(), events: [event()] }).eventsRecorded,
    true,
  );
});
