// Pick any time for a round: a quick choice, or type your own minutes. `suggested` (when given) is offered first
// and used until you choose something else.
const PRESETS = [5, 10, 15, 20, 30, 45, 60, 90]
export const MAX_MINUTES = 180

export default function TimePicker({ value, onChange, suggested }) {
  const pick = (m) => onChange(Math.min(MAX_MINUTES, Math.max(1, Math.round(m))))
  return (
    <div className="field time-picker">
      <span>Time</span>
      <div className="time-chips">
        {suggested != null && !PRESETS.includes(suggested) && (
          <button type="button" className={`chip-btn${value === suggested ? ' active' : ''}`} onClick={() => pick(suggested)}>
            {suggested} min (suggested)
          </button>
        )}
        {PRESETS.map((m) => (
          <button type="button" key={m} className={`chip-btn${value === m ? ' active' : ''}`} onClick={() => pick(m)}>
            {m} min{m === suggested ? ' (suggested)' : ''}
          </button>
        ))}
        <label className="time-own small muted">
          or
          <input
            className="input mono"
            type="number"
            min={1}
            max={MAX_MINUTES}
            value={value}
            onChange={(e) => e.target.value !== '' && pick(Number(e.target.value))}
            aria-label="Minutes"
          />
          min
        </label>
      </div>
    </div>
  )
}
