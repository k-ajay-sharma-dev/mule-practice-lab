import { useState } from 'react'
import { LANES, NODE_TYPES } from '../../arch/catalog.js'
import { configOf, settingsBadge, settingsOf } from '../../arch/settings.js'
import ArchIcon from './ArchIcon.jsx'

// The right panel of the Architecture Designer: the selected box, the selected line, or how to start.

export const laneOf = (node) => NODE_TYPES[node.type]?.lane ?? 'backends'

const ICONS = {
  left: 'M14 6l-6 6 6 6',
  right: 'M10 6l6 6-6 6',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5',
  close: 'M7 7l10 10M17 7L7 17',
  plus: 'M12 5v14M5 12h14',
  swap: 'M7 4L3.5 7.5 7 11M3.5 7.5H20M17 13l3.5 3.5L17 20M20.5 16.5H4',
  target: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 2v5M12 17v5M2 12h5M17 12h5',
  chevron: 'M9 6l6 6-6 6',
  out: 'M4 12h15M13 6l6 6-6 6',
  in: 'M20 12H5M11 6l-6 6 6 6',
}

function Icon({ name, size = 15 }) {
  return (
    <svg className={`ap-icon ap-icon-${name}`} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

function IconButton({ icon, label, title = label, className = '', ...rest }) {
  return (
    <button type="button" className={`ap-tool ${className}`} title={title} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  )
}

function KindToggle({ value, onChange }) {
  return (
    <div className="ap-kind" role="group" aria-label="Kind of line">
      {['sync', 'async'].map((k) => (
        <button type="button" key={k} className={value === k ? 'active' : ''} aria-pressed={value === k} onClick={() => onChange(k)}>
          <span className={`legend-${k}`} />
          {k === 'sync' ? 'Sync call' : 'Async'}
        </button>
      ))}
    </div>
  )
}

// One setting: its name beside its control, and what it does below.
function Setting({ field, value, onChange }) {
  const onOff = field.type === 'select' && field.options.length === 2 && field.options.includes('on')
  const changed = String(value) !== String(field.default)
  return (
    <label className={`ap-setting${changed ? ' changed' : ''}${field.type === 'select' && !onOff && field.options.some((o) => o.length > 10) ? ' wide' : ''}`}>
      <span className="ap-setting-name">{field.label}</span>
      {onOff ? (
        <span className="ap-switch">
          <input type="checkbox" role="switch" checked={value === 'on'} onChange={(e) => onChange(e.target.checked ? 'on' : 'off')} />
          <span aria-hidden="true" />
        </span>
      ) : field.type === 'select' ? (
        <select className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input className="input" type="number" min="0" value={value} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
      )}
      {field.help && <span className="ap-help">{field.help}</span>}
    </label>
  )
}

// How the box is deployed, protected or kept, for the Run tab's simulation (see arch/settings.js).
function NodeSettings({ node, onSetting }) {
  const [open, setOpen] = useState(Boolean(node.config))
  const fields = settingsOf(node.type)
  if (!fields.length) return null
  const config = configOf(node)
  return (
    <details className="ap-card ap-settings" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Icon name="chevron" size={14} />
        <span className="ap-section-title">Settings</span>
        <span className="ap-summary">{settingsBadge(node) || 'Defaults'}</span>
      </summary>
      <div className="ap-settings-list">
        {fields.map((f) => (
          <Setting key={f.key} field={f} value={config[f.key]} onChange={(v) => onSetting(f, v)} />
        ))}
      </div>
    </details>
  )
}

const NAME_TIPS = { 'experience-api': 'exp-mobile-api', 'process-api': 'prc-order-api', 'system-api': 'sys-sap-api' }

export function NodeProps({ node, diagram, nodeById, newKind, setNewKind, onLabel, onSetting, onConnect, onStartConnect, onEdgeKind, onEdgeRemove, onShift, onDelete, onDuplicate }) {
  const [target, setTarget] = useState('')
  const out = diagram.edges.filter((e) => e.from === node.id)
  const inc = diagram.edges.filter((e) => e.to === node.id)
  const others = diagram.nodes.filter((n) => n.id !== node.id && !out.some((e) => e.to === n.id))
  const type = NODE_TYPES[node.type]
  const inLane = diagram.nodes.filter((n) => laneOf(n) === laneOf(node))
  const at = inLane.findIndex((n) => n.id === node.id)

  const line = (e, other, dir) => {
    const name = other?.label || NODE_TYPES[other?.type]?.label
    return (
      <li key={e.id} className={`ap-line arch-lane-${other ? laneOf(other) : 'backends'}`}>
        <span className="ap-line-dir" title={dir === 'out' ? 'This box calls it' : 'It calls this box'}>
          <Icon name={dir} size={13} />
        </span>
        <span className="ap-line-name">{name}</span>
        <button
          type="button"
          className={`ap-chip ${e.kind}`}
          onClick={() => onEdgeKind(e.id, e.kind === 'sync' ? 'async' : 'sync')}
          title={`Change to ${e.kind === 'sync' ? 'async message' : 'sync call'}`}
          aria-label={`${name}: ${e.kind}. Change to ${e.kind === 'sync' ? 'async' : 'sync'}`}
        >
          {e.kind}
        </button>
        <IconButton icon="close" label={`Remove the connection with ${name}`} title="Remove connection" className="small danger" onClick={() => onEdgeRemove(e.id)} />
      </li>
    )
  }

  return (
    <div className="ap">
      <div className={`ap-head arch-lane-${laneOf(node)}`}>
        <ArchIcon type={node.type} />
        <div className="ap-head-text">
          <div className="ap-title">{type?.label}</div>
          <div className="ap-lane">{LANES.find((l) => l.key === laneOf(node))?.label}</div>
        </div>
      </div>

      <div className="ap-tools" role="toolbar" aria-label="Component actions">
        <IconButton icon="left" label="Move left in its lane" onClick={() => onShift(-1)} disabled={at <= 0} />
        <IconButton icon="right" label="Move right in its lane" onClick={() => onShift(1)} disabled={at === inLane.length - 1} />
        <IconButton icon="copy" label="Duplicate" title="Duplicate (Ctrl+D)" onClick={onDuplicate} />
        <IconButton icon="trash" label="Delete" title="Delete (Delete key)" className="danger" onClick={onDelete} />
      </div>

      <label className="ap-field">
        <span className="ap-section-title">Name</span>
        <input className="input" value={node.label} onChange={(e) => onLabel(e.target.value)} placeholder={type?.label} />
        {NAME_TIPS[node.type] && (
          <span className="ap-help">
            Name it by layer, such as <code>{NAME_TIPS[node.type]}</code>
          </span>
        )}
      </label>

      <NodeSettings key={node.id} node={node} onSetting={onSetting} />

      <section className="ap-section">
        <div className="ap-section-head">
          <span className="ap-section-title">Connections</span>
          {out.length + inc.length > 0 && <span className="ap-count">{out.length + inc.length}</span>}
        </div>
        {(out.length > 0 || inc.length > 0) && (
          <ul className="ap-lines">
            {out.map((e) => line(e, nodeById.get(e.to), 'out'))}
            {inc.map((e) => line(e, nodeById.get(e.from), 'in'))}
          </ul>
        )}
        <div className="ap-card ap-connect">
          <span className="ap-connect-title">Calls or sends to</span>
          <KindToggle value={newKind} onChange={setNewKind} />
          <div className="ap-connect-row">
            <select className="input" aria-label="Component to connect to" value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose…</option>
              {others.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label || NODE_TYPES[n.type]?.label}
                </option>
              ))}
            </select>
            <IconButton
              icon="plus"
              label="Add the connection"
              className="primary"
              disabled={!target}
              onClick={() => {
                onConnect(target)
                setTarget('')
              }}
            />
          </div>
          <button type="button" className="ap-pick" onClick={onStartConnect}>
            <Icon name="target" size={14} />
            Pick it on the canvas
          </button>
        </div>
      </section>
    </div>
  )
}

export function EdgeProps({ edge, nodeById, onKind, onReverse, onDelete }) {
  const end = (id) => {
    const node = nodeById.get(id)
    if (!node) return null
    return (
      <div className={`ap-end arch-lane-${laneOf(node)}`}>
        <ArchIcon type={node.type} />
        <span>{node.label || NODE_TYPES[node.type]?.label}</span>
      </div>
    )
  }
  return (
    <div className="ap">
      <div className="ap-title">Connection</div>
      <div className="ap-tools" role="toolbar" aria-label="Connection actions">
        <button type="button" className="ap-tool text" onClick={onReverse} title="Point the line the other way">
          <Icon name="swap" />
          Reverse
        </button>
        <IconButton icon="trash" label="Delete" title="Delete (Delete key)" className="danger" onClick={onDelete} />
      </div>
      <div className="ap-route">
        {end(edge.from)}
        <span className={`ap-route-line ${edge.kind}`} aria-hidden="true">
          <i />
        </span>
        {end(edge.to)}
      </div>
      <section className="ap-section">
        <span className="ap-section-title">Kind</span>
        <KindToggle value={edge.kind} onChange={onKind} />
        <span className="ap-help">{edge.kind === 'sync' ? 'The caller waits for the answer (HTTP).' : 'The sender does not wait. A queue, topic or event stream passes it on.'}</span>
      </section>
    </div>
  )
}

export function EmptyProps({ touch }) {
  return (
    <div className="ap">
      <div className="ap-title">Properties</div>
      <p className="ap-help">Select a component to name it, set it up and connect it. Select a line to change it.</p>
      <div className="ap-card ap-legend">
        <div>
          <span className="legend-sync" />
          <span>
            <b>Sync call</b>
            <span className="ap-help">The caller waits for the answer (HTTP).</span>
          </span>
        </div>
        <div>
          <span className="legend-async" />
          <span>
            <b>Async message</b>
            <span className="ap-help">Goes through a queue, topic or event stream.</span>
          </span>
        </div>
      </div>
      {!touch && (
        <ul className="ap-keys">
          <li>
            <kbd>Delete</kbd> remove
          </li>
          <li>
            <kbd>Ctrl D</kbd> duplicate
          </li>
          <li>
            <kbd>Ctrl Z</kbd> undo
          </li>
          <li>
            <kbd>Esc</kbd> stop connecting
          </li>
        </ul>
      )}
    </div>
  )
}
