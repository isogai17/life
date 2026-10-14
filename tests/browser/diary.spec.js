import { test, expect } from "@playwright/test";

async function fillDiary(page) {
  await page.locator("#date").fill("2026-10-14");
  await page.getByLabel("昨晩の睡眠時間").fill("7.5");
  await page
    .getByRole("group", { name: "今日の体調" })
    .getByRole("button", { name: "4：良い", exact: true })
    .click();
  await page
    .getByRole("group", { name: "今日の気分" })
    .getByRole("button", { name: "5：最高", exact: true })
    .click();
  await page
    .getByLabel("気づき", { exact: false })
    .fill("朝の散歩で気づいた。\n「自分のペース」で大丈夫。");
  await page
    .getByLabel("できたこと", { exact: false })
    .fill("朝ごはんを食べた。🌱");
}

test("mobile input copies the exact Markdown/JSON to the real clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await fillDiary(page);
  await page.getByRole("button", { name: "ChatGPT用にコピー" }).click();
  await expect(page.getByRole("status")).toContainText("コピーしました！");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain(
    "- 日付: 2026-10-14\n- 睡眠時間: 7.5時間\n- 体調: 4/5\n- 気分: 5/5",
  );
  expect(JSON.parse(text.split("```json\n")[1].split("\n```")[0])).toEqual({
    date: "2026-10-14",
    sleep: 7.5,
    condition: 4,
    mood: 5,
    insights: "朝の散歩で気づいた。\n「自分のペース」で大丈夫。",
    achievements: "朝ごはんを食べた。🌱",
  });
});

test("draft, saved history, edits, JSON backup and deletion work across reloads", async ({
  page,
}) => {
  await page.goto("/");
  await fillDiary(page);
  await expect(page.getByText("下書き保存済み", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#sleep")).toHaveValue("7.5");
  await expect(page.locator("#insights")).toHaveValue(
    "朝の散歩で気づいた。\n「自分のペース」で大丈夫。",
  );
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("日記を保存しました！");
  await page.locator("#insights").fill("編集した気づき");
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await page.getByRole("button", { name: /日記の履歴/ }).click();
  await expect(page.getByText("1 日分の記録", { exact: false })).toBeVisible();
  await expect(page.getByText("編集した気づき", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONを書き出す" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual([
    {
      date: "2026-10-14",
      sleep: 7.5,
      condition: 4,
      mood: 5,
      insights: "編集した気づき",
      achievements: "朝ごはんを食べた。🌱",
    },
  ]);
  await page.getByRole("button", { name: /2026-10-14.*7.5h/ }).click();
  await page.getByRole("button", { name: "編集する" }).click();
  await expect(page.locator("#insights")).toHaveValue("編集した気づき");
  await page.getByRole("button", { name: /日記の履歴/ }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "2026-10-14の日記を削除" }).click();
  await expect(page.getByText("あなたの記録は、ここから。")).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("yohaku.entries.v1")),
    ),
  ).toEqual([]);
});

test("missing ratings and invalid sleep show errors; zero hours increments by 0.5", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ChatGPT用にコピー" }).click();
  await expect(page.locator("#sleep-error")).toBeVisible();
  await expect(page.locator("#condition-error")).toBeVisible();
  await expect(page.locator("#mood-error")).toBeVisible();
  await expect(page.locator("#sleep")).toBeFocused();
  await page.locator("#sleep").fill("7.2");
  await page.getByRole("button", { name: "ChatGPT用にコピー" }).click();
  await expect(page.locator("#sleep-error")).toBeVisible();
  await page.locator("#sleep").fill("0");
  await expect(
    page.getByRole("button", { name: "睡眠時間を0.5時間減らす" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "睡眠時間を0.5時間増やす" }).click();
  await expect(page.locator("#sleep")).toHaveValue("0.5");
  await page.getByRole("button", { name: "睡眠時間を0.5時間減らす" }).click();
  await page.getByRole("button", { name: "睡眠時間を0.5時間増やす" }).click();
  await expect(page.locator("#sleep")).toHaveValue("0.5");
});

test("blocked clipboard offers selectable manual copy without a false success toast", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("Permission denied");
        },
      },
    });
    document.execCommand = () => false;
  });
  await page.goto("/");
  await fillDiary(page);
  await page.getByRole("button", { name: "ChatGPT用にコピー" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("コピーする日記データ")).toHaveValue(/```json/);
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("unavailable storage does not prevent clipboard use or claim a save", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.goto("/");
  await fillDiary(page);
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("日記を保存できません");
  await page.getByRole("button", { name: "ChatGPT用にコピー" }).click();
  await expect(page.getByRole("status")).toContainText("コピーしました！");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "2026-10-14",
  );
});

test("corrupt saved data remains untouched", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("yohaku.entries.v1", "invalid-original-data"),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "以前のデータは上書きしません",
  );
  await fillDiary(page);
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("yohaku.entries.v1")),
  ).toBe("invalid-original-data");
});

test("phone and desktop layouts fit the viewport, and text is rendered safely", async ({
  page,
}) => {
  await page.goto("/");
  await fillDiary(page);
  await page.locator("#insights").fill('<img src=x onerror="window.bad=1">');
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await page.getByRole("button", { name: /日記の履歴/ }).click();
  await expect(
    page.getByText('<img src=x onerror="window.bad=1">', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.bad)).toBeUndefined();
  await page.getByRole("button", { name: "今日の記録" }).click();
  for (const width of [320, 360, 375, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `No overflow at ${width}px`,
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const button of await page
    .getByRole("group", { name: "今日の気分" })
    .getByRole("button")
    .all()) {
    const bounds = await button.boundingBox();
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
});
