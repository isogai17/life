import { test, expect } from "@playwright/test";
import { unzipSync } from "fflate";

test("a saved previous day opens a fresh form; an unsaved older draft is preserved", async ({
  browser,
}) => {
  const old = {
    date: "2026-10-21",
    condition: 2,
    mood: 3,
    sleep: 6,
    insights: "昨日の記録",
    achievements: "",
    wellness: {
      symptoms: { headache: 3 },
      stress: 2,
      timing: "",
      actions: [],
      notes: "保存済み",
      events: [],
      eventsRecorded: false,
    },
  };
  for (const unsaved of [false, true]) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date("2026-10-22T03:00:00Z"));
      await page.addInitScript(
        ({ old, unsaved }) => {
          localStorage.setItem("yohaku.entries.v1", JSON.stringify([old]));
          localStorage.setItem(
            "yohaku.draft.v1",
            JSON.stringify({
              ...old,
              insights: unsaved ? "未保存の追加メモ" : old.insights,
            }),
          );
        },
        { old, unsaved },
      );
      await page.goto("http://127.0.0.1:5173/");
      await expect(page.locator("#date")).toHaveValue(
        unsaved ? "2026-10-21" : "2026-10-22",
      );
      await expect(page.locator("#sleep")).toHaveValue(unsaved ? "6" : "");
      await expect(page.locator("#insights")).toHaveValue(
        unsaved ? "未保存の追加メモ" : "",
      );
      expect(
        await page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("yohaku.entries.v1"))[0].wellness
              .symptoms.headache,
        ),
      ).toBe(3);
    } finally {
      await context.close();
    }
  }
});

async function base(page) {
  await page.clock.setFixedTime(new Date("2026-10-22T03:00:00Z"));
  await page.goto("/");
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
const record = (date, condition = 3) => ({
  date,
  condition,
  mood: 3,
  sleep: 7,
  insights: "",
  achievements: "",
});

test("symptoms, manual weather, acupuncture, travel and social records survive save, copy and backup", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await base(page);
  await page.getByText("天気を手入力する", { exact: true }).click();
  await page.getByLabel("地域名", { exact: true }).fill("横浜市");
  await page.getByLabel("天気", { exact: true }).selectOption("rain");
  await page.getByLabel("平均海面気圧（hPa）", { exact: true }).fill("1007");
  await page
    .getByLabel("前日との平均気圧差（hPa）", { exact: true })
    .fill("-7");
  await page.getByText("体調の変化と、暮らしの記録", { exact: true }).click();
  await page.getByRole("button", { name: "頭痛", exact: true }).click();
  await page.getByRole("button", { name: "頭痛 3：強い", exact: true }).click();
  await page.getByLabel("ストレスの強さ", { exact: true }).selectOption("2");
  await page.getByRole("button", { name: "休憩", exact: true }).click();
  await page.getByLabel("休憩の手応え", { exact: true }).selectOption("better");
  for (const [name, index, duration] of [
    ["鍼灸", 1, "60"],
    ["移動", 2, "45"],
    ["人との予定", 3, "90"],
  ]) {
    await page
      .getByRole("button", { name: `${name}の記録を追加`, exact: true })
      .click();
    await page
      .getByLabel(`${name} ${index}の所要時間（分）`, { exact: true })
      .fill(duration);
    await page
      .getByLabel(`${name} ${index}の負担感`, { exact: true })
      .selectOption("2");
  }
  await page
    .getByLabel("鍼灸 1の後の手応え", { exact: true })
    .selectOption("better");
  await page
    .getByLabel("鍼灸 1のメモ", { exact: true })
    .fill("通院後に休憩した");
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("日記を保存しました");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "頭痛 3：強い", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByLabel("鍼灸 1の所要時間（分）", { exact: true }),
  ).toHaveValue("60");
  await page
    .getByRole("button", { name: "ChatGPT用にコピー", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("コピーしました");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const copied = JSON.parse(text.split("```json\n")[1].split("\n```")[0]);
  expect(copied.weather).toMatchObject({
    date: "2026-10-22",
    location: "横浜市",
    category: "rain",
    pressure: 1007,
    pressureChange: -7,
    source: "manual",
  });
  expect(copied.wellness.symptoms).toEqual({ headache: 3 });
  expect(copied.wellness.events).toHaveLength(3);
  expect(copied.wellness.events[0].note).toBe("通院後に休憩した");
  await page.getByRole("button", { name: /日記の履歴/ }).click();
  await page.locator(".history-summary").click();
  await expect(page.locator(".entry-health-details")).toContainText("鍼灸");
  await expect(page.locator(".entry-health-details")).toContainText(
    "通院後に休憩した",
  );
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "画像付きバックアップ", exact: true })
    .click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const archive = unzipSync(Buffer.concat(chunks));
  const manifest = JSON.parse(
    Buffer.from(archive["yohaku-backup.json"]).toString(),
  );
  expect(manifest.entries[0].wellness).toEqual(copied.wellness);
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("バックアップZIPを選択")
    .setInputFiles(await download.path());
  await expect(page.getByRole("status")).toContainText("日記と睡眠画像を復元");
  await page
    .getByRole("button", { name: "体調の振り返り", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "通院や予定と、翌日の体調",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".event-trend-card")).toHaveCount(3);
  await expect(page.locator(".event-trend-card").first()).toContainText(
    "翌日が期間外 1日",
  );
  await page
    .getByRole("button", { name: "分析用にコピー", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("分析用データをコピー");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "診断や服薬・治療の変更を勧めず",
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `No overflow ${width}`,
    ).toBeTruthy();
  }
});

test("regional weather lookup requests only location/date and stale results cannot cross dates", async ({
  page,
}) => {
  await base(page);
  const requests = [];
  await page.route("**/api/locations?**", (route) => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({
      json: [
        {
          name: "横浜市・日本",
          latitude: 35.45,
          longitude: 139.64,
          timezone: "Asia/Tokyo",
        },
      ],
    });
  });
  const snapshot = {
    date: "2026-10-22",
    source: "open-meteo",
    kind: "forecast",
    category: "rain",
    pressure: 1007,
    pressureChange: -7,
    temperature: 20,
    humidity: 80,
    fetchedAt: "2026-10-22T03:00:00Z",
  };
  let release;
  await page.route("**/api/weather?**", async (route) => {
    requests.push(new URL(route.request().url()));
    await new Promise((resolve) => {
      release = resolve;
    });
    await route.fulfill({ json: snapshot });
  });
  await page.getByRole("button", { name: "地域を選ぶ", exact: true }).click();
  await page.getByLabel("市区町村名", { exact: true }).fill("横浜");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await page.getByRole("button", { name: "横浜市・日本", exact: true }).click();
  await page
    .getByRole("button", { name: "2026-10-22 の天気を取得", exact: true })
    .click();
  await expect.poll(() => typeof release).toBe("function");
  await page.locator("#date").fill("2026-10-21");
  release();
  await expect(page.locator(".weather-snapshot")).toHaveCount(0);
  expect([...requests[0].searchParams.keys()]).toEqual(["q"]);
  expect([...requests[1].searchParams.keys()]).toEqual([
    "latitude",
    "longitude",
    "timezone",
    "date",
  ]);
  await page.unroute("**/api/weather?**");
  await page.route("**/api/weather?**", (route) =>
    route.fulfill({ json: { ...snapshot, date: "2026-10-21" } }),
  );
  await page
    .getByRole("button", { name: "2026-10-21 の天気を取得", exact: true })
    .click();
  await expect(page.locator(".weather-snapshot")).toContainText("1007");
  await expect(page.locator(".weather-snapshot")).toContainText(
    "気象モデルの推定・予報値",
  );
  await page.locator("#date").fill("2026-10-20");
  await expect(page.locator(".weather-snapshot")).toHaveCount(0);
});

test("weather outage leaves manual entry usable and a new daily record clears stale health data", async ({
  page,
}) => {
  await base(page);
  await page.route("**/api/locations?**", (route) =>
    route.fulfill({ status: 400, json: { error: "一時的に取得できません" } }),
  );
  await page.getByRole("button", { name: "地域を選ぶ", exact: true }).click();
  await page.getByLabel("市区町村名", { exact: true }).fill("横浜");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.locator(".inline-notice")).toContainText(
    "一時的に取得できません",
  );
  await page.getByText("天気を手入力する", { exact: true }).click();
  await page.getByLabel("地域名", { exact: true }).fill("横浜市");
  await page.getByLabel("天気", { exact: true }).selectOption("sunny");
  await page.getByText("体調の変化と、暮らしの記録", { exact: true }).click();
  await page.getByRole("button", { name: "頭痛", exact: true }).click();
  await page.getByRole("button", { name: "頭痛 0：なし", exact: true }).click();
  await page.locator("#date").fill("2026-10-21");
  await page.getByRole("button", { name: "日記を保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("日記を保存しました");
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "今日を新しく記録", exact: true })
    .click();
  await expect(page.locator("#date")).toHaveValue("2026-10-22");
  await expect(page.locator("#sleep")).toHaveValue("");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("yohaku.entries.v1")),
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: /日記の履歴/ }).click();
  await page.locator(".history-summary").click();
  await expect(page.locator(".entry-health-details")).toContainText(
    "頭痛：0/4",
  );
});

test("analysis keeps gaps, chooses one region, compares enough observations, and does not claim causation", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.clock.setFixedTime(new Date("2026-10-22T03:00:00Z"));
  const records = Array.from({ length: 7 }, (_, index) => {
    const date = `2026-10-${16 + index}`;
    return {
      ...record(date, index < 3 ? 2 : 4),
      weather: {
        date,
        source: "manual",
        kind: "manual",
        location: index === 6 ? "別の地域" : "横浜市",
        category: index < 3 ? "rain" : "sunny",
        pressure: 1010,
        pressureChange: index < 3 ? -7 : -1,
        temperature: null,
        humidity: null,
      },
    };
  });
  await page.addInitScript(
    (records) =>
      localStorage.setItem("yohaku.entries.v1", JSON.stringify(records)),
    records,
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "体調の振り返り", exact: true })
    .click();
  await page.getByRole("button", { name: "7日", exact: true }).click();
  await expect(page.locator(".period-caption")).toContainText(
    "記録 7日・未記録 0日",
  );
  await expect(
    page.getByText("対象地域：横浜市", { exact: false }),
  ).toContainText("別地域・地域未記録の天気 1日");
  await expect(page.locator(".comparison-card").first()).toContainText("2.0");
  await expect(page.locator(".comparison-card").first()).toContainText("4.0");
  await expect(
    page
      .getByText("数値の違いだけでは原因を判断できません。", { exact: false })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "分析用にコピー", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("分析用データをコピー");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const copiedRecords = JSON.parse(
    copied.split("```json\n")[1].split("\n```")[0],
  );
  expect(copiedRecords).toHaveLength(7);
  expect(copied).toContain("未記録と症状なし・予定なしを区別");
});
