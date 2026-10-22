import {
  ACTIONS,
  EVENT_TYPES,
  shiftDate,
  SYMPTOMS,
  validDate,
} from "./wellness.js";

export const average = (values) => {
  const filtered = values.filter(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
  return filtered.length
    ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length
    : null;
};
export const displayNumber = (value, digits = 1) =>
  value == null ? "—" : value.toFixed(digits);
export function analyzeEntries(entries, days, end) {
  if (![7, 30, 90].includes(days) || !validDate(end))
    throw new Error("分析期間を確認してください。");
  const start = shiftDate(end, 1 - days);
  const unique = new Map(
    entries
      .filter((entry) => entry.date >= start && entry.date <= end)
      .map((entry) => [entry.date, entry]),
  );
  const records = [...unique.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const locations = new Map();
  for (const record of records)
    if (record.weather?.location)
      locations.set(
        record.weather.location,
        (locations.get(record.weather.location) || 0) + 1,
      );
  const location =
    [...locations].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]?.[0] || null;
  const weather = records.filter(
    (record) => location && record.weather?.location === location,
  );
  const compare = (left, right, label) => ({
    label,
    leftCount: left.length,
    rightCount: right.length,
    leftAverage: average(left.map((record) => record.condition)),
    rightAverage: average(right.map((record) => record.condition)),
    enough: left.length >= 3 && right.length >= 3,
  });
  const pressure = weather.filter(
    (record) => typeof record.weather.pressureChange === "number",
  );
  const pressureComparison = compare(
    pressure.filter((record) => record.weather.pressureChange <= -5),
    pressure.filter((record) => record.weather.pressureChange > -5),
    "前日より平均気圧が5hPa以上低下した日",
  );
  const wet = weather.filter((record) =>
    ["rain", "snow", "storm", "sunny", "cloudy", "fog"].includes(
      record.weather.category,
    ),
  );
  const weatherComparison = compare(
    wet.filter((record) =>
      ["rain", "snow", "storm"].includes(record.weather.category),
    ),
    wet.filter((record) =>
      ["sunny", "cloudy", "fog"].includes(record.weather.category),
    ),
    "雨・雪・雷雨の日",
  );
  const symptoms = SYMPTOMS.map(([id, label]) => {
    const values = records
      .map((record) => record.wellness?.symptoms?.[id])
      .filter((value) => Number.isInteger(value));
    return {
      id,
      label,
      count: values.length,
      average: average(values),
      present: values.filter((value) => value > 0).length,
    };
  }).filter((item) => item.count);
  const actions = ACTIONS.map(([id, label]) => {
    const values = records
      .flatMap((record) => record.wellness?.actions || [])
      .filter((action) => action.id === id);
    return {
      id,
      label,
      count: values.length,
      better: values.filter((action) => action.effect === "better").length,
      same: values.filter((action) => action.effect === "same").length,
      worse: values.filter((action) => action.effect === "worse").length,
      unknown: values.filter((action) => action.effect === "unknown").length,
    };
  }).filter((item) => item.count);
  const byDate = new Map(entries.map((entry) => [entry.date, entry]));
  const logged = records.filter(
    (record) =>
      record.wellness?.eventsRecorded || record.wellness?.events?.length,
  );
  const events = Object.entries(EVENT_TYPES)
    .map(([type, label]) => {
      const withEvent = logged.filter((record) =>
        record.wellness.events?.some((event) => event.type === type),
      );
      const without = logged.filter(
        (record) =>
          !record.wellness.events?.some((event) => event.type === type),
      );
      const paired = withEvent
        .map((record) => ({
          record,
          next: byDate.get(shiftDate(record.date, 1)),
        }))
        .filter((pair) => pair.next && pair.next.date <= end);
      const occurrences = withEvent.flatMap((record) =>
        record.wellness.events.filter((event) => event.type === type),
      );
      return {
        type,
        label,
        days: withEvent.length,
        occurrences: occurrences.length,
        comparison: compare(withEvent, without, label),
        nextCount: paired.length,
        nextAverage: average(paired.map((pair) => pair.next.condition)),
        samePairedAverage: average(paired.map((pair) => pair.record.condition)),
        pendingNext: withEvent.filter((record) => record.date === end).length,
        missingNext:
          withEvent.filter((record) => record.date < end).length -
          paired.length,
        burdenAverage: average(occurrences.map((event) => event.burden)),
        burdenCount: occurrences.filter((event) => event.burden != null).length,
        better: occurrences.filter((event) => event.effect === "better").length,
        worse: occurrences.filter((event) => event.effect === "worse").length,
      };
    })
    .filter((item) => item.days);
  return {
    start,
    end,
    days,
    records,
    count: records.length,
    missing: days - records.length,
    condition: average(records.map((record) => record.condition)),
    mood: average(records.map((record) => record.mood)),
    sleep: average(records.map((record) => Number(record.sleep))),
    location,
    weatherCount: weather.length,
    weatherExcluded:
      records.filter((record) => record.weather).length - weather.length,
    pressureComparison,
    weatherComparison,
    symptoms,
    actions,
    events,
    eventsLogged: logged.length,
  };
}

export function formatAnalysis(report) {
  const summaries = [
    `対象期間: ${report.start}〜${report.end}`,
    `記録: ${report.count}/${report.days}日、未記録: ${report.missing}日`,
    `平均: 体調${displayNumber(report.condition)}/5、気分${displayNumber(report.mood)}/5、睡眠${displayNumber(report.sleep)}時間`,
    `天気比較の地域: ${report.location || "地域付きの記録なし"}（${report.weatherCount}日、別地域・地域未記録の天気${report.weatherExcluded}日を比較から除外）`,
    `予定を確認した日: ${report.eventsLogged}日（未記録日は予定なしと扱わない）`,
  ];
  for (const item of [report.pressureComparison, report.weatherComparison])
    summaries.push(
      `${item.label}: ${item.leftCount}日・体調平均${displayNumber(item.leftAverage)} / その他の比較可能日: ${item.rightCount}日・体調平均${displayNumber(item.rightAverage)}${item.enough ? "" : "（各群3日未満のため比較保留）"}`,
    );
  for (const event of report.events)
    summaries.push(
      `${event.label}: ${event.days}日、翌日とのペア${event.nextCount}組、同じペアの当日体調平均${displayNumber(event.samePairedAverage)}・翌日${displayNumber(event.nextAverage)}、期間内の翌日未記録${event.missingNext}日、翌日が期間外${event.pendingNext}日`,
    );
  const json = JSON.stringify(report.records, null, 2);
  const fence = "`".repeat(
    Math.max(
      3,
      ...[...json.matchAll(/`+/g)].map((match) => match[0].length + 1),
    ),
  );
  return `【体調・天気・暮らしの振り返り】\n${summaries.join("\n")}\n\n【分析の依頼】\n添付の日記JSONを一次情報として参照してください。天気は取得時点の気象モデルによる推定・予報値または手入力です。自己評価と計測値、事実と仮説を区別してください。気圧低下の5hPaは記録を整理する目安で、医学的な判定基準ではありません。未記録と症状なし・予定なしを区別し、地域や期間が異なるデータを混ぜないでください。通院・鍼灸・移動・人との予定は、当日と翌日の変化、睡眠やほかの予定による交絡も示してください。対策の手応えは本人の感想であり効果の証明ではありません。少数の記録から原因や治療効果を断定しないでください。診断や服薬・治療の変更を勧めず、受診時に相談できる疑問と、負担の小さい次の観察を1つ提案してください。睡眠画像の内容は、画像が別途添付されている場合だけ参照してください。\n\n${fence}json\n${json}\n${fence}`;
}
