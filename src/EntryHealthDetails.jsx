import {
  ACTIONS,
  EFFECTS,
  EVENT_TYPES,
  SEVERITIES,
  SYMPTOMS,
  TIMINGS,
  WEATHER_LABELS,
} from "./wellness.js";
export default function EntryHealthDetails({ entry }) {
  const { weather, wellness } = entry;
  if (!weather && !wellness) return null;
  return (
    <div className="entry-health-details">
      {weather && (
        <>
          <h3>天気・気圧</h3>
          <p>
            {WEATHER_LABELS[weather.category]} ／{" "}
            {weather.location || "地域未記録"}
            <br />
            日平均：気温 {weather.temperature ?? "—"}℃、湿度{" "}
            {weather.humidity ?? "—"}%、海面気圧 {weather.pressure ?? "—"} hPa
            <br />
            前日との平均気圧差{" "}
            {weather.pressureChange == null
              ? "未記録"
              : `${weather.pressureChange > 0 ? "+" : ""}${weather.pressureChange} hPa`}
            <small>
              {weather.source === "manual"
                ? "本人の手入力"
                : "Open-Meteo（気象モデルの推定・予報値）"}
            </small>
          </p>
        </>
      )}
      {wellness && (
        <>
          <h3>体調・対策</h3>
          <p>
            {SYMPTOMS.filter(([id]) =>
              Object.hasOwn(wellness.symptoms, id),
            ).map(([id, label]) => (
              <span className="health-detail-line" key={id}>
                {label}：
                {wellness.symptoms[id] == null
                  ? "未評価"
                  : `${wellness.symptoms[id]}/4（${SEVERITIES[wellness.symptoms[id]]}）`}
              </span>
            ))}
            {wellness.stress != null && (
              <span className="health-detail-line">
                ストレス：{wellness.stress}/4
              </span>
            )}
            {wellness.timing && (
              <span className="health-detail-line">
                気になった時間帯：{TIMINGS[wellness.timing]}
              </span>
            )}
            {wellness.actions.map((action) => (
              <span className="health-detail-line" key={action.id}>
                {ACTIONS.find(([id]) => id === action.id)[1]}：
                {EFFECTS[action.effect]}
              </span>
            ))}
            {wellness.notes && (
              <span className="health-detail-line">{wellness.notes}</span>
            )}
          </p>
          {(wellness.eventsRecorded || wellness.events?.length > 0) && (
            <>
              <h3>通院・移動・人との予定</h3>
              {!wellness.events?.length ? (
                <p>予定なし（本人が確認）</p>
              ) : (
                <ul className="event-history-list">
                  {wellness.events.map((event) => (
                    <li key={event.id}>
                      <strong>{EVENT_TYPES[event.type]}</strong>
                      <span>
                        {[
                          event.timing ? TIMINGS[event.timing] : "",
                          event.duration != null ? `${event.duration}分` : "",
                          event.burden != null
                            ? `負担感 ${event.burden}/4`
                            : "",
                          EFFECTS[event.effect],
                        ]
                          .filter(Boolean)
                          .join(" ／ ")}
                      </span>
                      {event.note && <p>{event.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
