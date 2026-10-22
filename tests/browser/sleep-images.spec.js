import { test, expect } from "@playwright/test";
import { unzipSync, zipSync } from "fflate";

async function fillDiary(page) {
  await page.locator("#date").fill("2026-10-22");
  await page.locator("#sleep").fill("7");
  await page
    .getByRole("group", { name: "今日の体調" })
    .getByRole("button", { name: "4：良い", exact: true })
    .click();
  await page
    .getByRole("group", { name: "今日の気分" })
    .getByRole("button", { name: "4：ごきげん", exact: true })
    .click();
}

async function imageFile(page, name = "sleep-original.png") {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 750;
    canvas.height = 1128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000039";
    ctx.fillRect(0, 0, 750, 1128);
    ctx.fillStyle = "white";
    ctx.font = "32px sans-serif";
    ctx.fillText("Sleep record / Test image", 45, 65);
    ctx.strokeStyle = "#42ddf2";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(50, 140);
    ctx.lineTo(100, 390);
    ctx.lineTo(400, 390);
    ctx.lineTo(500, 210);
    ctx.lineTo(600, 390);
    ctx.lineTo(700, 150);
    ctx.stroke();
    ctx.fillText("Sleep: 6h 43m 27s", 70, 600);
    ctx.fillText("Efficiency: 97.8%", 70, 680);
    ctx.fillText("Score: 92.5", 70, 760);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return { name, mimeType: "image/png", buffer: Buffer.from(data, "base64") };
}

async function attach(page, file) {
  await page.getByLabel("睡眠画像を追加", { exact: true }).setInputFiles(file);
  await expect(
    page.getByRole("img", { name: `睡眠記録：${file.name}`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "日記を保存", exact: true }),
  ).toBeEnabled();
}

async function downloadBytes(download) {
  const stream = await download.createReadStream(),
    chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function renderedBytes(page, name) {
  return Buffer.from(
    await page
      .getByRole("img", { name: `睡眠記録：${name}`, exact: true })
      .evaluate(async (img) => [
        ...new Uint8Array(await (await fetch(img.src)).arrayBuffer()),
      ]),
  );
}

test("original image persists through drafts, saved history, enlargement, download and real clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await fillDiary(page);
  const file = await imageFile(page);
  await attach(page, file);
  await expect(page.getByText("下書き保存済み", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("img", { name: `睡眠記録：${file.name}`, exact: true }),
  ).toBeVisible();
  expect(await renderedBytes(page, file.name)).toEqual(file.buffer);
  await page.getByRole("button", { name: "ChatGPT用にコピー" }).click();
  await expect(page.getByRole("status")).toContainText("画像は別途添付");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const copied = JSON.parse(text.split("```json\n")[1].split("\n```")[0]);
  expect(copied.sleepImages[0]).toMatchObject({
    name: file.name,
    type: "image/png",
    size: file.buffer.length,
    width: 750,
    height: 1128,
  });
  expect(copied.sleepImages[0].fileName).toContain("sleep-2026-10-22-");
  expect(text).not.toContain("data:image");
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("画像付きの日記を保存");
  await page.getByRole("button", { name: /日記の履歴/ }).click();
  await page.getByRole("button", { name: /2026-10-22.*7h/ }).click();
  await expect(page.getByText("睡眠画像 1枚")).toBeVisible();
  await page.getByRole("button", { name: `${file.name}を拡大` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "画像を保存", exact: true }).click();
  expect(await downloadBytes(await download)).toEqual(file.buffer);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /日記の履歴/ }).click();
  await page.getByRole("button", { name: /2026-10-22.*7h/ }).click();
  expect(await renderedBytes(page, file.name)).toEqual(file.buffer);
});

test("image backup restores original bytes in a fresh browser and preserves other dates", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await fillDiary(page);
  const file = await imageFile(page);
  await attach(page, file);
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await page.getByRole("button", { name: /日記の履歴/ }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "画像付きバックアップ", exact: true })
    .click();
  const bytes = await downloadBytes(await downloadPromise);
  const files = unzipSync(bytes);
  const imagePath = Object.keys(files).find((name) =>
    name.startsWith("images/"),
  );
  expect(Buffer.from(files[imagePath])).toEqual(file.buffer);
  const manifest = JSON.parse(
    Buffer.from(files["yohaku-backup.json"]).toString(),
  );
  expect(manifest.entries[0].sleepImages[0].name).toBe(file.name);
  const fresh = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  });
  try {
    const restored = await fresh.newPage();
    await restored.goto("http://127.0.0.1:5173/");
    await fillDiary(restored);
    await restored.locator("#date").fill("2026-10-21");
    await restored
      .getByRole("button", { name: "日記を保存", exact: true })
      .click();
    await restored.getByRole("button", { name: /日記の履歴/ }).click();
    restored.once("dialog", (dialog) => dialog.accept());
    await restored
      .getByLabel("バックアップZIPを選択")
      .setInputFiles({
        name: "backup.zip",
        mimeType: "application/zip",
        buffer: bytes,
      });
    await expect(restored.getByRole("status")).toContainText(
      "日記と睡眠画像を復元",
    );
    await expect(
      restored.getByText("2 日分の記録", { exact: false }),
    ).toBeVisible();
    await restored.getByRole("button", { name: /2026-10-22.*7h/ }).click();
    await expect(
      restored.getByRole("img", {
        name: `睡眠記録：${file.name}`,
        exact: true,
      }),
    ).toBeVisible();
    expect(await renderedBytes(restored, file.name)).toEqual(file.buffer);
    const originalId = manifest.entries[0].sleepImages[0].id;
    const restoredId = await restored.evaluate(
      () =>
        JSON.parse(localStorage.getItem("yohaku.entries.v1")).find(
          (entry) => entry.date === "2026-10-22",
        ).sleepImages[0].id,
    );
    expect(restoredId).not.toBe(originalId);
    const previous = await restored.evaluate(() =>
      localStorage.getItem("yohaku.entries.v1"),
    );
    delete files[imagePath];
    await restored
      .getByLabel("バックアップZIPを選択")
      .setInputFiles({
        name: "incomplete.zip",
        mimeType: "application/zip",
        buffer: Buffer.from(zipSync(files)),
      });
    await expect(restored.getByRole("alert")).toContainText("画像が不足");
    expect(
      await restored.evaluate(() => localStorage.getItem("yohaku.entries.v1")),
    ).toBe(previous);
  } finally {
    await fresh.close();
  }
});

test("unsupported, corrupt, oversized and too many images are rejected without changing the draft", async ({
  page,
}) => {
  await page.goto("/");
  const input = page.getByLabel("睡眠画像を追加", { exact: true });
  await input.setInputFiles({
    name: "renamed.png",
    mimeType: "image/png",
    buffer: Buffer.from("<svg></svg>"),
  });
  await expect(page.getByRole("alert")).toContainText("PNG・JPEG・WebP");
  await input.setInputFiles({
    name: "huge.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("10MB以下");
  const file = await imageFile(page);
  await input.setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: file.buffer.subarray(0, 16),
  });
  await expect(page.getByRole("alert")).toContainText("画像を読み込めません");
  await input.setInputFiles(
    Array.from({ length: 4 }, (_, index) => ({
      ...file,
      name: `sleep-${index}.png`,
    })),
  );
  await expect(page.getByRole("alert")).toContainText("1日3枚まで");
  await expect(page.getByRole("img", { name: /睡眠記録：/ })).toHaveCount(0);
  await input.setInputFiles([
    { ...file, name: "sleep-1.png" },
    { ...file, name: "sleep-2.png" },
    { ...file, name: "sleep-3.png" },
  ]);
  await expect(page.getByRole("img", { name: /睡眠記録：/ })).toHaveCount(3);
  await expect(input).toBeDisabled();
  await page.getByRole("button", { name: "sleep-2.pngを添付から外す" }).click();
  await expect(input).toBeEnabled();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `No overflow at ${width}`,
    ).toBeTruthy();
  }
});

test("native image sharing receives the original file and a date-linked filename", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => true });
    Object.defineProperty(navigator, "share", {
      value: async ({ files, title }) => {
        window.sharedImage = {
          name: files[0].name,
          type: files[0].type,
          bytes: [...new Uint8Array(await files[0].arrayBuffer())],
          title,
        };
      },
    });
  });
  await page.goto("/");
  await fillDiary(page);
  const file = await imageFile(page);
  await attach(page, file);
  await page.getByRole("button", { name: `${file.name}を共有・保存` }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.sharedImage)))
    .toBeTruthy();
  const shared = await page.evaluate(() => window.sharedImage);
  expect(shared.name).toMatch(/^sleep-2026-10-22-.*\.png$/);
  expect(shared.type).toBe("image/png");
  expect(Buffer.from(shared.bytes)).toEqual(file.buffer);
  expect(shared.title).toBe("2026-10-22の睡眠記録");
});

test("image-storage failures leave text entry and copying usable without false attachments", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      value: {
        open() {
          throw new DOMException("Unavailable", "QuotaExceededError");
        },
      },
    }),
  );
  await page.goto("/");
  await fillDiary(page);
  const file = await imageFile(page);
  await page.getByLabel("睡眠画像を追加", { exact: true }).setInputFiles(file);
  await expect(page.getByRole("alert")).toContainText("画像を保存できません");
  await expect(page.getByRole("img", { name: /睡眠記録：/ })).toHaveCount(0);
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("日記を保存しました");
  await page.getByRole("button", { name: "ChatGPT用にコピー" }).click();
  await expect(page.getByRole("status")).toContainText("コピーしました");
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
  ).not.toContain("sleepImages");
});

test("removing a saved attachment and editing notes preserves the diary and other dates", async ({
  page,
}) => {
  await page.goto("/");
  await fillDiary(page);
  const file = await imageFile(page);
  await attach(page, file);
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await page.locator("#date").fill("2026-10-21");
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await page
    .getByRole("button", { name: `${file.name}を添付から外す` })
    .click();
  await page.locator("#insights").fill("画像を外して更新");
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await page.getByRole("button", { name: /日記の履歴/ }).click();
  await expect(page.getByText("2 日分の記録", { exact: false })).toBeVisible();
  await expect(page.getByText("睡眠画像 1枚")).toHaveCount(1);
  await page.getByRole("button", { name: /2026-10-22.*7h/ }).click();
  await expect(
    page.getByRole("img", { name: `睡眠記録：${file.name}`, exact: true }),
  ).toBeVisible();
  expect(await renderedBytes(page, file.name)).toEqual(file.buffer);
});
