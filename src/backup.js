import { zip, unzip, strToU8, strFromU8 } from "fflate";
import {
  normalizeEntry,
  readEntries,
  STORE_KEY,
  validateEntry,
} from "./diary.js";
import {
  getImage,
  imageFilename,
  inspectImage,
  MAX_IMAGE_BYTES,
  putImages,
  validImages,
} from "./images.js";

const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
const MANIFEST = "yohaku-backup.json";

export async function createBackup(entries) {
  if (
    entries.length > 10000 ||
    new Set(entries.map((entry) => entry.date)).size !== entries.length
  )
    throw new Error("日記の日数または日付の重複を確認してください。");
  const files = {};
  let size = 0;
  for (const entry of entries) {
    for (const image of entry.sleepImages || []) {
      const path = `images/${imageFilename(entry.date, image)}`;
      if (files[path]) continue;
      const blob = await getImage(image.id);
      if (blob.size !== image.size)
        throw new Error(
          "画像データが一致しないため、バックアップを中止しました。",
        );
      size += blob.size;
      if (size > MAX_BACKUP_BYTES)
        throw new Error(
          "画像の合計が200MBを超えています。各画像を個別に書き出してください。",
        );
      files[path] = new Uint8Array(await blob.arrayBuffer());
    }
  }
  files[MANIFEST] = strToU8(
    JSON.stringify(
      {
        format: "yohaku-backup",
        version: 1,
        entries: entries.map(normalizeEntry),
      },
      null,
      2,
    ),
  );
  if (files[MANIFEST].length > 5 * 1024 * 1024)
    throw new Error(
      "日記JSONが5MBを超えています。本文はJSONで、画像は個別に書き出してください。",
    );
  const bytes = await new Promise((resolve, reject) =>
    zip(files, { level: 0 }, (error, data) =>
      error ? reject(error) : resolve(data),
    ),
  );
  if (bytes.length > MAX_BACKUP_BYTES + 5 * 1024 * 1024)
    throw new Error(
      "バックアップ全体が205MBを超えています。本文はJSONで、画像は個別に書き出してください。",
    );
  return new Blob([bytes], { type: "application/zip" });
}

export async function readBackup(file) {
  if (!file.size || file.size > MAX_BACKUP_BYTES + 5 * 1024 * 1024)
    throw new Error("バックアップは205MB以下のZIPファイルを選んでください。");
  let oversized = false,
    totalSize = 0,
    count = 0;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise((resolve, reject) =>
    unzip(
      bytes,
      {
        filter: (item) => {
          if (
            item.name !== MANIFEST &&
            !/^images\/sleep-\d{4}-\d{2}-\d{2}-[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(
              item.name,
            )
          )
            return false;
          totalSize += item.originalSize;
          count += 1;
          if (
            item.originalSize >
              (item.name === MANIFEST ? 5 * 1024 * 1024 : MAX_IMAGE_BYTES) ||
            totalSize > MAX_BACKUP_BYTES + 5 * 1024 * 1024 ||
            count > 30001
          )
            oversized = true;
          return !oversized;
        },
      },
      (error, data) =>
        error
          ? reject(new Error("バックアップZIPを読み込めません。"))
          : resolve(data),
    ),
  );
  if (oversized) throw new Error("展開後のバックアップが大きすぎます。");
  if (!files[MANIFEST])
    throw new Error("余白の画像付きバックアップを選んでください。");
  let data;
  try {
    data = JSON.parse(strFromU8(files[MANIFEST]));
  } catch {
    throw new Error("バックアップの日記データが壊れています。");
  }
  if (
    !data ||
    typeof data !== "object" ||
    data.format !== "yohaku-backup" ||
    data.version !== 1 ||
    !Array.isArray(data.entries) ||
    data.entries.length > 10000 ||
    data.entries.some(
      (entry) =>
        !entry ||
        typeof entry.insights !== "string" ||
        typeof entry.achievements !== "string" ||
        Object.keys(validateEntry(entry)).length ||
        !validImages(entry.sleepImages),
    ) ||
    new Set(data.entries.map((entry) => entry.date)).size !==
      data.entries.length
  )
    throw new Error("バックアップの日記形式を確認してください。");
  const records = [],
    entries = [];
  for (const source of data.entries) {
    const images = [];
    for (const image of source.sleepImages || []) {
      const bytes = files[`images/${imageFilename(source.date, image)}`];
      if (!bytes || bytes.length !== image.size)
        throw new Error(
          `${source.date}の画像が不足しているため、復元を中止しました。`,
        );
      const blob = new Blob([bytes], { type: image.type });
      const info = await inspectImage(blob);
      if (
        info.type !== image.type ||
        info.width !== image.width ||
        info.height !== image.height
      )
        throw new Error("画像情報が一致しないため、復元を中止しました。");
      const id = crypto.randomUUID();
      images.push({ ...image, id });
      records.push({ id, blob });
    }
    entries.push(normalizeEntry({ ...source, sleepImages: images }));
  }
  return { entries, records };
}

export async function restoreBackup(backup, storage = localStorage) {
  readEntries(storage);
  // Store originals under fresh IDs first. A metadata write failure leaves existing records intact.
  await putImages(backup.records);
  const dates = new Set(backup.entries.map((entry) => entry.date));
  const entries = [
    ...readEntries(storage).filter((entry) => !dates.has(entry.date)),
    ...backup.entries,
  ].sort((a, b) => b.date.localeCompare(a.date));
  storage.setItem(STORE_KEY, JSON.stringify(entries));
  return entries;
}
