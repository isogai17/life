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
  };
}

export function formatEntry(entry) {
  const data = normalizeEntry(entry);
  const json = JSON.stringify(data);
  const fence = "`".repeat(
    Math.max(
      3,
      ...[...json.matchAll(/`+/g)].map((match) => match[0].length + 1),
    ),
  );
  return `【日記データ記録】\n- 日付: ${data.date}\n- 睡眠時間: ${data.sleep}時間\n- 体調: ${data.condition}/5\n- 気分: ${data.mood}/5\n- 気づき: ${data.insights}\n- できたこと: ${data.achievements}\n\n${fence}json\n${json}\n${fence}`;
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
        Object.keys(validateEntry(entry)).length,
    )
  )
    throw new Error(
      "保存済みのデータを読み込めません。データ保護のため上書きを停止しています。",
    );
  return entries;
}

export function saveEntry(entry, storage = localStorage) {
  if (Object.keys(validateEntry(entry)).length)
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
