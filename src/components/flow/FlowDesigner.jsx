import { createContext, Fragment, useContext, useMemo, useRef, useState } from 'react'
import CodeEditor from '../CodeEditor.jsx'
import { useCoarsePointer, useRevealWhenStacked } from '../touch.js'
import { COMPONENTS, GROUPS } from '../../flow/catalog.js'
import {
  acceptsKind,
  addFlow,
  addRoute,
  countComponents,
  createNode,
  emptyDesign,
  findItem,
  insertNode,
  moveNode,
  removeFlow,
  removeNode,
  removeRoute,
  shiftNode,
  updateConfig,
} from '../../flow/model.js'
import { toXml } from '../../flow/xml.js'

const Ctx = createContext(null)

// Visual Mule flow editor. Design only: nothing here is executed.
// Props: design, onChange(design), readOnly
export default function FlowDesigner({ design, onChange, readOnly = false }) {
  const [selectedId, setSelectedId] = useState(null)
  const [armed, setArmed] = useState(null) // component type picked from the palette (tap-to-place)
  const [moving, setMoving] = useState(null) // id of a node being moved by tapping a slot
  const [drag, setDrag] = useState(null) // { type } from palette or { moveId } from canvas
  const [view, setView] = useState('design')
  const root = useRef(null)
  const touch = useCoarsePointer()

  const placing = Boolean(armed || moving)
  useRevealWhenStacked(root, '.designer-body', placing, 'start')
  useRevealWhenStacked(root, '.node.selected, .route.selected, .flow-box.selected', selectedId)

  function cancelPlacing() {
    setArmed(null)
    setMoving(null)
  }

  const payload = drag ?? (armed ? { type: armed } : moving ? { moveId: moving } : null)
  const payloadKind = payload?.type
    ? COMPONENTS[payload.type].kind
    : payload?.moveId
      ? COMPONENTS[findItem(design, payload.moveId)?.item.type]?.kind
      : null

  const ctx = useMemo(
    () => ({
      design,
      readOnly,
      selectedId,
      select: (id) => !readOnly && setSelectedId(id),
      payloadKind,
      setDrag,
      canDrop: (key) => !!payloadKind && acceptsKind(key, payloadKind),
      dropAt(key, index) {
        if (!payload || !acceptsKind(key, payloadKind)) return
        if (payload.type) {
          const node = createNode(payload.type)
          onChange(insertNode(design, key, index, node))
          setSelectedId(node.id)
        } else {
          onChange(moveNode(design, payload.moveId, key, index))
        }
        setDrag(null)
        cancelPlacing()
      },
      change: onChange,
      touch,
      placing,
      startMove: (id) => {
        setArmed(null)
        setMoving(id)
      },
    }),
    [design, readOnly, selectedId, payload, payloadKind, onChange, touch, placing],
  )

  function onKeyDown(e) {
    if (readOnly) return
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
    if (e.key === 'Escape') {
      cancelPlacing()
      setSelectedId(null)
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selectedId) {
      const found = findItem(design, selectedId)
      if (found && !found.ctx.isFlow && !found.ctx.isRoute) {
        onChange(removeNode(design, selectedId))
        setSelectedId(null)
      }
    }
  }

  return (
    <Ctx.Provider value={ctx}>
      <div
        ref={root}
        className={`designer ${readOnly ? 'read-only' : ''}${selectedId && !placing ? ' sheet-active' : ''}`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="designer-toolbar">
          <div className="seg">
            <button className={view === 'design' ? 'active' : ''} onClick={() => setView('design')}>
              Message Flow
            </button>
            <button className={view === 'xml' ? 'active' : ''} onClick={() => setView('xml')}>
              Configuration XML
            </button>
          </div>
          {!readOnly && view === 'design' && (
            <div className="toolbar-actions">
              <button className="btn btn-ghost" onClick={() => onChange(addFlow(design, 'flow'))}>
                + Flow
              </button>
              <button className="btn btn-ghost" onClick={() => onChange(addFlow(design, 'sub-flow'))}>
                + Sub-flow
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  if (countComponents(design) && !confirm('Clear the whole design?')) return
                  onChange(emptyDesign())
                  setSelectedId(null)
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {view === 'xml' ? (
          <div className="designer-xml">
            <CodeEditor value={toXml(design)} language="xml" readOnly />
          </div>
        ) : (
          <div className="designer-body">
            {!readOnly && <Palette armed={armed} setArmed={setArmed} />}
            <div className="canvas" onClick={() => setSelectedId(null)}>
              {placing && (
                <div className="armed-hint">
                  <span>
                    {armed ? 'Placing' : 'Moving'}{' '}
                    <strong>{COMPONENTS[armed ?? findItem(design, moving)?.item.type]?.label}</strong>: tap a highlighted slot
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      cancelPlacing()
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {design.flows.map((f) => (
                <FlowView key={f.id} flow={f} />
              ))}
            </div>
            {!readOnly && <Properties selectedId={selectedId} onDeselect={() => setSelectedId(null)} />}
          </div>
        )}
      </div>
    </Ctx.Provider>
  )
}

// ---------- Palette ----------

function Palette({ armed, setArmed }) {
  const { setDrag, touch } = useContext(Ctx)
  const [query, setQuery] = useState('')
  const q = query.toLowerCase()

  return (
    <aside className="palette">
      <input className="input palette-search" placeholder="Search components" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="palette-groups">
        {GROUPS.map((g) => {
          const items = Object.entries(COMPONENTS).filter(([, c]) => c.group === g.id && c.label.toLowerCase().includes(q))
          if (!items.length) return null
          return (
            <div key={g.id} className="palette-group">
              <div className="palette-group-title">{g.label}</div>
              {items.map(([type, c]) => (
                <button
                  key={type}
                  className={`palette-item group-${c.group} ${armed === type ? 'armed' : ''}`}
                  draggable={!touch}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', type)
                    e.dataTransfer.effectAllowed = 'copy'
                    setDrag({ type })
                  }}
                  onDragEnd={() => setDrag(null)}
                  onClick={() => setArmed(armed === type ? null : type)}
                  title="Drag onto the canvas, or tap then tap a slot"
                >
                  <span className="node-glyph">{c.glyph}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

// ---------- Canvas ----------

function FlowView({ flow }) {
  const { design, readOnly, selectedId, select, change } = useContext(Ctx)
  return (
    <section className={`flow-box ${selectedId === flow.id ? 'selected' : ''}`}>
      <header
        className="flow-head"
        onClick={(e) => {
          e.stopPropagation()
          select(flow.id)
        }}
      >
        <span className={`flow-kind kind-${flow.kind}`}>{flow.kind}</span>
        <span className="flow-name">{flow.name}</span>
        {!readOnly && design.flows.length > 1 && (
          <button
            className="icon-x"
            title="Remove flow"
            onClick={(e) => {
              e.stopPropagation()
              if (confirm(`Remove ${flow.name}?`)) change(removeFlow(design, flow.id))
            }}
          >
            ×
          </button>
        )}
      </header>
      <div className="flow-body">
        {flow.kind === 'flow' && (
          <div className="source-row">
            <div className="lane-label">Source</div>
            {flow.source ? (
              <NodeView node={flow.source} />
            ) : (
              <Slot containerKey={`${flow.id}:source`} index={0} empty label="Drop a source: HTTP Listener, Scheduler, …" />
            )}
          </div>
        )}
        <div className="lane-label">Process</div>
        <StepList containerKey={`${flow.id}:steps`} nodes={flow.steps} emptyLabel="Drop processors here" />
        {flow.kind === 'flow' && <ErrorSection containerKey={`${flow.id}:errorHandlers`} handlers={flow.errorHandlers} />}
      </div>
    </section>
  )
}

function ErrorSection({ containerKey, handlers }) {
  const { readOnly } = useContext(Ctx)
  if (readOnly && !handlers.length) return null
  return (
    <div className="error-section">
      <div className="lane-label error-label">Error handling</div>
      <StepList containerKey={containerKey} nodes={handlers} emptyLabel="Drop On Error Propagate / Continue" />
    </div>
  )
}

function StepList({ containerKey, nodes, emptyLabel }) {
  const { readOnly } = useContext(Ctx)
  if (!nodes.length) {
    return readOnly ? <div className="empty-lane muted small">(empty)</div> : <Slot containerKey={containerKey} index={0} empty label={emptyLabel} />
  }
  return (
    <div className="step-list">
      <Slot containerKey={containerKey} index={0} />
      {nodes.map((n, i) => (
        <Fragment key={n.id}>
          <NodeView node={n} />
          <Slot containerKey={containerKey} index={i + 1} />
        </Fragment>
      ))}
    </div>
  )
}

function Slot({ containerKey, index, empty = false, label }) {
  const { readOnly, canDrop, dropAt, payloadKind } = useContext(Ctx)
  const [over, setOver] = useState(false)
  if (readOnly) return empty ? null : <div className="slot-line" />
  const allowed = canDrop(containerKey)
  const cls = ['slot', empty && 'slot-empty', payloadKind && allowed && 'slot-active', over && allowed && 'slot-over']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={cls}
      onDragOver={(e) => {
        if (!allowed) return
        e.preventDefault()
        e.stopPropagation()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        setOver(false)
        dropAt(containerKey, index)
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (allowed) dropAt(containerKey, index)
      }}
    >
      {empty ? <span>{label}</span> : <span className="slot-plus">+</span>}
    </div>
  )
}

function NodeView({ node }) {
  const { readOnly, selectedId, select, setDrag, design, change, touch } = useContext(Ctx)
  const def = COMPONENTS[node.type]
  const summary = def.summary?.(node.config, node)

  const head = (
    <div
      className="node-head"
      onClick={(e) => {
        e.stopPropagation()
        select(node.id)
      }}
    >
      <span className="node-glyph">{def.glyph}</span>
      <span className="node-text">
        <span className="node-title">{def.label}</span>
        {summary && <span className="node-sub">{summary}</span>}
      </span>
    </div>
  )

  return (
    <div
      className={`node node-${def.kind} group-${def.group} ${selectedId === node.id ? 'selected' : ''}`}
      draggable={!readOnly && !touch}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.setData('text/plain', node.id)
        e.dataTransfer.effectAllowed = 'move'
        setDrag({ moveId: node.id })
      }}
      onDragEnd={() => setDrag(null)}
    >
      {head}
      {(def.kind === 'scope' || def.kind === 'handler') && (
        <div className="node-body">
          <StepList containerKey={`${node.id}:steps`} nodes={node.steps} emptyLabel="Drop steps inside" />
          {def.errorHandlers && <ErrorSection containerKey={`${node.id}:errorHandlers`} handlers={node.errorHandlers} />}
        </div>
      )}
      {def.kind === 'router' && (
        <div className="node-body">
          <div className="routes">
            {node.routes.map((r, i) => (
              <div key={r.id} className={`route ${selectedId === r.id ? 'selected' : ''}`}>
                <div
                  className="route-head"
                  onClick={(e) => {
                    e.stopPropagation()
                    select(r.id)
                  }}
                >
                  <span>
                    {def.routeLabel} {i + 1}
                    {(r.config.expression || r.config.name) && (
                      <span className="route-sub"> · {r.config.expression || r.config.name}</span>
                    )}
                  </span>
                  {!readOnly && node.routes.length > 1 && (
                    <button
                      className="icon-x"
                      title="Remove route"
                      onClick={(e) => {
                        e.stopPropagation()
                        change(removeRoute(design, r.id))
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <StepList containerKey={`${r.id}:steps`} nodes={r.steps} emptyLabel="Drop steps" />
              </div>
            ))}
            {def.otherwise && (
              <div className="route route-default">
                <div className="route-head">Default</div>
                <StepList containerKey={`${node.id}:otherwise`} nodes={node.otherwise} emptyLabel="Drop steps" />
              </div>
            )}
          </div>
          {!readOnly && (
            <button
              className="add-route"
              onClick={(e) => {
                e.stopPropagation()
                change(addRoute(design, node.id))
              }}
            >
              + {def.routeLabel}
            </button>
          )}
          {def.onComplete && (
            <div className="on-complete">
              <div className="route-head">On Complete</div>
              <StepList containerKey={`${node.id}:onComplete`} nodes={node.onComplete} emptyLabel="Drop steps" />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Properties ----------

function Properties({ selectedId, onDeselect }) {
  const { design, change, touch, placing, startMove } = useContext(Ctx)
  const found = selectedId ? findItem(design, selectedId) : null

  if (!found) {
    return (
      <aside className="properties">
        <div className="properties-empty muted small">
          {touch ? (
            <>
              <p>
                <strong>Build the flow:</strong> tap a component above, then tap a <span className="slot-plus inline">+</span>{' '}
                slot on the canvas.
              </p>
              <p>Tap any component to configure, move or delete it.</p>
            </>
          ) : (
            <>
              <p>
                <strong>Build the flow:</strong> drag components from the palette onto the canvas (or click a component,
                then click a <span className="slot-plus inline">+</span> slot).
              </p>
              <p>Select any component to configure it here. Delete removes it, Esc cancels placing.</p>
            </>
          )}
        </div>
      </aside>
    )
  }

  const { item, ctx } = found
  let title, fields, values
  if (ctx.isFlow) {
    title = item.kind === 'flow' ? 'Flow' : 'Sub-flow'
    fields = [{ key: 'name', label: 'Name', type: 'text' }]
    values = item
  } else if (ctx.isRoute) {
    const def = COMPONENTS[ctx.parent.type]
    title = `${def.label} · ${def.routeLabel}`
    fields = def.routeFields
    values = item.config
  } else {
    const def = COMPONENTS[item.type]
    title = def.label
    fields = def.fields
    values = item.config
  }

  const set = (key, value) => change(updateConfig(design, item.id, { [key]: value }))
  const flowNames = design.flows.map((f) => f.name)

  return (
    <aside className={`properties${placing ? '' : ' sheet-open'}`}>
      <button className="btn btn-ghost btn-sm properties-done" onClick={onDeselect}>
        Done
      </button>
      <div className="properties-title">{title}</div>
      {fields.length === 0 && <p className="muted small">No settings for this element.</p>}
      {fields.map((f) => (
        <label key={f.key} className="field">
          <span>{f.label}</span>
          {f.type === 'select' ? (
            <select className="input" value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea className="input mono" rows={8} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
          ) : (
            <input
              className={`input ${f.type === 'expression' ? 'mono' : ''}`}
              type={f.type === 'number' ? 'number' : 'text'}
              value={values[f.key] ?? ''}
              list={item.type === 'flow-ref' && f.key === 'name' ? 'flow-names' : undefined}
              onChange={(e) => set(f.key, f.type === 'number' ? Number(e.target.value) : e.target.value)}
            />
          )}
        </label>
      ))}
      <datalist id="flow-names">
        {flowNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {!ctx.isFlow && !ctx.isRoute && (
        <div className="properties-actions">
          {ctx.slot !== 'source' && (
            <>
              <button className="btn btn-ghost" onClick={() => change(shiftNode(design, item.id, -1))}>
                ↑ Up
              </button>
              <button className="btn btn-ghost" onClick={() => change(shiftNode(design, item.id, 1))}>
                ↓ Down
              </button>
              <button className="btn btn-ghost" onClick={() => startMove(item.id)}>
                Move…
              </button>
            </>
          )}
          <button
            className="btn btn-ghost danger"
            onClick={() => {
              change(removeNode(design, item.id))
              onDeselect()
            }}
          >
            Delete
          </button>
        </div>
      )}
    </aside>
  )
}
