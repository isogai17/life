import { useEffect, useState } from "react";
import {
  Activity,
  CalendarPlus,
  ChevronDown,
  HeartPulse,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ACTIONS,
  EFFECTS,
  emptyWellness,
  EVENT_TYPES,
  SEVERITIES,
  SYMPTOMS,
  TIMINGS,
} from "./wellness.js";

function Severity({ label, value, onChange }) {
  return (
    <div className="severity-control" role="group" aria-label={label}>
      {SEVERITIES.map((text, index) => (
        <button
          type="button"
          key={text}
          aria-label={`${label} ${index}：${text}`}
          aria-pressed={value === index}
          onClick={() => onChange(value === index ? null : index)}
        >
          {index}
          <small>{text}</small>
        </button>
      ))}
    </div>
  );
}
export default function WellnessForm({ value, onChange, error }) {
  const state = { ...emptyWellness(), ...value };
  const [open, setOpen] = useState(Boolean(value));
  useEffect(() => {
    if (error) setOpen(true);
  }, [error]);
  function update(patch) {
    onChange({ ...state, ...patch });
  }
  function symptom(id) {
    const next = { ...state.symptoms };
    if (Object.hasOwn(next, id)) delete next[id];
    else next[id] = null;
    update({ symptoms: next });
  }
  function action(id) {
    update({
      actions: state.actions.some((action) => action.id === id)
        ? state.actions.filter((action) => action.id !== id)
        : [...state.actions, { id, effect: "unknown" }],
    });
  }
  function addEvent(type) {
    if (state.events.length >= 20) return;
    update({
      eventsRecorded: true,
      events: [
        ...state.events,
        {
          id: crypto.randomUUID(),
          type,
          duration: null,
          burden: null,
          effect: "unknown",
          timing: "",
          note: "",
        },
      ],
    });
  }
  function eventField(id, patch) {
    update({
      events: state.events.map((event) =>
        event.id === id ? { ...event, ...patch } : event,
      ),
    });
  }
  return (
    <details
      className="card wellness-card"
      id="wellness"
      tabIndex={-1}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="section-heading">
        <span className="section-icon rose">
          <HeartPulse size={19} />
        </span>
        <div>
          <h2>体調の変化と、暮らしの記録</h2>
          <p>症状・対策・通院や予定を、無理のない範囲で。</p>
        </div>
        <ChevronDown size={17} />
      </summary>
      <div className="wellness-content">
        <h3>
          <Activity size={16} />
          気になった症状
        </h3>
        <p className="form-help">
          追いたい項目を選んで、強さを0〜4で記録します。0は「なし」、未選択は「未記録」です。
        </p>
        <div className="health-chips">
          {SYMPTOMS.map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={Object.hasOwn(state.symptoms, id)}
              onClick={() => symptom(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {SYMPTOMS.filter(([id]) => Object.hasOwn(state.symptoms, id)).map(
          ([id, label]) => (
            <div className="symptom-row" key={id}>
              <span>{label}</span>
              <Severity
                label={label}
                value={state.symptoms[id]}
                onChange={(severity) =>
                  update({ symptoms: { ...state.symptoms, [id]: severity } })
                }
              />
            </div>
          ),
        )}
        <div className="health-form-grid">
          <label>
            ストレスの強さ
            <select
              aria-label="ストレスの強さ"
              value={state.stress ?? ""}
              onChange={(event) =>
                update({
                  stress:
                    event.target.value === ""
                      ? null
                      : Number(event.target.value),
                })
              }
            >
              <option value="">未記録</option>
              {SEVERITIES.map((label, index) => (
                <option key={label} value={index}>
                  {index}：{label}
                </option>
              ))}
            </select>
          </label>
          <label>
            症状が気になった時間帯
            <select
              aria-label="症状が気になった時間帯"
              value={state.timing}
              onChange={(event) => update({ timing: event.target.value })}
            >
              {Object.entries(TIMINGS).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <h3>試した対策と、そのときの手応え</h3>
        <div className="health-chips">
          {ACTIONS.map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={state.actions.some((action) => action.id === id)}
              onClick={() => action(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {state.actions.map((action) => (
          <label className="action-effect" key={action.id}>
            {ACTIONS.find(([id]) => id === action.id)[1]}の手応え
            <select
              aria-label={`${ACTIONS.find(([id]) => id === action.id)[1]}の手応え`}
              value={action.effect}
              onChange={(event) =>
                update({
                  actions: state.actions.map((item) =>
                    item.id === action.id
                      ? { ...item, effect: event.target.value }
                      : item,
                  ),
                })
              }
            >
              {Object.entries(EFFECTS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="wellness-divider" />
        <h3>
          <CalendarPlus size={16} />
          通院・移動・人との予定
        </h3>
        <p className="form-help">
          鍼灸などの通院、移動、人と会った予定を記録できます。複数の予定も追加できます。
        </p>
        <div className="health-chips event-add">
          {Object.entries(EVENT_TYPES).map(([type, label]) => (
            <button
              type="button"
              key={type}
              onClick={() => addEvent(type)}
              disabled={state.events.length >= 20}
              aria-label={`${label}の記録を追加`}
            >
              <Plus size={13} />
              {label}
            </button>
          ))}
        </div>
        <label className="event-recorded">
          <input
            type="checkbox"
            checked={state.eventsRecorded || state.events.length > 0}
            disabled={state.events.length > 0}
            onChange={(event) =>
              update({ eventsRecorded: event.target.checked })
            }
          />
          この日の予定を記録した（予定なしの日もチェック）
        </label>
        {state.events.map((event, index) => (
          <fieldset className="event-record" key={event.id}>
            <legend>
              {EVENT_TYPES[event.type]} {index + 1}
            </legend>
            <button
              className="event-remove"
              type="button"
              onClick={() =>
                update({
                  events: state.events.filter((item) => item.id !== event.id),
                })
              }
              aria-label={`${EVENT_TYPES[event.type]} ${index + 1}を削除`}
            >
              <Trash2 size={16} />
            </button>
            <div className="health-form-grid">
              <label>
                {EVENT_TYPES[event.type]} {index + 1}の所要時間（分）
                <input
                  type="number"
                  min="0"
                  max="1440"
                  step="1"
                  inputMode="numeric"
                  value={event.duration ?? ""}
                  placeholder="未記録"
                  onChange={(e) =>
                    eventField(event.id, {
                      duration:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                {EVENT_TYPES[event.type]} {index + 1}の時間帯
                <select
                  aria-label={`${EVENT_TYPES[event.type]} ${index + 1}の時間帯`}
                  value={event.timing}
                  onChange={(e) =>
                    eventField(event.id, { timing: e.target.value })
                  }
                >
                  {Object.entries(TIMINGS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {EVENT_TYPES[event.type]} {index + 1}の負担感
                <select
                  aria-label={`${EVENT_TYPES[event.type]} ${index + 1}の負担感`}
                  value={event.burden ?? ""}
                  onChange={(e) =>
                    eventField(event.id, {
                      burden:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">未記録</option>
                  {SEVERITIES.map((label, value) => (
                    <option key={value} value={value}>
                      {value}：{label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {EVENT_TYPES[event.type]} {index + 1}の後の手応え
                <select
                  aria-label={`${EVENT_TYPES[event.type]} ${index + 1}の後の手応え`}
                  value={event.effect}
                  onChange={(e) =>
                    eventField(event.id, { effect: e.target.value })
                  }
                >
                  {Object.entries(EFFECTS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="health-note-label">
              {EVENT_TYPES[event.type]} {index + 1}のメモ
              <textarea
                rows="2"
                maxLength={2000}
                value={event.note}
                placeholder="予定の内容、気になったことなど"
                onChange={(e) => eventField(event.id, { note: e.target.value })}
              />
            </label>
          </fieldset>
        ))}
        <label className="health-note-label">
          体調・対策の補足メモ
          <textarea
            rows="3"
            maxLength={10000}
            value={state.notes}
            onChange={(event) => update({ notes: event.target.value })}
            placeholder="いつ変化したか、ほかに思い当たることなど"
          />
        </label>
        <p className="health-purpose">
          手応えはご自身の感覚として記録します。治療や対策の効果は、ほかの生活要因も含めて受診時に相談できます。
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
