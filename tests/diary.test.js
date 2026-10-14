import test from "node:test";
import assert from "node:assert/strict";
import {
  formatEntry,
  localDate,
  readEntries,
  saveEntry,
  STORE_KEY,
  validateEntry,
} from "../src/diary.js";

const entry = {
  date: "2026-10-14",
  sleep: "7.5",
  condition: 4,
  mood: 5,
  insights: "散歩で気分がすっきり。",
  achievements: "本を読めた。",
};
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test("Markdown and JSON match the specified format, including numeric values", () => {
  const result = formatEntry(entry);
  assert.match(
    result,
    /^【日記データ記録】\n- 日付: 2026-10-14\n- 睡眠時間: 7\.5時間\n- 体調: 4\/5\n- 気分: 5\/5/,
  );
  const json = result.split("```json\n")[1].split("\n```")[0];
  assert.deepEqual(JSON.parse(json), { ...entry, sleep: 7.5 });
});

test("multiline notes, quotes, Unicode, and backticks survive JSON serialization", () => {
  const special = {
    ...entry,
    insights: '「気づき」\n"引用"\\パス 🌱',
    achievements: "```\nできた",
  };
  const result = formatEntry(special);
  assert.ok(result.includes("````json\n"));
  assert.deepEqual(
    JSON.parse(result.split("````json\n")[1].split("\n````")[0]),
    { ...special, sleep: 7.5 },
  );
});

test("sleep requires a number from 0 to 24 at half-hour intervals", () => {
  for (const sleep of [0, "0", 7.5, 24])
    assert.equal(validateEntry({ ...entry, sleep }).sleep, undefined);
  for (const sleep of ["", null, -0.5, 24.5, 7.2, "abc", Infinity])
    assert.ok(validateEntry({ ...entry, sleep }).sleep);
});

test("date and both ratings are required; notes are optional", () => {
  assert.deepEqual(
    validateEntry({ ...entry, insights: "", achievements: "" }),
    {},
  );
  for (const date of ["", "2026-02-29", "2026-13-01", "2026-10-32"])
    assert.ok(validateEntry({ ...entry, date }).date);
  assert.equal(validateEntry({ ...entry, date: "2028-02-29" }).date, undefined);
  for (const value of [null, 0, 6, 2.5, "4"]) {
    assert.ok(validateEntry({ ...entry, condition: value }).condition);
    assert.ok(validateEntry({ ...entry, mood: value }).mood);
  }
});

test("default dates use the local calendar rather than a UTC conversion", () => {
  const localMidnight = new Date(2026, 9, 14, 0, 5);
  assert.equal(localDate(localMidnight), "2026-10-14");
});

test("records persist, sort newest first, and update the same date", () => {
  const storage = memoryStorage();
  assert.deepEqual(readEntries(storage), []);
  saveEntry(entry, storage);
  saveEntry({ ...entry, date: "2026-10-13" }, storage);
  const updated = saveEntry({ ...entry, insights: "更新した気づき" }, storage);
  assert.equal(updated.length, 2);
  assert.equal(updated[0].insights, "更新した気づき");
  assert.deepEqual(readEntries(storage), updated);
});

test("corrupt storage and invalid new entries never overwrite saved data", () => {
  for (const raw of [
    "not-json",
    "{}",
    "[null]",
    JSON.stringify([{ ...entry, mood: 0 }]),
  ]) {
    const storage = memoryStorage({ [STORE_KEY]: raw });
    assert.throws(() => saveEntry(entry, storage));
    assert.equal(storage.getItem(STORE_KEY), raw);
  }
  const storage = memoryStorage();
  assert.throws(() => saveEntry({ ...entry, sleep: -1 }, storage));
  assert.equal(storage.getItem(STORE_KEY), null);
});
