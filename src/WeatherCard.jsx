import { useEffect, useRef, useState } from "react";
import { CloudSun, MapPin, RefreshCw, Search, X } from "lucide-react";
import { findLocations, getWeather } from "./weather-client.js";
import { manualWeather, validDate, WEATHER_LABELS } from "./wellness.js";

const LOCATION_KEY = "yohaku.weather-location.v1";
function savedLocation() {
  try {
    const data = JSON.parse(localStorage.getItem(LOCATION_KEY));
    return data &&
      typeof data.name === "string" &&
      Number.isFinite(data.latitude) &&
      Number.isFinite(data.longitude) &&
      typeof data.timezone === "string"
      ? data
      : null;
  } catch {
    return null;
  }
}
export default function WeatherCard({ date, value, onChange, error }) {
  const [location, setLocation] = useState(savedLocation);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [manual, setManual] = useState(value?.source === "manual");
  const generation = useRef(0);
  useEffect(() => {
    generation.current += 1;
    setBusy(false);
    setMessage("");
    setManual(value?.source === "manual");
  }, [date]);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  async function search() {
    const ticket = ++generation.current;
    setBusy(true);
    setMessage("");
    try {
      const found = await findLocations(query);
      if (ticket !== generation.current) return;
      setResults(found);
      if (!found.length)
        setMessage(
          "地域が見つかりません。市区町村名や英語表記でも検索できます。",
        );
    } catch (error) {
      if (ticket === generation.current) setMessage(error.message);
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  function select(item) {
    generation.current += 1;
    setBusy(false);
    setLocation(item);
    setEditing(false);
    setResults(null);
    setMessage("");
    try {
      localStorage.setItem(LOCATION_KEY, JSON.stringify(item));
    } catch {
      setMessage(
        "地域の設定を保存できません。この画面では引き続き取得できます。",
      );
    }
  }
  async function retrieve() {
    const ticket = ++generation.current;
    setBusy(true);
    setMessage("");
    try {
      const result = await getWeather(location, date);
      if (ticket !== generation.current) return;
      onChange({ ...result, location: location.name });
      setManual(false);
    } catch (error) {
      if (ticket === generation.current)
        setMessage(
          `天気を取得できません。${error.message} 手入力でも記録できます。`,
        );
    } finally {
      if (ticket === generation.current) setBusy(false);
    }
  }
  const manualValue = value?.source === "manual" ? value : manualWeather(date);
  function field(key, next) {
    onChange({ ...manualWeather(date), ...manualValue, [key]: next });
  }
  return (
    <section className="card weather-card" id="weather" tabIndex={-1}>
      <div className="section-heading">
        <span className="section-icon sky">
          <CloudSun size={20} />
        </span>
        <div>
          <h2>天気と、からだのリズム</h2>
          <p>地域の天気を、今日の記録と一緒に。</p>
        </div>
        <span className="optional">任意</span>
      </div>
      <div className="weather-location">
        <span>
          <MapPin size={15} />
          {location?.name || "天気の地域を選択"}
        </span>
        <button type="button" onClick={() => setEditing(!editing)}>
          {editing ? "閉じる" : location ? "地域を変更" : "地域を選ぶ"}
        </button>
      </div>
      {editing && (
        <div className="location-search">
          <label htmlFor="weather-location-query">市区町村名</label>
          <div>
            <input
              id="weather-location-query"
              value={query}
              placeholder="例：横浜、Tokyo"
              maxLength={60}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (query.trim().length >= 2 && !busy) search();
                }
              }}
            />
            <button
              className="button secondary"
              type="button"
              disabled={busy || query.trim().length < 2}
              onClick={search}
            >
              <Search size={15} />
              検索
            </button>
          </div>
          {results?.length > 0 && (
            <ul className="location-results">
              {results.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  <button type="button" onClick={() => select(item)}>
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="form-help">
            検索した地域名と、選んだ地域の座標・記録日を天気の取得に使います。体調や日記本文は送信しません。
          </p>
        </div>
      )}
      <button
        className="button weather-fetch"
        type="button"
        disabled={!location || busy || !validDate(date)}
        onClick={retrieve}
      >
        <RefreshCw size={16} className={busy ? "spin" : ""} />
        {busy ? "取得しています…" : `${date || "選択日"} の天気を取得`}
      </button>
      {value && (
        <div className="weather-snapshot">
          <div className="weather-snapshot-title">
            <strong>{WEATHER_LABELS[value.category]}</strong>
            <span>{value.location || "地域未記録"}</span>
            <button
              type="button"
              aria-label="この日の天気を取り消す"
              onClick={() => {
                generation.current += 1;
                setBusy(false);
                onChange(undefined);
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div className="weather-metrics">
            <span>
              気温
              <b>
                {value.temperature ?? "—"}
                <small>℃</small>
              </b>
            </span>
            <span>
              湿度
              <b>
                {value.humidity ?? "—"}
                <small>%</small>
              </b>
            </span>
            <span>
              海面気圧
              <b>
                {value.pressure ?? "—"}
                <small>hPa</small>
              </b>
            </span>
          </div>
          <p>
            前日との平均気圧差：
            {value.pressureChange == null
              ? "未記録"
              : `${value.pressureChange > 0 ? "+" : ""}${value.pressureChange} hPa`}
          </p>
          <small>
            {value.source === "manual" ? (
              "本人の手入力値"
            ) : (
              <>
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open-Meteo
                </a>{" "}
                · 気象モデルの推定・予報値
              </>
            )}{" "}
            ／ 気温・湿度・気圧は日平均、天気は正午ごろ
            {value.fetchedAt && (
              <> ／ 取得：{new Date(value.fetchedAt).toLocaleString("ja-JP")}</>
            )}
          </small>
        </div>
      )}
      {message && (
        <p className="inline-notice" role="alert">
          {message}
        </p>
      )}
      <details
        open={manual}
        onToggle={(event) => setManual(event.currentTarget.open)}
        className="weather-manual"
      >
        <summary>天気を手入力する</summary>
        <div className="health-form-grid">
          <label>
            地域名
            <input
              value={manualValue.location}
              maxLength={160}
              onChange={(event) => field("location", event.target.value)}
              placeholder="例：横浜市"
            />
          </label>
          <label>
            天気
            <select
              aria-label="天気"
              value={manualValue.category}
              onChange={(event) => field("category", event.target.value)}
            >
              {Object.entries(WEATHER_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {[
            ["temperature", "平均気温（℃）", -80, 60],
            ["humidity", "平均湿度（%）", 0, 100],
            ["pressure", "平均海面気圧（hPa）", 800, 1100],
            ["pressureChange", "前日との平均気圧差（hPa）", -100, 100],
          ].map(([key, label, min, max]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min={min}
                max={max}
                value={manualValue[key] ?? ""}
                placeholder="未記録"
                onChange={(event) =>
                  field(
                    key,
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                  )
                }
              />
            </label>
          ))}
        </div>
        <p className="form-help">
          分からない数値は空欄で大丈夫です。手入力すると取得した天気を置き換えます。日付を変えたときは取り直してください。
        </p>
      </details>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
