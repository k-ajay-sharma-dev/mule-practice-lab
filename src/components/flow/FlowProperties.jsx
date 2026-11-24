import { useContext } from 'react'
import CodeEditor from '../CodeEditor.jsx'
import { CodeBlock } from '../CopyButton.jsx'
import { Icon, IconButton } from '../designer/parts.jsx'
import { COMPONENTS, GROUPS } from '../../flow/catalog.js'
import { findItem, removeNode, removeRoute, shiftNode, updateConfig } from '../../flow/model.js'
import { Ctx } from './context.js'
import FlowIcon from './FlowIcon.jsx'

// The right panel of the Flow Designer: the settings of the selected component, route or flow.

// What is selected, in words: { title, where, type, group, fields, values }
function describe(item, ctx) {
  if (ctx.isFlow) {
    return {
      title: item.kind === 'flow' ? 'Flow' : 'Sub-flow',
      where: item.kind === 'flow' ? 'Starts from a source or a Flow Reference' : 'Runs from a Flow Reference',
      type: 'flow',
      group: 'connectors',
      fields: [{ key: 'name', label: 'Name', type: 'text' }],
      values: item,
    }
  }
  const type = ctx.isRoute ? ctx.parent.type : item.type
  const def = COMPONENTS[type]
  return {
    title: ctx.isRoute ? def.routeLabel : def.label,
    where: ctx.isRoute ? `Inside ${def.label}` : GROUPS.find((g) => g.id === def.group)?.label.replace(/ \(.*/, ''),
    type,
    group: def.group,
    fields: ctx.isRoute ? def.routeFields : def.fields,
    values: item.config,
  }
}

function Head({ what }) {
  return (
    <div className={`ap-head group-${what.group}`}>
      <FlowIcon type={what.type} />
      <div className="ap-head-text">
        <div className="ap-title">{what.title}</div>
        <div className="ap-lane">{what.where}</div>
      </div>
    </div>
  )
}

// The settings of one component in a read-only design, such as the reference answer.
export function ConfigView({ fields = [], values }) {
  // a reference can set something the catalog has no field for: show that too, under its own name
  const extra = Object.keys(values)
    .filter((key) => !fields.some((f) => f.key === key))
    .map((key) => ({ key, label: key }))
  const filled = [...fields, ...extra].filter((f) => values[f.key] != null && values[f.key] !== '')
  return (
    <div className="node-config" onClick={(e) => e.stopPropagation()}>
      {filled.length === 0 && <p className="muted small">No settings for this element.</p>}
      {filled.map((f) => (
        <div key={f.key} className="node-config-row">
          <span className="muted small">{f.label}</span>
          {f.type === 'textarea' ? (
            <CodeBlock className="mono small">{String(values[f.key])}</CodeBlock>
          ) : (
            <code className="small">{String(values[f.key])}</code>
          )}
        </div>
      ))}
    </div>
  )
}

// The settings of the selected component of a read-only design, in the same side panel the editable designer uses.
export function ReadOnlyProperties({ selectedId, onDeselect }) {
  const { design } = useContext(Ctx)
  const found = selectedId ? findItem(design, selectedId) : null
  if (!found || found.ctx.isFlow) {
    return (
      <aside className="properties">
        <div className="ap">
          <div className="ap-title">Settings</div>
          <p className="ap-help">Select a component to see how it is configured.</p>
        </div>
      </aside>
    )
  }
  const what = describe(found.item, found.ctx)
  return (
    <aside className="properties sheet-open">
      <button className="btn btn-ghost btn-sm properties-done" onClick={onDeselect}>
        Done
      </button>
      <div className="ap">
        <Head what={what} />
        <ConfigView fields={what.fields} values={what.values} />
      </div>
    </aside>
  )
}

// A setting is an expression when it is wrapped in #[ ], as in Mule. Anything else is used as plain text.
const isExpression = (value) => /^\s*#\[[\s\S]*\]\s*$/.test(String(value ?? ''))
// plain text that starts the way an expression does, such as payload.email: Mule would use it as those words
const looksLikeExpression = (value) => /^\s*(payload|vars\.|attributes\.|error\.|message\.|correlationId\b)/.test(String(value ?? ''))

// The fx switch beside a setting, as in Anypoint Studio: on wraps the value in #[ ], off takes the #[ ] away.
function FxButton({ value, onChange }) {
  const on = isExpression(value)
  const text = String(value ?? '').trim()
  return (
    <button
      type="button"
      className={`fx-btn${on ? ' on' : ''}`}
      aria-pressed={on}
      title={on ? 'Expression. Click to use plain text.' : 'Plain text. Click to make it an expression.'}
      onClick={() => onChange(on ? text.slice(2, -1).trim() : `#[${text}]`)}
    >
      fx
    </button>
  )
}

function PlainTextWarning({ value }) {
  if (isExpression(value) || !looksLikeExpression(value)) return null
  return <span className="ap-help warn-text">This is plain text, so it is used as these words. Click fx to make it an expression.</span>
}

// One setting. Text, expressions and scripts take the width of the panel; a number, a short choice or a switch sits
// beside its name.
function Setting({ field: f, value, plain, list, onChange }) {
  const help = f.help && <span className="ap-help">{f.help}</span>
  if (f.type === 'expression' || f.type === 'textarea') {
    // expressions and scripts get a code editor: highlighting, brackets and undo, like in Anypoint Studio
    return (
      <div className="ap-field">
        <span className="ap-label">{f.label}</span>
        <div className="fx-row">
          {f.type === 'expression' && <FxButton value={value} onChange={onChange} />}
          <div className={`code-field-box${f.type === 'textarea' ? ' tall' : ''}`}>
            <CodeEditor compact value={String(value ?? '')} language={/sql/i.test(f.key) ? 'sql' : 'dataweave'} onChange={(v) => onChange(v ?? '')} />
          </div>
        </div>
        <PlainTextWarning value={value} />
        {help}
      </div>
    )
  }
  if (f.type === 'text') {
    const input = <input className={`input${isExpression(value) ? ' mono' : ''}`} aria-label={f.label} value={value ?? ''} list={list} onChange={(e) => onChange(e.target.value)} />
    // a <div>, not a <label>: a label would pass clicks on its text to the fx button
    return (
      <div className="ap-field">
        <span className="ap-label">{f.label}</span>
        {plain ? (
          input
        ) : (
          <div className="fx-row">
            <FxButton value={value} onChange={onChange} />
            {input}
          </div>
        )}
        {!plain && <PlainTextWarning value={value} />}
        {help}
      </div>
    )
  }
  if (f.type === 'number') {
    return (
      <label className="ap-row">
        <span className="ap-label">{f.label}</span>
        <input className="input" type="number" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
        {help}
      </label>
    )
  }
  const onOff = f.options.length === 2 && f.options.includes('true') && f.options.includes('false')
  if (onOff) {
    return (
      <label className="ap-row">
        <span className="ap-label">{f.label}</span>
        <span className="ap-switch">
          <input type="checkbox" role="switch" checked={String(value ?? f.options[0]) === 'true'} onChange={(e) => onChange(String(e.target.checked))} />
          <span aria-hidden="true" />
        </span>
        {help}
      </label>
    )
  }
  return (
    <label className={f.options.some((o) => o.length > 12) ? 'ap-field' : 'ap-row'}>
      <span className="ap-label">{f.label}</span>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {f.options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {help}
    </label>
  )
}

function EmptyProps({ touch }) {
  return (
    <div className="ap">
      <div className="ap-title">Build the flow</div>
      <ol className="ap-steps">
        {touch ? (
          <>
            <li>Tap a component in the list.</li>
            <li>
              Tap a <span className="slot-plus inline">+</span> slot on the canvas.
            </li>
            <li>Tap a component to set it up, move it or delete it.</li>
          </>
        ) : (
          <>
            <li>Drag a component onto the canvas, or click it.</li>
            <li>
              If you clicked it, click a <span className="slot-plus inline">+</span> slot.
            </li>
            <li>Select a component to set it up here.</li>
          </>
        )}
      </ol>
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
            <kbd>Ctrl V</kbd> paste Mule XML
          </li>
          <li>
            <kbd>Esc</kbd> stop placing
          </li>
        </ul>
      )}
    </div>
  )
}

export default function Properties({ selectedId, onDeselect }) {
  const { design, change, remove, touch, placing, startMove, duplicate, flags, runMarks } = useContext(Ctx)
  const found = selectedId ? findItem(design, selectedId) : null
  if (!found) {
    return (
      <aside className="properties">
        <EmptyProps touch={touch} />
      </aside>
    )
  }

  const { item, ctx } = found
  const what = describe(item, ctx)
  const set = (key, value) => change(updateConfig(design, item.id, { [key]: value }))
  const isComponent = !ctx.isFlow && !ctx.isRoute
  const routeFields = isComponent ? (COMPONENTS[item.type].routeFields ?? []) : []
  const ran = runMarks?.[item.id]
  const failed = flags?.[item.id] ?? []
  const shift = (by) => shiftNode(design, item.id, by)

  return (
    <aside className={`properties${placing ? '' : ' sheet-open'}`}>
      <button className="btn btn-ghost btn-sm properties-done" onClick={onDeselect}>
        Done
      </button>
      <div className="ap" key={item.id}>
        <Head what={what} />

        {isComponent && (
          <div className="ap-tools" role="toolbar" aria-label="Component actions">
            {ctx.slot !== 'source' && (
              <>
                <IconButton icon="up" label="Move up" onClick={() => change(shift(-1))} disabled={shift(-1) === design} />
                <IconButton icon="down" label="Move down" onClick={() => change(shift(1))} disabled={shift(1) === design} />
                <IconButton icon="move" label="Move to another place" title="Move: then tap a highlighted slot" onClick={() => startMove(item.id)} />
                <IconButton icon="copy" label="Duplicate" title="Duplicate (Ctrl+D)" onClick={() => duplicate(item.id)} />
              </>
            )}
            <IconButton
              icon="trash"
              label="Delete"
              title="Delete (Delete key)"
              className="danger"
              onClick={() => {
                remove(removeNode(design, item.id), COMPONENTS[item.type]?.label)
                onDeselect()
              }}
            />
          </div>
        )}
        {ctx.isRoute && ctx.parent.routes?.length > 1 && (
          <div className="ap-tools" role="toolbar" aria-label="Route actions">
            <IconButton
              icon="trash"
              label={`Delete this ${what.title.toLowerCase()}`}
              className="danger"
              onClick={() => {
                remove(removeRoute(design, item.id), what.title)
                onDeselect()
              }}
            />
          </div>
        )}

        {ran?.fail && (
          <div className="ap-note bad">
            <Icon name="warn" />
            <span>{ran.text}</span>
          </div>
        )}
        {failed.map((label) => (
          <div key={label} className="ap-note warn">
            <Icon name="warn" />
            <span>{label}</span>
          </div>
        ))}

        {what.fields.length === 0 && <p className="ap-help">{routeFields.length ? '' : 'No settings for this element.'}</p>}
        {what.fields.length > 0 && (
          <div className="ap-fields">
            {what.fields.map((f) => (
              <Setting
                key={f.key}
                field={f}
                value={what.values[f.key]}
                plain={ctx.isFlow}
                list={item.type === 'flow-ref' && f.key === 'name' ? 'flow-names' : undefined}
                onChange={(v) => set(f.key, v)}
              />
            ))}
          </div>
        )}
        {routeFields.length > 0 && (
          <p className="ap-help">
            Click a {COMPONENTS[item.type].routeLabel} header on the canvas to set{' '}
            {routeFields
              .map((f) => f.label.replace(/ \(optional\)$/, '').toLowerCase())
              .join(', ')
              .replace(/, ([^,]*)$/, ' and $1')}
            .
          </p>
        )}
        <datalist id="flow-names">
          {design.flows.map((f) => (
            <option key={f.id} value={f.name} />
          ))}
        </datalist>
      </div>
    </aside>
  )
}
