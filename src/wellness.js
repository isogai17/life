export const SYMPTOMS = [
  ["headache", "頭痛"],
  ["dizziness", "めまい"],
  ["fatigue", "だるさ"],
  ["palpitations", "動悸"],
  ["digestive", "胃腸の不調"],
  ["tension", "不安・緊張"],
];
export const ACTIONS = [
  ["rest", "休憩"],
  ["walk", "散歩"],
  ["stretch", "ストレッチ"],
  ["breathing", "呼吸を整える"],
  ["routine", "生活リズムを整える"],
  ["other", "その他"],
];
export const EFFECTS = {
  unknown: "未評価",
  better: "楽になった",
  same: "変わらない",
  worse: "つらくなった",
};
export const EVENT_TYPES = {
  acupuncture: "鍼灸",
  clinic: "通院",
  travel: "移動",
  social: "人との予定",
  other: "その他の予定",
};
export const SEVERITIES = ["なし", "軽い", "中くらい", "強い", "とても強い"];
export const WEATHER_LABELS = {
  unknown: "未記録",
  sunny: "晴れ",
  cloudy: "くもり",
  rain: "雨",
  snow: "雪",
  fog: "霧",
  storm: "雷雨",
};
export const TIMINGS = {
  "": "未記録",
  morning: "朝",
  afternoon: "昼",
  evening: "夕方",
  night: "夜",
  allDay: "一日中",
};

export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function shiftDate(value, days) {
  if (!validDate(value)) throw new Error("日付を確認してください。");
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const optionalNumber = (value, min, max) =>
  value === null ||
  value === undefined ||
  (typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max);
export function validWeather(value, date) {
  if (value === undefined) return true;
  return Boolean(
    value &&
      value.date === date &&
      ["manual", "open-meteo"].includes(value.source) &&
      Object.hasOwn(WEATHER_LABELS, value.category) &&
      typeof value.location === "string" &&
      value.location.length <= 160 &&
      optionalNumber(value.temperature, -80, 60) &&
      optionalNumber(value.humidity, 0, 100) &&
      optionalNumber(value.pressure, 800, 1100) &&
      optionalNumber(value.pressureChange, -100, 100) &&
      (value.fetchedAt === undefined ||
        (typeof value.fetchedAt === "string" &&
          Number.isFinite(Date.parse(value.fetchedAt)))) &&
      (value.kind === undefined ||
        ["manual", "estimated", "forecast"].includes(value.kind)),
  );
}
export function validWellness(value) {
  if (value === undefined) return true;
  if (
    !value ||
    !value.symptoms ||
    typeof value.symptoms !== "object" ||
    Array.isArray(value.symptoms) ||
    !Array.isArray(value.actions)
  )
    return false;
  return (
    Object.entries(value.symptoms).every(
      ([key, severity]) =>
        SYMPTOMS.some(([id]) => id === key) &&
        (severity === null ||
          (Number.isInteger(severity) && severity >= 0 && severity <= 4)),
    ) &&
    optionalNumber(value.stress, 0, 4) &&
    (value.stress == null || Number.isInteger(value.stress)) &&
    Object.hasOwn(TIMINGS, value.timing || "") &&
    typeof value.notes === "string" &&
    value.notes.length <= 10000 &&
    (value.eventsRecorded === undefined ||
      typeof value.eventsRecorded === "boolean") &&
    (value.events === undefined ||
      (Array.isArray(value.events) &&
        value.events.length <= 20 &&
        new Set(value.events.map((event) => event?.id)).size ===
          value.events.length &&
        value.events.every(
          (event) =>
            event &&
            typeof event.id === "string" &&
            /^[a-zA-Z0-9_-]{1,100}$/.test(event.id) &&
            Object.hasOwn(EVENT_TYPES, event.type) &&
            optionalNumber(event.duration, 0, 1440) &&
            (event.duration == null || Number.isInteger(event.duration)) &&
            optionalNumber(event.burden, 0, 4) &&
            (event.burden == null || Number.isInteger(event.burden)) &&
            Object.hasOwn(EFFECTS, event.effect) &&
            Object.hasOwn(TIMINGS, event.timing || "") &&
            typeof event.note === "string" &&
            event.note.length <= 2000,
        ))) &&
    value.actions.length <= ACTIONS.length &&
    new Set(value.actions.map((action) => action?.id)).size ===
      value.actions.length &&
    value.actions.every(
      (action) =>
        action &&
        ACTIONS.some(([id]) => id === action.id) &&
        Object.hasOwn(EFFECTS, action.effect),
    )
  );
}
export function normalizeWeather(value) {
  if (!value) return undefined;
  return {
    date: value.date,
    source: value.source,
    category: value.category,
    location: value.location.trim(),
    temperature: value.temperature ?? null,
    humidity: value.humidity ?? null,
    pressure: value.pressure ?? null,
    pressureChange: value.pressureChange ?? null,
    kind: value.kind || (value.source === "manual" ? "manual" : "estimated"),
    ...(value.fetchedAt ? { fetchedAt: value.fetchedAt } : {}),
  };
}
export function normalizeWellness(value) {
  if (!value) return undefined;
  return {
    symptoms: { ...value.symptoms },
    stress: value.stress ?? null,
    timing: value.timing || "",
    actions: value.actions.map(({ id, effect }) => ({ id, effect })),
    notes: value.notes,
    eventsRecorded: Boolean(value.eventsRecorded || value.events?.length),
    events: (value.events || []).map(
      ({ id, type, duration, burden, effect, timing, note }) => ({
        id,
        type,
        duration: duration ?? null,
        burden: burden ?? null,
        effect,
        timing: timing || "",
        note,
      }),
    ),
  };
}
export function emptyWellness() {
  return {
    symptoms: {},
    stress: null,
    timing: "",
    actions: [],
    notes: "",
    events: [],
    eventsRecorded: false,
  };
}
export function manualWeather(date) {
  return {
    date,
    source: "manual",
    category: "unknown",
    location: "",
    temperature: null,
    humidity: null,
    pressure: null,
    pressureChange: null,
    kind: "manual",
  };
}
export function weatherCategory(code) {
  if (code === 0 || code === 1) return "sunny";
  if (code === 2 || code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
    return "rain";
  return "unknown";
}
export function wellnessMarkdown(entry) {
  const lines = [];
  if (entry.weather) {
    const w = entry.weather;
    lines.push(
      `- 天気: ${WEATHER_LABELS[w.category]}（${w.location || "地域未記録"}）`,
    );
    if (w.temperature != null)
      lines.push(`- 気温（日平均）: ${w.temperature}℃`);
    if (w.humidity != null) lines.push(`- 湿度（日平均）: ${w.humidity}%`);
    if (w.pressure != null)
      lines.push(`- 海面気圧（日平均）: ${w.pressure}hPa`);
    if (w.pressureChange != null)
      lines.push(
        `- 前日との平均気圧差: ${w.pressureChange > 0 ? "+" : ""}${w.pressureChange}hPa`,
      );
    lines.push(
      `- 天気の出典: ${w.source === "manual" ? "本人の手入力" : "Open-Meteo（気象モデルの推定・予報値）"}`,
    );
  }
  if (entry.wellness) {
    const w = entry.wellness;
    const symptoms = SYMPTOMS.filter(([id]) =>
      Object.hasOwn(w.symptoms, id),
    ).map(
      ([id, label]) =>
        `${label}: ${w.symptoms[id] == null ? "未評価" : `${w.symptoms[id]}/4`}`,
    );
    if (symptoms.length)
      lines.push(`- 症状の強さ（自己評価）: ${symptoms.join("、")}`);
    if (w.stress != null) lines.push(`- ストレス（自己評価）: ${w.stress}/4`);
    if (w.timing) lines.push(`- 気になった時間帯: ${TIMINGS[w.timing]}`);
    if (w.actions.length)
      lines.push(
        `- 試した対策と手応え: ${w.actions.map((action) => `${ACTIONS.find(([id]) => id === action.id)[1]}（${EFFECTS[action.effect]}）`).join("、")}`,
      );
    if (w.notes) lines.push(`- 体調・対策のメモ: ${w.notes}`);
    if (w.eventsRecorded || w.events?.length) {
      if (!w.events?.length)
        lines.push("- 通院・移動・人との予定: 予定なし（本人が確認）");
      for (const event of w.events || [])
        lines.push(
          `- ${EVENT_TYPES[event.type]}: ${[event.timing ? TIMINGS[event.timing] : "", event.duration != null ? `${event.duration}分` : "", event.burden != null ? `負担感${event.burden}/4` : "", `手応え: ${EFFECTS[event.effect]}`, event.note].filter(Boolean).join(" / ")}`,
        );
    }
  }
  return lines.length ? `\n${lines.join("\n")}` : "";
}
