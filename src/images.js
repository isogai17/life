export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const DATABASE = "yohaku.images.v1";
const STORE = "images";

export function validImages(images) {
  return (
    images === undefined ||
    (Array.isArray(images) &&
      images.length <= MAX_IMAGES &&
      new Set(images.map((image) => image?.id)).size === images.length &&
      images.every(
        (image) =>
          image &&
          typeof image.id === "string" &&
          /^[a-zA-Z0-9_-]{1,100}$/.test(image.id) &&
          typeof image.name === "string" &&
          image.name.length > 0 &&
          image.name.length <= 255 &&
          IMAGE_TYPES.includes(image.type) &&
          Number.isInteger(image.size) &&
          image.size > 0 &&
          image.size <= MAX_IMAGE_BYTES &&
          Number.isInteger(image.width) &&
          image.width > 0 &&
          Number.isInteger(image.height) &&
          image.height > 0 &&
          image.width * image.height <= 40000000,
      ))
  );
}

export function imageFilename(date, image) {
  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }[image.type];
  return `sleep-${date}-${image.id}.${extension}`;
}

export function imageType(bytes) {
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

async function database() {
  return new Promise((resolve, reject) => {
    let request,
      blocked = false;
    try {
      request = indexedDB.open(DATABASE, 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("ほかのタブを閉じてから、もう一度お試しください。"));
    };
  });
}

export async function putImages(records) {
  if (!records.length) return;
  const db = await database();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error("画像の保存が中断されました。"));
      for (const record of records) transaction.objectStore(STORE).put(record);
    });
  } finally {
    db.close();
  }
}

export async function getImage(id) {
  const db = await database();
  try {
    const record = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error("画像を読み込めません。"));
    });
    if (!record?.blob)
      throw new Error(
        "画像がこのブラウザにありません。画像付きバックアップから復元してください。",
      );
    return record.blob;
  } finally {
    db.close();
  }
}

export async function inspectImage(blob) {
  if (!blob.size || blob.size > MAX_IMAGE_BYTES)
    throw new Error("画像は1枚10MB以下にしてください。");
  const type = imageType(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
  if (!type)
    throw new Error(
      "PNG・JPEG・WebP画像を選んでください。HEICはPNGやJPEGに変換してから添付できます。",
    );
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (
      !image.naturalWidth ||
      !image.naturalHeight ||
      image.naturalWidth * image.naturalHeight > 40000000
    )
      throw new Error(
        "画像が大きすぎます。4,000万画素以下の画像を選んでください。",
      );
    return { type, width: image.naturalWidth, height: image.naturalHeight };
  } catch (error) {
    if (error.message.includes("4,000万画素")) throw error;
    throw new Error(
      "画像を読み込めません。別のPNG・JPEG・WebP画像をお試しください。",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function attachImages(files, existing = []) {
  if (existing.length + files.length > MAX_IMAGES)
    throw new Error(`睡眠画像は1日${MAX_IMAGES}枚まで添付できます。`);
  const records = [];
  const metadata = [];
  for (const file of files) {
    const info = await inspectImage(file);
    const image = {
      id: crypto.randomUUID(),
      name: file.name.slice(0, 255),
      size: file.size,
      ...info,
    };
    records.push({ id: image.id, blob: file.slice(0, file.size, info.type) });
    metadata.push(image);
  }
  try {
    await putImages(records);
  } catch {
    throw new Error(
      "画像を保存できません。端末の空き容量やブラウザの保存設定を確認してください。日記本文はそのまま使えます。",
    );
  }
  return [...existing, ...metadata];
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function shareImage(date, image) {
  const blob = await getImage(image.id);
  const file = new File([blob], imageFilename(date, image), {
    type: image.type,
  });
  let canShare = false;
  try {
    canShare = Boolean(
      navigator.share && navigator.canShare?.({ files: [file] }),
    );
  } catch {
    /* Unsupported share formats use the download fallback. */
  }
  if (canShare) {
    try {
      await navigator.share({ files: [file], title: `${date}の睡眠記録` });
      return "shared";
    } catch (error) {
      if (error.name === "AbortError") return "cancelled";
    }
  }
  downloadBlob(blob, file.name);
  return "downloaded";
}
