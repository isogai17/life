import { imageFilename, validImages } from "./images.js";
import {
  normalizeWeather,
  normalizeWellness,
  validWeather,
  validWellness,
  wellnessMarkdown,
} from "./wellness.js";

export const STORE_KEY = "yohaku.entries.v1";
export const DRAFT_KEY = "yohaku.draft.v1";

export function localDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function emptyEntry() {
  return {
    date: localDate(),
    sleep: "",
    condition: null,
    mood: null,
    insights: "",
    achievements: "",
  };
}

export function validateEntry(entry) {
  const errors = {};
  const date = new Date(`${entry.date}T12:00:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
    !Number.isFinite(date.getTime()) ||
    localDate(date) !== entry.date
  )
    errors.date = "有効な日付を選んでください。";
  const sleep = Number(entry.sleep);
  if (
    entry.sleep === "" ||
    entry.sleep === null ||
    !Number.isFinite(sleep) ||
    sleep < 0 ||
    sleep > 24 ||
    !Number.isInteger(sleep * 2)
  )
    errors.sleep = "0〜24時間を、0.5時間刻みで入力してください。";
  for (const field of ["condition", "mood"]) {
    if (!Number.isInteger(entry[field]) || entry[field] < 1 || entry[field] > 5)
      errors[field] = "1〜5から選んでください。";
  }
  if (!validWeather(entry.weather, entry.date))
    errors.weather =
      "天気の日付や数値を確認してください。空欄は未記録のままにできます。";
  if (!validWellness(entry.wellness))
    errors.wellness =
      "症状の強さ・予定の所要時間・負担感などの入力を確認してください。";
  return errors;
}

export function normalizeEntry(entry) {
  return {
    date: entry.date,
    sleep: Number(entry.sleep),
    condition: entry.condition,
    mood: entry.mood,
    insights: entry.insights,
    achievements: entry.achievements,
    ...(entry.weather ? { weather: normalizeWeather(entry.weather) } : {}),
    ...(entry.wellness ? { wellness: normalizeWellness(entry.wellness) } : {}),
    ...(entry.sleepImages?.length
      ? {
          sleepImages: entry.sleepImages.map(
            ({ id, name, type, size, width, height }) => ({
              id,
              name,
              type,
              size,
              width,
              height,
            }),
          ),
        }
      : {}),
  };
}

export function formatEntry(entry) {
  const data = normalizeEntry(entry);
  if (data.sleepImages)
    data.sleepImages = data.sleepImages.map((image) => ({
      ...image,
      fileName: imageFilename(data.date, image),
    }));
  const json = JSON.stringify(data);
  const fence = "`".repeat(
    Math.max(
      3,
      ...[...json.matchAll(/`+/g)].map((match) => match[0].length + 1),
    ),
  );
  const images = data.sleepImages?.length
    ? `\n- 睡眠画像: ${data.sleepImages.length}枚（画像ファイルは別途添付）\n${data.sleepImages.map((image) => `  - ${image.fileName}`).join("\n")}\n\n【睡眠画像の確認】\nこの日記と一緒に添付した睡眠画像を一次資料として参照してください。読み取れる数値とグラフの傾向を分け、判読できない箇所は推測しないでください。画像が添付されていなければ、画像の追加を求めてください。`
    : "";
  return `【日記データ記録】\n- 日付: ${data.date}\n- 睡眠時間: ${data.sleep}時間\n- 体調: ${data.condition}/5\n- 気分: ${data.mood}/5\n- 気づき: ${data.insights}\n- できたこと: ${data.achievements}${wellnessMarkdown(data)}${images}\n\n${fence}json\n${json}\n${fence}`;
}

export function readEntries(storage = localStorage) {
  const raw = storage.getItem(STORE_KEY);
  if (raw === null) return [];
  const entries = JSON.parse(raw);
  if (
    !Array.isArray(entries) ||
    entries.some(
      (entry) =>
        !entry ||
        typeof entry.insights !== "string" ||
        typeof entry.achievements !== "string" ||
        !validImages(entry.sleepImages) ||
        Object.keys(validateEntry(entry)).length,
    )
  )
    throw new Error(
      "保存済みのデータを読み込めません。データ保護のため上書きを停止しています。",
    );
  return entries;
}

export function saveEntry(entry, storage = localStorage) {
  if (
    Object.keys(validateEntry(entry)).length ||
    !validImages(entry.sleepImages)
  )
    throw new Error("入力内容を確認してください。");
  const entries = readEntries(storage);
  const next = [
    normalizeEntry(entry),
    ...entries.filter((item) => item.date !== entry.date),
  ].sort((a, b) => b.date.localeCompare(a.date));
  storage.setItem(STORE_KEY, JSON.stringify(next));
  return next;
}

export async function copyText(text) {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const active = document.activeElement;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.cssText = "position:fixed;top:0;left:-9999px;";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      if (!document.execCommand("copy"))
        throw new Error(
          "自動コピーが使えません。表示された文章を選択してコピーしてください。",
        );
    } finally {
      textarea.remove();
      active?.focus();
    }
  }
}
