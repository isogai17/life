import test from "node:test";
import assert from "node:assert/strict";
import {
  formatEntry,
  normalizeEntry,
  readEntries,
  saveEntry,
  STORE_KEY,
} from "../src/diary.js";
import {
  imageFilename,
  imageType,
  MAX_IMAGE_BYTES,
  validImages,
} from "../src/images.js";

const image = {
  id: "test-image-1",
  name: "睡眠.png",
  type: "image/png",
  size: 1200,
  width: 750,
  height: 1128,
};
const entry = {
  date: "2026-10-22",
  sleep: 7,
  condition: 4,
  mood: 4,
  insights: "よく眠れた",
  achievements: "",
};
function storage(raw = null) {
  let value = raw;
  return {
    getItem: () => value,
    setItem: (_, next) => {
      value = next;
    },
  };
}

test("legacy entries retain their original structure; attachments persist without binary data", () => {
  assert.deepEqual(normalizeEntry(entry), entry);
  const store = storage(JSON.stringify([entry]));
  const records = saveEntry({ ...entry, sleepImages: [image] }, store);
  assert.deepEqual(readEntries(store), records);
  assert.deepEqual(records[0].sleepImages, [image]);
  assert.ok(!JSON.stringify(records).includes("base64"));
});

test("copy includes attachment names and asks for actual images; diary text alone has no false attachment", () => {
  const text = formatEntry({ ...entry, sleepImages: [image] });
  assert.match(text, /睡眠画像: 1枚（画像ファイルは別途添付）/);
  assert.match(text, /判読できない箇所は推測しない/);
  const json = JSON.parse(text.split("```json\n")[1].split("\n```")[0]);
  assert.deepEqual(json.sleepImages[0], {
    ...image,
    fileName: "sleep-2026-10-22-test-image-1.png",
  });
  assert.ok(!formatEntry(entry).includes("睡眠画像"));
});

test("invalid attachment metadata never overwrites previous diary data", () => {
  const raw = JSON.stringify([entry]);
  for (const bad of [
    null,
    {},
    [{ ...image, id: "../escape" }],
    [{ ...image, size: MAX_IMAGE_BYTES + 1 }],
    [{ ...image, type: "image/svg+xml" }],
    [image, image],
    [image, image, image, image],
  ]) {
    const store = storage(raw);
    assert.equal(validImages(bad), false);
    assert.throws(() => saveEntry({ ...entry, sleepImages: bad }, store));
    assert.equal(store.getItem(STORE_KEY), raw);
  }
});

test("actual file signatures identify supported formats and reject renamed files", () => {
  assert.equal(
    imageType(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/png",
  );
  assert.equal(imageType(Uint8Array.from([255, 216, 255, 224])), "image/jpeg");
  assert.equal(
    imageType(new TextEncoder().encode("RIFFxxxxWEBP")),
    "image/webp",
  );
  assert.equal(imageType(new TextEncoder().encode("<svg></svg>")), null);
  assert.equal(imageType(new TextEncoder().encode("not-an-image.png")), null);
  assert.equal(
    imageFilename(entry.date, { ...image, type: "image/jpeg" }),
    "sleep-2026-10-22-test-image-1.jpg",
  );
});
