import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Copy,
  Flower2,
  Images,
  Heart,
  Leaf,
  LockKeyhole,
  Minus,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import {
  copyText,
  DRAFT_KEY,
  emptyEntry,
  formatEntry,
  localDate,
  normalizeEntry,
  readEntries,
  saveEntry,
  STORE_KEY,
  validateEntry,
} from "./diary.js";
import SleepImages, { SleepImageGallery } from "./SleepImages.jsx";
import { downloadBlob, validImages } from "./images.js";
import { createBackup, readBackup, restoreBackup } from "./backup.js";
import WeatherCard from "./WeatherCard.jsx";
import WellnessForm from "./WellnessForm.jsx";
import Trends from "./Trends.jsx";
import EntryHealthDetails from "./EntryHealthDetails.jsx";
import { validWeather, validWellness } from "./wellness.js";

const conditionLabels = ["つらい", "少し不調", "ふつう", "良い", "とても良い"];
const moodLabels = ["しょんぼり", "いまひとつ", "ふつう", "ごきげん", "最高"];

function Face({ value, size = 30 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="13" r="1.1" fill="currentColor" />
      <circle cx="20" cy="13" r="1.1" fill="currentColor" />
      {value === 1 ? (
        <path
          d="M11 22q5-6 10 0"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : value === 2 ? (
        <path
          d="M12 21q4-3 8 0"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : value === 3 ? (
        <path
          d="M12 20h8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : value === 4 ? (
        <path
          d="M11 19q5 6 10 0"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M11 18h10q-1 7-5 7t-5-7Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function Rating({ name, value, onChange, labels, error, mood }) {
  return (
    <div
      className={`rating ${mood ? "mood-rating" : ""}`}
      role="group"
      aria-label={mood ? "今日の気分" : "今日の体調"}
      aria-describedby={error ? `${name}-error` : undefined}
    >
      {labels.map((label, index) => (
        <button
          key={label}
          id={index === 0 ? name : undefined}
          type="button"
          className={`rating-choice ${value === index + 1 ? "selected" : ""}`}
          aria-label={`${index + 1}：${label}`}
          aria-pressed={value === index + 1}
          onClick={() => onChange(index + 1)}
        >
          {mood ? (
            <Face value={index + 1} />
          ) : (
            <span className="rating-number">{index + 1}</span>
          )}
          <span className="rating-label">{label}</span>
          {value === index + 1 && (
            <span className="rating-check">
              <Check size={10} strokeWidth={3} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function initialState() {
  let entries = [],
    draft = emptyEntry(),
    warning = "";
  try {
    entries = readEntries();
  } catch {
    warning =
      "保存した日記を読み込めません。以前のデータは上書きしません。ブラウザの保存設定を確認してください。";
  }
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (
        data &&
        typeof data.date === "string" &&
        typeof data.insights === "string" &&
        typeof data.achievements === "string" &&
        (typeof data.sleep === "number" || typeof data.sleep === "string") &&
        [null, 1, 2, 3, 4, 5].includes(data.condition) &&
        [null, 1, 2, 3, 4, 5].includes(data.mood) &&
        validImages(data.sleepImages) &&
        validWeather(data.weather, data.date) &&
        validWellness(data.wellness)
      )
        draft = data;
    }
  } catch {
    warning ||=
      "このブラウザでは下書きを復元できません。コピー機能は引き続き使えます。";
  }
  // Start a fresh day only when the older draft is already saved in full.
  // An unsaved or incomplete draft always remains available for recovery.
  if (
    draft.date < localDate() &&
    !Object.keys(validateEntry(draft)).length &&
    entries.some(
      (saved) =>
        saved.date === draft.date &&
        JSON.stringify(normalizeEntry(saved)) ===
          JSON.stringify(normalizeEntry(draft)),
    )
  ) {
    draft = emptyEntry();
  }
  return { entries, draft, warning };
}

export default function App() {
  const [initial] = useState(initialState);
  const [entry, setEntry] = useState(initial.draft);
  const [entries, setEntries] = useState(initial.entries);
  const [warning, setWarning] = useState(initial.warning);
  const [tab, setTab] = useState("write");
  const [errors, setErrors] = useState({});
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [manualCopy, setManualCopy] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [draftStatus, setDraftStatus] = useState("");
  const toastTimer = useRef();
  const manualRef = useRef();
  const manualReturnFocus = useRef();
  const restoreInput = useRef();

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(entry));
        setDraftStatus("下書き保存済み");
      } catch {
        setDraftStatus("下書きを保存できません");
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [entry]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(entry));
      } catch {
        /* Copy remains available when storage is full. */
      }
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [entry]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key === STORE_KEY) {
        try {
          setEntries(readEntries());
        } catch {
          setWarning(
            "保存データを読み込めません。データ保護のため上書きを停止しています。",
          );
        }
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => {
    if (manualCopy) manualRef.current?.focus();
  }, [manualCopy]);

  function notify(message) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }
  function update(field, value) {
    setDraftStatus("");
    setEntry((prev) => {
      if (field === "weather" && value && value.date !== prev.date) return prev;
      return {
        ...prev,
        [field]: value,
        ...(field === "date" && prev.weather?.date !== value
          ? { weather: undefined }
          : {}),
      };
    });
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }
  function openManual(text) {
    manualReturnFocus.current = document.activeElement;
    setManualCopy(text);
  }
  function newToday() {
    if (
      !window.confirm(
        "入力中の下書きを、今日の空の日記に切り替えますか？保存済みの日記は履歴に残ります。",
      )
    )
      return;
    setEntry(emptyEntry());
    setDraftStatus("");
    setErrors({});
  }
  function closeManual() {
    setManualCopy("");
    manualReturnFocus.current?.focus();
  }
  function check() {
    const result = validateEntry(entry);
    setErrors(result);
    const first = Object.keys(result)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return false;
    }
    return true;
  }
  function persist() {
    try {
      setEntries(saveEntry(entry));
      setWarning("");
      notify(
        entry.sleepImages?.length
          ? "画像付きの日記を保存しました！"
          : "日記を保存しました！",
      );
    } catch {
      setWarning(
        "日記を保存できません。保存容量・ブラウザ設定・保存データを確認してください。コピーして記録を残すことはできます。",
      );
    }
  }
  async function handleSubmit(event) {
    event.preventDefault();
    if (imageBusy) return;
    if (!check()) return;
    if (event.nativeEvent.submitter?.value === "save") {
      persist();
      return;
    }
    setBusy(true);
    try {
      await copyText(formatEntry(entry));
      notify(
        entry.sleepImages?.length
          ? "コピーしました！画像は別途添付してください。"
          : "コピーしました！",
      );
    } catch {
      openManual(formatEntry(entry));
    } finally {
      setBusy(false);
    }
  }
  async function copySaved(saved) {
    try {
      await copyText(formatEntry(saved));
      notify(
        saved.sleepImages?.length
          ? "コピーしました！画像は別途添付してください。"
          : "コピーしました！",
      );
    } catch {
      openManual(formatEntry(saved));
    }
  }
  function edit(saved) {
    const hasDraft =
      entry.sleep !== "" ||
      entry.condition ||
      entry.mood ||
      entry.insights ||
      entry.achievements ||
      entry.sleepImages?.length;
    if (
      hasDraft &&
      JSON.stringify(normalizeEntry(entry)) !== JSON.stringify(saved) &&
      !window.confirm("入力中の下書きを、この日記に置き換えますか？")
    )
      return;
    setDraftStatus("");
    setEntry(saved);
    setErrors({});
    setTab("write");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function remove(date) {
    if (
      !window.confirm(`${date}の日記を削除しますか？この操作は元に戻せません。`)
    )
      return;
    try {
      const next = readEntries().filter((item) => item.date !== date);
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      setEntries(next);
      notify("日記を削除しました");
    } catch {
      setWarning("日記を削除できません。保存設定を確認してください。");
    }
  }
  function backup() {
    try {
      const data = readEntries();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `yohaku-diary-${localDate()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setWarning("保存データを読み込めないため、書き出せません。");
    }
  }

  async function backupWithImages() {
    setBackupBusy(true);
    try {
      downloadBlob(
        await createBackup(readEntries()),
        `yohaku-backup-${localDate()}.zip`,
      );
      notify("画像付きバックアップを書き出しました");
    } catch (error) {
      setWarning(`バックアップを作成できません。${error.message}`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function importBackup(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file || backupBusy) return;
    setBackupBusy(true);
    try {
      const backup = await readBackup(file);
      if (!backup.entries.length)
        throw new Error("バックアップに日記がありません。");
      const existing = readEntries();
      const conflicts = backup.entries.filter((item) =>
        existing.some((current) => current.date === item.date),
      ).length;
      if (
        !window.confirm(
          `${backup.entries.length}日分の日記と睡眠画像を復元します。${conflicts ? `同じ日付の${conflicts}日分はバックアップの内容に置き換わります。` : "現在の日記はそのまま残ります。"}入力中の下書きは変更しません。復元しますか？`,
        )
      )
        return;
      setEntries(await restoreBackup(backup));
      setWarning("");
      notify("日記と睡眠画像を復元しました！");
    } catch (error) {
      setWarning(`復元できません。${error.message}`);
    } finally {
      setBackupBusy(false);
    }
  }

  const dateObject = new Date(`${entry.date}T12:00:00`);
  const dateLabel = Number.isFinite(dateObject.getTime())
    ? new Intl.DateTimeFormat("ja-JP", {
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(dateObject)
    : "日付を選択";
  const completed = [
    entry.date,
    entry.sleep !== "" && entry.sleep !== null,
    entry.condition,
    entry.mood,
    entry.insights.trim(),
    entry.achievements.trim(),
  ].filter(Boolean).length;
  const filtered = entries.filter((item) =>
    `${item.date} ${item.insights} ${item.achievements}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const preview = `【日記データ記録】\n- 日付: ${entry.date || "未入力"}\n- 睡眠時間: ${entry.sleep === "" ? "未入力" : `${entry.sleep}時間`}\n- 体調: ${entry.condition ? `${entry.condition}/5` : "未選択"}\n- 気分: ${entry.mood ? `${entry.mood}/5` : "未選択"}\n- 気づき: ${entry.insights || "—"}\n- できたこと: ${entry.achievements || "—"}`;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="./" aria-label="余白 ホーム">
          <span className="brand-mark">
            <BookOpen size={23} strokeWidth={1.5} />
          </span>
          <span>
            余白<small>Y O H A K U</small>
          </span>
        </a>
        <div className="sidebar-tagline">わたしを知る、小さな日記。</div>
        <nav className="navigation" aria-label="メインメニュー">
          <button
            disabled={imageBusy || backupBusy}
            className={tab === "write" ? "active" : ""}
            onClick={() => setTab("write")}
          >
            <BookOpen size={19} />
            今日の記録
            <span className="nav-dot" />
          </button>
          <button
            disabled={imageBusy || backupBusy}
            className={tab === "history" ? "active" : ""}
            onClick={() => setTab("history")}
          >
            <CalendarDays size={19} />
            日記の履歴<span className="nav-count">{entries.length}</span>
          </button>
          <button
            disabled={imageBusy || backupBusy}
            className={tab === "trends" ? "active" : ""}
            onClick={() => setTab("trends")}
          >
            <TrendingUp size={19} />
            体調の振り返り
          </button>
        </nav>
        <div className="sidebar-note">
          <div className="plant-drawing">
            <Sprout size={50} strokeWidth={1} />
            <span />
          </div>
          <p>
            大きな出来事がなくても、
            <br />
            あなたの一日は、記録になる。
          </p>
          <small>毎日、ちょっとずつ。</small>
        </div>
        <div className="sidebar-bottom">
          <LockKeyhole size={14} />
          <span>日記はこの端末に保存されます</span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb">
            マイダイアリー <ChevronRight size={13} />{" "}
            <strong>
              {tab === "write"
                ? "今日の記録"
                : tab === "history"
                  ? "日記の履歴"
                  : "体調の振り返り"}
            </strong>
          </span>
          <span className="topbar-note">
            <span />
            自分のペースで、大丈夫。
          </span>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <Sun size={15} /> A LITTLE MOMENT FOR YOURSELF
              </div>
              <h1>
                {tab === "write" ? (
                  <>
                    今日を、少しだけ振り返る<span>。</span>
                  </>
                ) : tab === "history" ? (
                  <>
                    積み重ねた、わたしの毎日<span>。</span>
                  </>
                ) : (
                  <>
                    からだの声を、少しずつ知る<span>。</span>
                  </>
                )}
              </h1>
              <p>
                {tab === "write"
                  ? "感じたこと、気づいたこと。ありのままのあなたを残そう。"
                  : tab === "history"
                    ? "小さな記録から、あなたらしいパターンを見つけよう。"
                    : "天気や暮らしと体調のつながりを、記録から振り返ろう。"}
              </p>
            </div>
            <div className="heading-flower" aria-hidden="true">
              <Flower2 size={57} strokeWidth={1.1} />
              <span>one day at a time</span>
            </div>
          </div>
          {warning && (
            <div className="warning" role="alert">
              {warning}
            </div>
          )}
          {tab === "write" ? (
            <div className="content-grid">
              <form className="diary-form" onSubmit={handleSubmit} noValidate>
                <section className="card date-card">
                  <div className="date-icon">
                    <CalendarDays size={22} />
                  </div>
                  <div className="date-content">
                    <label htmlFor="date">記録する日</label>
                    <div className="date-input-row">
                      <input
                        id="date"
                        type="date"
                        required
                        value={entry.date}
                        onChange={(event) => update("date", event.target.value)}
                        aria-invalid={Boolean(errors.date)}
                        aria-describedby={
                          errors.date ? "date-error" : undefined
                        }
                      />
                      <span className="today-tag">
                        {entry.date === localDate() ? "今日" : "選択日"}
                      </span>
                    </div>
                  </div>
                  <span className="date-weekday">{dateLabel}</span>
                  {entry.date !== localDate() && (
                    <button
                      type="button"
                      className="new-entry-button"
                      disabled={imageBusy}
                      onClick={newToday}
                    >
                      今日を新しく記録
                    </button>
                  )}
                  {errors.date && (
                    <p id="date-error" className="field-error">
                      {errors.date}
                    </p>
                  )}
                </section>

                <WeatherCard
                  date={entry.date}
                  value={entry.weather}
                  onChange={(value) => update("weather", value)}
                  error={errors.weather}
                />
                <section className="card condition-card">
                  <div className="section-heading">
                    <span className="section-icon sage">
                      <Heart size={19} />
                    </span>
                    <div>
                      <h2>こころと、からだ</h2>
                      <p>今の自分に、そっと目を向けて。</p>
                    </div>
                    <span className="section-number">01</span>
                  </div>
                  <div className="sleep-row">
                    <div>
                      <label htmlFor="sleep" className="field-label">
                        <Moon size={16} />
                        昨晩の睡眠時間 <span className="required">必須</span>
                      </label>
                      <p className="field-hint">どのくらい眠れましたか？</p>
                    </div>
                    <div className="sleep-control">
                      <button
                        type="button"
                        aria-label="睡眠時間を0.5時間減らす"
                        disabled={
                          entry.sleep !== "" && Number(entry.sleep) <= 0
                        }
                        onClick={() =>
                          update(
                            "sleep",
                            Math.max(
                              0,
                              Number(entry.sleep === "" ? 7 : entry.sleep) -
                                0.5,
                            ),
                          )
                        }
                      >
                        <Minus size={16} />
                      </button>
                      <div>
                        <input
                          id="sleep"
                          type="number"
                          min="0"
                          max="24"
                          step="0.5"
                          inputMode="decimal"
                          placeholder="7.5"
                          required
                          value={entry.sleep}
                          onChange={(event) =>
                            update("sleep", event.target.value)
                          }
                          aria-invalid={Boolean(errors.sleep)}
                          aria-describedby={
                            errors.sleep ? "sleep-error" : undefined
                          }
                        />
                        <span>時間</span>
                      </div>
                      <button
                        type="button"
                        aria-label="睡眠時間を0.5時間増やす"
                        disabled={
                          entry.sleep !== "" && Number(entry.sleep) >= 24
                        }
                        onClick={() =>
                          update(
                            "sleep",
                            Math.min(
                              24,
                              Number(entry.sleep === "" ? 7 : entry.sleep) +
                                0.5,
                            ),
                          )
                        }
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                  {errors.sleep && (
                    <p id="sleep-error" className="field-error">
                      {errors.sleep}
                    </p>
                  )}
                  <div className="rating-field">
                    <div className="rating-heading">
                      <span className="field-label">
                        今日の体調 <span className="required">必須</span>
                      </span>
                      <span className="rating-scale">
                        1 <span>—</span> 5
                      </span>
                    </div>
                    <Rating
                      name="condition"
                      value={entry.condition}
                      onChange={(value) => update("condition", value)}
                      labels={conditionLabels}
                      error={errors.condition}
                    />
                    {errors.condition && (
                      <p id="condition-error" className="field-error">
                        {errors.condition}
                      </p>
                    )}
                  </div>
                  <div className="rating-field mood-field">
                    <div className="rating-heading">
                      <span className="field-label">
                        今日の気分 <span className="required">必須</span>
                      </span>
                      <span className="rating-subtitle">
                        いちばん近い気持ちを選んでね
                      </span>
                    </div>
                    <Rating
                      name="mood"
                      value={entry.mood}
                      onChange={(value) => update("mood", value)}
                      labels={moodLabels}
                      error={errors.mood}
                      mood
                    />
                    {errors.mood && (
                      <p id="mood-error" className="field-error">
                        {errors.mood}
                      </p>
                    )}
                  </div>
                </section>

                <WellnessForm
                  value={entry.wellness}
                  onChange={(value) => update("wellness", value)}
                  error={errors.wellness}
                />
                <SleepImages
                  images={entry.sleepImages || []}
                  date={entry.date}
                  onChange={(images) => update("sleepImages", images)}
                  busy={imageBusy}
                  onBusyChange={setImageBusy}
                />

                <section className="card reflection-card">
                  <div className="section-heading">
                    <span className="section-icon peach">
                      <Sparkles size={19} />
                    </span>
                    <div>
                      <h2>今日の小さな発見</h2>
                      <p>ひとことでも、まとまっていなくても。</p>
                    </div>
                    <span className="section-number">02</span>
                  </div>
                  <div className="text-field">
                    <label htmlFor="insights" className="field-label">
                      <Leaf size={16} />
                      気づき <span className="optional">任意</span>
                    </label>
                    <textarea
                      id="insights"
                      rows="3"
                      value={entry.insights}
                      onChange={(event) =>
                        update("insights", event.target.value)
                      }
                      placeholder="散歩をしたら、頭がすっきりした。朝の時間が好きかもしれない。"
                    />
                    <span className="textarea-note">
                      感じたことや、心に残ったことを自由に。
                    </span>
                  </div>
                  <div className="text-field">
                    <label htmlFor="achievements" className="field-label">
                      <CircleCheck size={16} />
                      できたこと <span className="optional">任意</span>
                    </label>
                    <textarea
                      id="achievements"
                      rows="3"
                      value={entry.achievements}
                      onChange={(event) =>
                        update("achievements", event.target.value)
                      }
                      placeholder="ちゃんと朝ごはんを食べた。気になっていた本を少し読めた。"
                    />
                    <span className="textarea-note">
                      小さな「できた」も、ちゃんとあなたの一歩。
                    </span>
                  </div>
                </section>

                <div className="form-actions">
                  <div className="draft-state">
                    <Check size={14} />
                    {draftStatus || "下書きを保存中…"}
                  </div>
                  <div className="action-buttons">
                    <button
                      className="button secondary"
                      type="submit"
                      value="save"
                      disabled={imageBusy}
                    >
                      <BookOpen size={17} />
                      日記を保存
                    </button>
                    <button
                      className="button primary"
                      type="submit"
                      value="copy"
                      disabled={busy || imageBusy}
                    >
                      <Copy size={18} />
                      {busy ? "コピー中…" : "ChatGPT用にコピー"}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                  <p className="action-note">
                    コピーした内容を、ChatGPTのチャットに貼り付けて使えます。
                  </p>
                </div>
              </form>

              <aside className="right-column">
                <section className="handoff-card">
                  <div className="handoff-top">
                    <span className="sparkle-icon">
                      <Sparkles size={21} />
                    </span>
                    <span className="tiny-label">YOUR DAILY COMPANION</span>
                  </div>
                  <h2>
                    記録を、
                    <br />
                    自分を知るヒントに。
                  </h2>
                  <p>
                    今日の記録をChatGPTに渡して、
                    <br />
                    気づきや変化を一緒に見つけよう。
                  </p>
                  <div className="handoff-steps">
                    <div>
                      <span>1</span>今日の自分を記録する
                    </div>
                    <div>
                      <span>2</span>ボタンでコピーする
                    </div>
                    <div>
                      <span>3</span>ChatGPTに貼り付ける
                    </div>
                  </div>
                  <div className="handoff-foot">
                    <LockKeyhole size={13} />
                    自動送信されないので、安心です。
                  </div>
                </section>
                <section className="preview-card">
                  <div className="preview-heading">
                    <h2>コピー内容のプレビュー</h2>
                    <span>LIVE</span>
                  </div>
                  <pre>
                    {preview}
                    {entry.sleepImages?.length
                      ? `\n- 睡眠画像: ${entry.sleepImages.length}枚（別途添付）`
                      : ""}
                  </pre>
                  <div className="preview-foot">
                    <span className="code-symbol">{"{ }"}</span>Markdown ＋
                    JSON形式でコピー
                  </div>
                </section>
                <div className="gentle-note">
                  <Flower2 size={22} strokeWidth={1.4} />
                  <p>
                    うまく書こうとしなくていい。
                    <br />
                    今日のあなたの言葉で。
                  </p>
                </div>
                <div className="progress-note">
                  <div>
                    <span>今日の記録</span>
                    <span>
                      {completed}
                      <small> / 6 項目</small>
                    </span>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${(completed / 6) * 100}%` }} />
                  </div>
                  <p>自由記述は空欄でも大丈夫です。</p>
                </div>
              </aside>
            </div>
          ) : tab === "trends" ? (
            <Trends
              entries={entries}
              onNotify={notify}
              onManualCopy={openManual}
            />
          ) : (
            <section className="history-section">
              <div className="history-toolbar">
                <div className="search-box">
                  <Search size={18} />
                  <input
                    aria-label="日記を検索"
                    placeholder="日付や言葉で検索"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <button
                  className="button secondary"
                  disabled={!entries.length}
                  onClick={backup}
                >
                  <ArrowDownToLine size={17} />
                  JSONを書き出す
                </button>
              </div>
              <div className="history-backup-tools">
                <button
                  className="button secondary"
                  disabled={!entries.length || backupBusy}
                  onClick={backupWithImages}
                >
                  <Images size={17} />
                  {backupBusy ? "処理中…" : "画像付きバックアップ"}
                </button>
                <input
                  ref={restoreInput}
                  type="file"
                  accept=".zip,application/zip"
                  className="visually-hidden"
                  aria-label="バックアップZIPを選択"
                  disabled={backupBusy}
                  onChange={importBackup}
                />
                <button
                  className="button secondary"
                  disabled={backupBusy}
                  onClick={() => restoreInput.current?.click()}
                >
                  <Upload size={17} />
                  バックアップを復元
                </button>
              </div>
              {entries.some((item) => item.sleepImages?.length) && (
                <p className="backup-help">
                  JSONには画像の情報のみを含みます。画像の原本も残すには「画像付きバックアップ」をお使いください。
                </p>
              )}
              <div className="history-count">
                {entries.length} 日分の記録{" "}
                <span>同じ日付の記録は更新されます</span>
              </div>
              {filtered.length ? (
                <div className="history-list">
                  {filtered.map((saved) => (
                    <article className="card history-card" key={saved.date}>
                      <button
                        className="history-summary"
                        onClick={() =>
                          setExpanded(
                            expanded === saved.date ? null : saved.date,
                          )
                        }
                        aria-expanded={expanded === saved.date}
                      >
                        <span className="history-date">
                          <CalendarDays size={19} />
                          {saved.date}
                        </span>
                        <span className="history-stats">
                          <span>
                            <Moon size={15} />
                            {saved.sleep}h
                          </span>
                          <span>
                            <Heart size={15} />
                            {saved.condition}/5
                          </span>
                          <span>
                            <Face value={saved.mood} size={22} />
                            {saved.mood}/5
                          </span>
                        </span>
                        <ChevronDown
                          className={expanded === saved.date ? "rotated" : ""}
                          size={18}
                        />
                      </button>
                      <p className="history-excerpt">
                        {saved.insights ||
                          saved.achievements ||
                          "こころと、からだを記録した日。"}
                      </p>
                      {!!saved.sleepImages?.length && (
                        <span className="history-image-badge">
                          <Images size={13} />
                          睡眠画像 {saved.sleepImages.length}枚
                        </span>
                      )}
                      {expanded === saved.date && (
                        <div className="history-detail">
                          <EntryHealthDetails entry={saved} />
                          <h3>気づき</h3>
                          <p>{saved.insights || "記録なし"}</p>
                          <h3>できたこと</h3>
                          <p>{saved.achievements || "記録なし"}</p>
                          {!!saved.sleepImages?.length && (
                            <div className="history-sleep-images">
                              <h3>睡眠画像の原本</h3>
                              <SleepImageGallery
                                images={saved.sleepImages}
                                date={saved.date}
                              />
                              <p>
                                ChatGPTには、コピーした日記と画像を一緒に添付してください。
                              </p>
                            </div>
                          )}
                          <div className="history-actions">
                            <button
                              className="button secondary"
                              onClick={() => edit(saved)}
                            >
                              編集する
                            </button>
                            <button
                              className="button primary"
                              onClick={() => copySaved(saved)}
                            >
                              <Copy size={16} />
                              コピー
                            </button>
                            <button
                              className="delete-button"
                              aria-label={`${saved.date}の日記を削除`}
                              onClick={() => remove(saved.date)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-history">
                  <span>
                    <BookOpen size={35} strokeWidth={1.3} />
                  </span>
                  <h2>
                    {search
                      ? "一致する日記がありません"
                      : "あなたの記録は、ここから。"}
                  </h2>
                  <p>
                    {search
                      ? "ほかの日付や言葉で探してみてください。"
                      : "日記を保存すると、いつでも振り返れます。"}
                  </p>
                  {!search && (
                    <button
                      className="button primary"
                      onClick={() => setTab("write")}
                    >
                      最初の日記を書く
                      <ArrowRight size={16} />
                    </button>
                  )}
                </div>
              )}
              <p className="storage-note">
                <LockKeyhole size={14} />
                記録と睡眠画像はこのブラウザ内に保存されます。端末間の同期はありません。大切な記録は「画像付きバックアップ」で書き出して保管してください。
              </p>
            </section>
          )}
          <footer className="page-footer">
            <span>
              余白 <span className="footer-divider">/</span>{" "}
              あなたの毎日に、ひと呼吸。
            </span>
            <span>MADE FOR YOUR EVERYDAY</span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={20} />
          {toast}
          <button onClick={() => setToast("")} aria-label="通知を閉じる">
            <X size={15} />
          </button>
        </div>
      )}
      {manualCopy && (
        <div
          className="modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeManual();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-title"
            className="manual-modal"
            onKeyDown={(event) => {
              if (event.key === "Escape") closeManual();
              if (event.key === "Tab") {
                const focusable = [
                  ...event.currentTarget.querySelectorAll("button, textarea"),
                ];
                const first = focusable[0],
                  last = focusable.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <h2 id="manual-title">日記を手動でコピー</h2>
            <p>
              ブラウザが自動コピーを許可していません。文章を選択してコピーしてください。
            </p>
            <textarea
              ref={manualRef}
              value={manualCopy}
              readOnly
              aria-label="コピーする日記データ"
              rows="12"
              onFocus={(event) => event.target.select()}
            />
            <button className="button primary" onClick={closeManual}>
              閉じる
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
