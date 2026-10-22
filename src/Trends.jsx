import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Copy,
  HeartPulse,
  Moon,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { copyText, localDate } from "./diary.js";
import { analyzeEntries, displayNumber, formatAnalysis } from "./trends.js";
import { EVENT_TYPES, shiftDate, WEATHER_LABELS } from "./wellness.js";

function TrendChart({ report }) {
  const byDate = new Map(report.records.map((record) => [record.date, record]));
  const days = Array.from({ length: report.days }, (_, index) => {
    const date = shiftDate(report.start, index);
    return { date, record: byDate.get(date) };
  });
  const pressures = report.records
    .filter(
      (record) =>
        record.weather?.location === report.location &&
        typeof record.weather.pressure === "number",
    )
    .map((record) => record.weather.pressure);
  const low = pressures.length
      ? Math.floor((Math.min(...pressures) - 3) / 5) * 5
      : 990,
    high = pressures.length
      ? Math.ceil((Math.max(...pressures) + 3) / 5) * 5
      : 1030;
  const x = (index) => 36 + (index / (report.days - 1)) * 400;
  const conditionY = (value) => 170 - (value - 1) * 34;
  const pressureY = (value) => 170 - ((value - low) / (high - low)) * 136;
  function path(getValue, toY) {
    let connected = false;
    return days
      .map(({ record }, index) => {
        const value = record ? getValue(record) : null;
        if (typeof value !== "number") {
          connected = false;
          return "";
        }
        const instruction = `${connected ? "L" : "M"} ${x(index)} ${toY(value)}`;
        connected = true;
        return instruction;
      })
      .join(" ");
  }
  const pressure = (record) =>
    record.weather?.location === report.location
      ? record.weather.pressure
      : null;
  return (
    <>
      <div className="chart-legend">
        <span>
          <i />
          体調（1〜5）
        </span>
        <span>
          <i className="pressure-dot" />
          海面気圧（hPa）
        </span>
        <span>
          <i className="event-dot" />
          予定のある日
        </span>
      </div>
      <svg
        className="trend-chart"
        viewBox="0 0 480 220"
        role="img"
        aria-label={`${report.start}から${report.end}の体調と海面気圧。未記録日は線をつなぎません。詳しい数値は下の日別一覧で確認できます。`}
      >
        {[1, 3, 5].map((score) => (
          <g key={score}>
            <line
              x1="36"
              x2="436"
              y1={conditionY(score)}
              y2={conditionY(score)}
              stroke="#e8ecdf"
              strokeDasharray="4 4"
            />
            <text x="18" y={conditionY(score) + 4}>
              {score}
            </text>
          </g>
        ))}
        <text x="443" y="38">
          {high}
        </text>
        <text x="443" y="174">
          {low}
        </text>
        <path
          d={path((record) => record.condition, conditionY)}
          fill="none"
          stroke="#6f865a"
          strokeWidth="2.5"
        />
        <path
          d={path(pressure, pressureY)}
          fill="none"
          stroke="#7f9fac"
          strokeWidth="2"
        />
        {days.map(({ date, record }, index) =>
          record ? (
            <g key={date}>
              <circle
                cx={x(index)}
                cy={conditionY(record.condition)}
                r="3"
                fill="#6f865a"
              >
                <title>
                  {date} 体調{record.condition}/5
                </title>
              </circle>
              {typeof pressure(record) === "number" && (
                <circle
                  cx={x(index)}
                  cy={pressureY(pressure(record))}
                  r="2.5"
                  fill="#7f9fac"
                >
                  <title>
                    {date} 海面気圧{pressure(record)}hPa
                  </title>
                </circle>
              )}
              {record.wellness?.events?.length > 0 && (
                <circle cx={x(index)} cy="188" r="3" fill="#a397b1">
                  <title>
                    {date}{" "}
                    {record.wellness.events
                      .map((event) => EVENT_TYPES[event.type])
                      .join("・")}
                  </title>
                </circle>
              )}
            </g>
          ) : null,
        )}
        {[0, Math.floor((report.days - 1) / 2), report.days - 1].map(
          (index) => (
            <text key={index} x={x(index)} y="209" textAnchor="middle">
              {days[index].date.slice(5).replace("-", "/")}
            </text>
          ),
        )}
      </svg>
    </>
  );
}

function Comparison({ item, leftLabel, rightLabel }) {
  return (
    <div className="comparison-card">
      <h3>{item.label}</h3>
      <div className="comparison-values">
        <div>
          <span>{leftLabel}</span>
          <strong>
            {item.enough ? displayNumber(item.leftAverage) : "—"}
            <small>/5</small>
          </strong>
          <small>{item.leftCount}日</small>
        </div>
        <div>
          <span>{rightLabel}</span>
          <strong>
            {item.enough ? displayNumber(item.rightAverage) : "—"}
            <small>/5</small>
          </strong>
          <small>{item.rightCount}日</small>
        </div>
      </div>
      <p>
        {item.enough
          ? "体調の自己評価の平均です。数値の違いだけでは原因を判断できません。"
          : "比較は保留中です。両方のグループに3日以上の記録が必要です。"}
      </p>
    </div>
  );
}

export default function Trends({ entries, onNotify, onManualCopy }) {
  const [days, setDays] = useState(30);
  const end = localDate();
  const report = useMemo(
    () => analyzeEntries(entries, days, end),
    [entries, days, end],
  );
  async function copy() {
    const text = formatAnalysis(report);
    try {
      await copyText(text);
      onNotify("分析用データをコピーしました！");
    } catch {
      onManualCopy(text);
    }
  }
  return (
    <div className="trends-view">
      <div className="trends-toolbar">
        <div className="period-buttons" role="group" aria-label="分析期間">
          {[7, 30, 90].map((value) => (
            <button
              key={value}
              aria-pressed={days === value}
              onClick={() => setDays(value)}
            >
              {value}日
            </button>
          ))}
        </div>
        <button
          className="button primary"
          disabled={!report.count}
          onClick={copy}
        >
          <Copy size={16} />
          分析用にコピー
        </button>
      </div>
      <p className="period-caption">
        <CalendarDays size={14} />
        {report.start} 〜 {report.end} ／ 記録 {report.count}日・未記録{" "}
        {report.missing}日
      </p>
      {!report.count ? (
        <section className="empty-history">
          <span>
            <TrendingUp size={34} />
          </span>
          <h2>からだの変化を、少しずつ見つける。</h2>
          <p>
            この期間の日記がまだありません。日々の体調や天気、予定を記録すると、ここで振り返れます。
          </p>
        </section>
      ) : (
        <>
          <div className="trend-metrics">
            {[
              [Activity, "記録した日", report.count, "日"],
              [HeartPulse, "体調の平均", displayNumber(report.condition), "/5"],
              [Sparkles, "気分の平均", displayNumber(report.mood), "/5"],
              [Moon, "睡眠時間の平均", displayNumber(report.sleep), "時間"],
            ].map(([Icon, label, value, unit]) => (
              <section className="card trend-metric" key={label}>
                <span>
                  <Icon size={15} />
                  {label}
                </span>
                <strong>
                  {value}
                  <small>{unit}</small>
                </strong>
              </section>
            ))}
          </div>
          <section className="card trends-card">
            <div className="trend-section-title">
              <h2>体調と気圧の推移</h2>
              <span>欠測日はつなぎません</span>
            </div>
            <TrendChart report={report} />
            <p className="form-help">
              気圧は{report.location || "地域付き記録のある地点"}
              の値のみ表示します。予定の印は鍼灸・通院・移動・人との予定などです。
            </p>
          </section>
          <section className="card trends-card">
            <div className="trend-section-title">
              <h2>天気との関連を眺める</h2>
              <span>体調の平均を比較</span>
            </div>
            <p className="form-help">
              対象地域：{report.location || "地域付きの記録なし"} ／{" "}
              {report.weatherCount}日。別地域・地域未記録の天気{" "}
              {report.weatherExcluded}日は比較から除外しています。
            </p>
            <div className="comparison-grid">
              <Comparison
                item={report.pressureComparison}
                leftLabel="5hPa以上低下"
                rightLabel="それ以外の日"
              />
              <Comparison
                item={report.weatherComparison}
                leftLabel="雨・雪・雷雨"
                rightLabel="晴れ・くもり・霧"
              />
            </div>
            <p className="health-purpose">
              5hPaは整理の目安で、医学的な判定基準ではありません。3日は表示に必要な最低数です。天気は取得時点の推定・予報や手入力を含み、地域・季節・睡眠などの影響も重なります。
            </p>
          </section>
          <section className="card trends-card">
            <div className="trend-section-title">
              <h2>通院や予定と、翌日の体調</h2>
              <span>予定の記録 {report.eventsLogged}日</span>
            </div>
            <p className="form-help">
              翌日の記録がある日だけをペアにして比べます。予定が未記録の日を「予定なし」として数えません。
            </p>
            {!report.events.length ? (
              <p className="empty-insight">
                まだ予定の記録がありません。鍼灸・通院・移動・人との予定を入力すると表示されます。
              </p>
            ) : (
              <div className="event-trends">
                {report.events.map((item) => (
                  <article className="event-trend-card" key={item.type}>
                    <h3>
                      {item.label}
                      <small>
                        {item.days}日・{item.occurrences}件
                      </small>
                    </h3>
                    <div className="event-paired">
                      <div>
                        当日
                        <strong>
                          {item.nextCount >= 3
                            ? displayNumber(item.samePairedAverage)
                            : "—"}
                          <small>/5</small>
                        </strong>
                      </div>
                      <ArrowRight size={17} />
                      <div>
                        翌日
                        <strong>
                          {item.nextCount >= 3
                            ? displayNumber(item.nextAverage)
                            : "—"}
                          <small>/5</small>
                        </strong>
                      </div>
                      <span>
                        同じ {item.nextCount} 組<br />
                        翌日の記録なし {item.missingNext}日<br />
                        翌日が期間外 {item.pendingNext}日
                      </span>
                    </div>
                    <p>
                      {item.nextCount >= 3
                        ? "当日・翌日の自己評価の参考値です。治療や予定の影響と断定できません。"
                        : "当日と翌日の両方がある3組以上で平均を表示します。"}
                    </p>
                    {item.burdenCount > 0 && (
                      <p>
                        負担感の平均 {displayNumber(item.burdenAverage)}/4（
                        {item.burdenCount}件）
                      </p>
                    )}
                    <p>
                      手応え「楽になった」{item.better}件 ／「つらくなった」
                      {item.worse}件
                    </p>
                  </article>
                ))}
              </div>
            )}
            <p className="health-purpose">
              睡眠やほかの予定、通院するきっかけになった不調も結果に重なります。この比較から鍼灸などの治療効果を判断することはできません。
            </p>
          </section>
          <div className="insights-grid">
            <section className="card trends-card">
              <h2>症状の自己評価</h2>
              {report.symptoms.length ? (
                <ul className="symptom-summary">
                  {report.symptoms.map((item) => (
                    <li key={item.id}>
                      <div>
                        <span>{item.label}</span>
                        <strong>
                          {displayNumber(item.average)}
                          <small>/4</small>
                        </strong>
                      </div>
                      <p>
                        記録 {item.count}日 ／ 症状あり {item.present}日
                      </p>
                      <div className="symptom-bar">
                        <span
                          style={{ width: `${(item.average / 4) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-insight">
                  追いたい症状を選ぶと、強さの変化を振り返れます。未記録を0として集計しません。
                </p>
              )}
            </section>
            <section className="card trends-card">
              <h2>対策の手応え</h2>
              {report.actions.length ? (
                <ul className="action-summary">
                  {report.actions.map((item) => (
                    <li key={item.id}>
                      <strong>{item.label}</strong>
                      <p>
                        楽になった {item.better} ／ 変わらない {item.same} ／
                        つらくなった {item.worse}
                      </p>
                      <small>
                        計 {item.count}回・未評価 {item.unknown}回
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-insight">
                  試した対策と感想を記録すると、ここに並びます。
                </p>
              )}
              <p className="form-help">
                本人が感じた手応えです。効果の証明や、治療変更の判断には使いません。
              </p>
            </section>
          </div>
          <section className="observation-card">
            <span>
              <Sparkles size={20} />
            </span>
            <div>
              <h2>次の振り返りのヒント</h2>
              <p>
                {report.events.length
                  ? "予定の日も、予定がない日も、同じ項目を無理なく記録してみてください。特に翌日の体調を残すと、時間差の変化を相談しやすくなります。"
                  : "調子の良い日も気になる日も、同じ項目を記録すると比較しやすくなります。気になる症状を1つ選ぶだけでも大丈夫です。"}
              </p>
            </div>
          </section>
          <details className="card daily-data">
            <summary>日ごとの記録を一覧で見る</summary>
            <div className="daily-table-scroll">
              <table>
                <caption>
                  保存済みの自己評価と天気。記録のない日は含みません。
                </caption>
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>体調</th>
                    <th>気分</th>
                    <th>睡眠</th>
                    <th>天気・地域</th>
                    <th>気圧差</th>
                    <th>通院・予定</th>
                  </tr>
                </thead>
                <tbody>
                  {report.records.map((record) => (
                    <tr key={record.date}>
                      <th>{record.date}</th>
                      <td>{record.condition}/5</td>
                      <td>{record.mood}/5</td>
                      <td>{record.sleep}h</td>
                      <td>
                        {record.weather
                          ? `${WEATHER_LABELS[record.weather.category]}・${record.weather.location || "地域未記録"}`
                          : "未記録"}
                      </td>
                      <td>
                        {record.weather?.pressureChange == null
                          ? "未記録"
                          : `${record.weather.pressureChange}hPa`}
                      </td>
                      <td>
                        {record.wellness?.events?.length
                          ? record.wellness.events
                              .map((event) => EVENT_TYPES[event.type])
                              .join("・")
                          : record.wellness?.eventsRecorded
                            ? "予定なし"
                            : "未記録"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <p className="medical-context">
        この画面は記録の整理と受診時の相談を支援します。診断や治療方針の決定は行いません。自己評価の平均は参考値です。つらさが続くときは、記録を医療者との相談にお役立てください。
      </p>
    </div>
  );
}
