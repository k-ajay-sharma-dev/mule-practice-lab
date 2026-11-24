import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LANES, NODE_TYPES } from '../../arch/catalog.js'
import { addEdge, addNode, duplicateNode, removeEdge, removeNode, setNodeSetting, shiftNode, updateEdge, updateNode } from '../../arch/model.js'
import { gutterFor, roundedPath, routeEdges } from '../../arch/route.js'
import { configOf, settingsBadge, settingsOf } from '../../arch/settings.js'
import ArchIcon from './ArchIcon.jsx'
import { useCoarsePointer, useRevealWhenStacked } from '../touch.js'

const PALETTE = LANES.map((lane) => ({
  ...lane,
  types: Object.entries(NODE_TYPES)
    .filter(([, t]) => t.lane === lane.key)
    .map(([type, t]) => ({ type, ...t })),
}))

const laneOf = (node) => NODE_TYPES[node.type]?.lane ?? 'backends'

// A line the router found no way for (two boxes drawn on top of each other while the page resizes).
const directPath = (s, t) => `M${s.x + s.w / 2},${s.y + s.h / 2} L${t.x + t.w / 2},${t.y + t.h / 2}`

const sameBoxes = (a, b) => {
  const keys = Object.keys(b)
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] && ['x', 'y', 'w', 'h'].every((p) => Math.abs(a[k][p] - b[k][p]) < 0.5))
}

// overlay: optional { [nodeId]: { text, level: 'ok' | 'warn' | 'bad' } } from a test run, shown on each box
// flags: optional { [nodeId]: [labels of failed checks about it] }, outlined on the canvas (Find it)
export default function ArchDesigner({ diagram, onChange, readOnly = false, history = null, overlay = null, flags = null }) {
  const [selected, setSelected] = useState(null) // { kind: 'node' | 'edge', id }
  const [connectFrom, setConnectFrom] = useState(null)
  const [newKind, setNewKind] = useState('sync')
  const [drag, setDrag] = useState(null) // { from, x, y } while dragging a connection handle
  const [boxes, setBoxes] = useState({})
  const [area, setArea] = useState(null) // the part of the lanes that lines may use, and their full size
  const arrowId = useId()
  const [query, setQuery] = useState('')
  const lanesRef = useRef(null)
  const rootRef = useRef(null)
  const touch = useCoarsePointer()

  useRevealWhenStacked(rootRef, '.arch-node.selected', selected?.kind === 'node' ? selected.id : null)
  useRevealWhenStacked(rootRef, '.arch-canvas', connectFrom, 'start')

  const change = (next) => onChange?.(next)
  const nodeById = useMemo(() => new Map(diagram.nodes.map((n) => [n.id, n])), [diagram.nodes])
  const selNode = selected?.kind === 'node' ? nodeById.get(selected.id) : null
  const selEdge = selected?.kind === 'edge' ? diagram.edges.find((e) => e.id === selected.id) : null

  // Measure node boxes relative to the lanes container so edges can be drawn over them.
  const measure = useCallback(() => {
    const root = lanesRef.current
    if (!root) return
    const base = root.getBoundingClientRect()
    const next = {}
    root.querySelectorAll('[data-node-id]').forEach((el) => {
      const r = el.getBoundingClientRect()
      next[el.dataset.nodeId] = { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }
    })
    setBoxes((old) => (sameBoxes(old, next) ? old : next))
    // lines stay beside the lane names, except on a phone, where the names are above the boxes
    const label = root.querySelector('.arch-lane-label')?.getBoundingClientRect()
    const lane = root.querySelector('.arch-lane')?.getBoundingClientRect()
    const beside = label && lane && label.width < lane.width / 2
    const size = { x0: beside ? label.right - base.left : 0, x1: base.width, y0: 0, y1: base.height }
    setArea((old) => (old && sameBoxes({ a: { x: old.x0, y: old.y0, w: old.x1, h: old.y1 } }, { a: { x: size.x0, y: size.y0, w: size.x1, h: size.y1 } }) ? old : size))
  }, [])

  useLayoutEffect(measure, [diagram, measure])
  useEffect(() => {
    const root = lanesRef.current
    if (!root) return
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [measure])

  function add(type) {
    const { diagram: next, id } = addNode(diagram, type)
    change(next)
    setSelected({ kind: 'node', id })
  }

  function connect(from, to, kind = newKind) {
    if (!from || !to || from === to) return
    change(addEdge(diagram, from, to, kind))
  }

  function clickNode(id) {
    if (readOnly) return
    if (connectFrom) {
      connect(connectFrom, id)
      setConnectFrom(null)
      setSelected({ kind: 'node', id: connectFrom })
      return
    }
    setSelected({ kind: 'node', id })
  }

  function deleteSelected() {
    if (selNode) change(removeNode(diagram, selNode.id))
    if (selEdge) change(removeEdge(diagram, selEdge.id))
    if (history && (selNode || selEdge)) setRemoved(selNode ? selNode.label || 'the component' : 'the connection')
    setSelected(null)
  }
  // the Undo bar after a delete, for a few seconds
  const [removed, setRemoved] = useState(null)
  useEffect(() => {
    if (!removed) return
    const t = setTimeout(() => setRemoved(null), 6000)
    return () => clearTimeout(t)
  }, [removed])

  // Ctrl+Z and Ctrl+Y anywhere on the page, unless the cursor is in something that takes text
  const keys = useRef(null)
  keys.current = (e) => {
    if (!history || !(e.ctrlKey || e.metaKey)) return
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || rootRef.current?.closest('.read-only-lock.locked')) return
    const key = e.key.toLowerCase()
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault()
      history.undo()
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault()
      history.redo()
    }
  }
  useEffect(() => {
    if (readOnly) return undefined
    const listener = (e) => keys.current(e)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [readOnly])

  function duplicateSelected() {
    if (!selNode) return
    const copy = duplicateNode(diagram, selNode.id)
    change(copy.diagram)
    setSelected({ kind: 'node', id: copy.id })
  }

  function onKeyDown(e) {
    if (readOnly || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      duplicateSelected()
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault()
      deleteSelected()
    }
    if (e.key === 'Escape') setConnectFrom(null)
  }

  // Drag from a node's handle onto another node to connect them.
  function startDrag(e, from) {
    e.preventDefault()
    e.stopPropagation()
    const base = lanesRef.current.getBoundingClientRect()
    setDrag({ from, x: e.clientX - base.left, y: e.clientY - base.top })
    const move = (ev) => setDrag((d) => d && { ...d, x: ev.clientX - base.left, y: ev.clientY - base.top })
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', stop)
      setDrag(null)
    }
    const up = (ev) => {
      stop()
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-node-id]')
      // connect through state so the edge is added to the latest diagram, not this closure's copy
      if (target && target.dataset.nodeId !== from) {
        setPendingConnect({ from, to: target.dataset.nodeId })
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    // a phone can take the gesture back, and then pointerup never arrives
    window.addEventListener('pointercancel', stop)
  }
  const [pendingConnect, setPendingConnect] = useState(null)
  useEffect(() => {
    if (!pendingConnect) return
    connect(pendingConnect.from, pendingConnect.to)
    setPendingConnect(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingConnect])

  const lanes = LANES.map((lane) => ({ ...lane, nodes: diagram.nodes.filter((n) => laneOf(n) === lane.key) })).filter(
    (lane) => !readOnly || lane.nodes.length,
  )
  const q = query.trim().toLowerCase()
  const routes = useMemo(() => {
    // the boxes are measured after the diagram changes, so for a moment one of them can be a box that is gone
    const known = Object.fromEntries(diagram.nodes.filter((n) => boxes[n.id]).map((n) => [n.id, boxes[n.id]]))
    return area ? routeEdges(known, diagram.edges, area) : {}
  }, [boxes, area, diagram])
  const gutter = gutterFor(diagram.edges.length)
  // connecting needs the diagram, so the phone's properties sheet steps aside for it
  const sheetOpen = Boolean(selNode || selEdge) && !connectFrom

  return (
    <div
      className={`designer arch${selNode || selEdge ? ' has-selection' : ''}${readOnly ? ' read-only' : ''}${sheetOpen ? ' sheet-active' : ''}`}
      ref={rootRef}
      tabIndex={readOnly ? -1 : 0}
      onKeyDown={onKeyDown}
    >
      {!readOnly && (
        <div className="designer-toolbar">
          <span className="arch-count small muted">
            <b>{diagram.nodes.length}</b> {diagram.nodes.length === 1 ? 'component' : 'components'} <b>{diagram.edges.length}</b>{' '}
            {diagram.edges.length === 1 ? 'connection' : 'connections'}
          </span>
          <div className="toolbar-actions">
            <span className="arch-legend small muted">
              <span className="legend-sync" /> sync call <span className="legend-async" /> async message
            </span>
            {history && (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)">
                    Undo
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Y)">
                    Redo
                  </button>
                </>
              )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (diagram.nodes.length && confirm('Clear the whole diagram?')) {
                  change({ nodes: [], edges: [] })
                  setSelected(null)
                }
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {removed && history?.canUndo && (
        <div className="designer-notice undo-bar small" role="status">
          <span>Deleted {removed}</span>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              history.undo()
              setRemoved(null)
            }}
          >
            Undo
          </button>
        </div>
      )}

      <div className="designer-body">
        {!readOnly && (
          <aside className="palette">
            <input
              className="input palette-search"
              type="search"
              placeholder="Search components…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="palette-groups">
              {PALETTE.map((lane) => {
                const items = lane.types.filter((t) => !q || t.label.toLowerCase().includes(q))
                if (!items.length) return null
                return (
                  <div key={lane.key} className="palette-group">
                    <div className="palette-group-title">{lane.label}</div>
                    {items.map((t) => (
                      <button
                        key={t.type}
                        className={`palette-item arch-lane-${lane.key}`}
                        draggable={!touch}
                        onDragStart={(e) => e.dataTransfer.setData('text/arch-type', t.type)}
                        onClick={() => add(t.type)}
                        title="Click or drag to add"
                      >
                        <ArchIcon type={t.type} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </aside>
        )}

        <div
          className="arch-canvas"
          onClick={(e) => {
            if (!readOnly && e.target === e.currentTarget) setSelected(null)
          }}
          onDragOver={(e) => !readOnly && e.preventDefault()}
          onDrop={(e) => {
            const type = e.dataTransfer.getData('text/arch-type')
            if (type) add(type)
          }}
        >
          {connectFrom && (
            <div className="arch-connect-banner">
              Tap the component that <b>{nodeById.get(connectFrom)?.label}</b> calls ·{' '}
              <button className="btn btn-ghost btn-sm" onClick={() => setConnectFrom(null)}>
                Cancel
              </button>
            </div>
          )}
          <div className={`arch-lanes${gutter > 48 ? ' crowded' : ''}${diagram.nodes.length ? '' : ' blank'}`} ref={lanesRef} style={{ '--gutter': `${gutter}px` }}>
            <svg className="arch-edges" width={area?.x1 ?? 0} height={area?.y1 ?? 0}>
              <defs>
                {['sync', 'async', 'active-sync', 'active-async'].map((k) => (
                  <marker key={k} id={`${arrowId}${k}`} viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto">
                    <path d="M0.5,0.8 L9.5,5 L0.5,9.2 L2.6,5 z" className={`arrow-${k}`} />
                  </marker>
                ))}
              </defs>
              {diagram.edges.map((e) => {
                const s = boxes[e.from]
                const t = boxes[e.to]
                if (!s || !t) return null
                const d = routes[e.id] ? roundedPath(routes[e.id]) : directPath(s, t)
                const active = selEdge?.id === e.id || selNode?.id === e.from || selNode?.id === e.to
                return (
                  <g key={e.id} className={`arch-edge ${e.kind}${active ? ' active' : ''}`}>
                    <path d={d} className="edge-line" markerEnd={`url(#${arrowId}${active ? 'active-' : ''}${e.kind})`} />
                    {!readOnly && (
                      <path
                        d={d}
                        className="edge-hit"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setSelected({ kind: 'edge', id: e.id })
                        }}
                      />
                    )}
                  </g>
                )
              })}
              {drag && boxes[drag.from] && (
                <line
                  className="arch-drag-line"
                  x1={boxes[drag.from].x + boxes[drag.from].w / 2}
                  y1={boxes[drag.from].y + boxes[drag.from].h / 2}
                  x2={drag.x}
                  y2={drag.y}
                />
              )}
            </svg>

            {lanes.map((lane) => (
              <div key={lane.key} className={`arch-lane arch-lane-${lane.key}${lane.nodes.length ? '' : ' empty'}`}>
                <div className="arch-lane-label">
                  <span>{lane.label}</span>
                </div>
                <div className="arch-lane-nodes">
                  {lane.nodes.map((n) => {
                    const t = NODE_TYPES[n.type]
                    const isSel = selNode?.id === n.id
                    const badge = settingsBadge(n)
                    const mark = overlay?.[n.id]
                    return (
                      <div
                        key={n.id}
                        data-node-id={n.id}
                        className={`arch-node${isSel ? ' selected' : ''}${connectFrom && connectFrom !== n.id ? ' connect-target' : ''}${mark ? ` run-${mark.level}` : ''}${flags?.[n.id] ? ' node-flagged' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          clickNode(n.id)
                        }}
                        title={t?.label}
                      >
                        <ArchIcon type={n.type} />
                        <span className="arch-node-text">
                          <span className="arch-node-label">{n.label}</span>
                          {n.label !== t?.label && <span className="arch-node-type">{t?.label}</span>}
                          {badge && <span className="arch-node-settings">{badge}</span>}
                          {mark && <span className={`arch-node-run ${mark.level}`}>{mark.text}</span>}
                        </span>
                        {!readOnly && (
                          <span
                            className="arch-handle"
                            title="Drag onto another component to connect"
                            onPointerDown={(e) => startDrag(e, n.id)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          {!readOnly && !diagram.nodes.length && (
            <div className="arch-empty muted small">
              Add components from the palette. Each one drops into its lane. Then connect them:{' '}
              {touch ? (
                <>
                  tap a component and use <b>Connect by tapping</b>.
                </>
              ) : (
                <>
                  drag the dot on a component's right edge onto another, or select it and use <b>Calls / sends to</b>.
                </>
              )}
            </div>
          )}
        </div>

        {!readOnly && (
          <aside className={`properties${sheetOpen ? ' sheet-open' : ''}`}>
            {sheetOpen && (
              <button className="btn btn-ghost btn-sm properties-done" onClick={() => setSelected(null)}>
                Done
              </button>
            )}
            {selNode && (
              <NodeProps
                node={selNode}
                diagram={diagram}
                nodeById={nodeById}
                newKind={newKind}
                setNewKind={setNewKind}
                onLabel={(label) => change(updateNode(diagram, selNode.id, { label }))}
                onSetting={(field, value) => change(setNodeSetting(diagram, selNode.id, field.key, value, field.default))}
                onConnect={(to) => connect(selNode.id, to)}
                onStartConnect={() => setConnectFrom(selNode.id)}
                onEdgeKind={(id, kind) => change(updateEdge(diagram, id, { kind }))}
                onEdgeRemove={(id) => {
                change(removeEdge(diagram, id))
                if (history) setRemoved('the connection')
              }}
                onShift={(dir) => change(shiftNode(diagram, selNode.id, dir))}
                onDelete={deleteSelected}
                onDuplicate={duplicateSelected}
              />
            )}
            {selEdge && (
              <div className="props">
                <div className="props-title">Connection</div>
                <p className="props-route">
                  <b>{nodeById.get(selEdge.from)?.label}</b>
                  <span className={`legend-${selEdge.kind}`} />
                  <b>{nodeById.get(selEdge.to)?.label}</b>
                </p>
                <KindToggle value={selEdge.kind} onChange={(kind) => change(updateEdge(diagram, selEdge.id, { kind }))} />
                <div className="props-actions">
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      change(updateEdge(diagram, selEdge.id, { from: selEdge.to, to: selEdge.from }))
                    }
                  >
                    Reverse
                  </button>
                  <button className="btn btn-ghost btn-sm danger" onClick={deleteSelected}>
                    Delete
                  </button>
                </div>
              </div>
            )}
            {!selNode && !selEdge && (
              <div className="props muted small">
                <div className="props-title">Properties</div>
                <p>Select a component to rename it and connect it to others, or select a connection to change it.</p>
                <p>
                  A <b>sync call</b> is a request/response (HTTP). An <b>async message</b> goes through a queue, topic or
                  event stream.
                </p>
                {!touch && <p>Keys: Delete removes the selection · Esc cancels connecting.</p>}
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

// How the box is deployed, protected or kept, for the Run tab's simulation (see arch/settings.js).
function NodeSettings({ node, onSetting }) {
  const fields = settingsOf(node.type)
  if (!fields.length) return null
  const config = configOf(node)
  return (
    <details className="props-settings" open={Boolean(node.config)}>
      <summary className="props-subtitle">Settings</summary>
      {fields.map((f) => (
        <label key={f.key} className="field small">
          {f.label}
          {f.type === 'select' ? (
            <select className="input" value={String(config[f.key])} onChange={(e) => onSetting(f, e.target.value)}>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="input"
              type="number"
              min="0"
              value={config[f.key]}
              onChange={(e) => onSetting(f, e.target.value === '' ? undefined : Number(e.target.value))}
            />
          )}
          {f.help && <span className="muted small field-help">{f.help}</span>}
        </label>
      ))}
    </details>
  )
}

function KindToggle({ value, onChange }) {
  return (
    <div className="seg">
      {['sync', 'async'].map((k) => (
        <button key={k} className={`seg-btn${value === k ? ' active' : ''}`} onClick={() => onChange(k)}>
          {k === 'sync' ? 'Sync call' : 'Async message'}
        </button>
      ))}
    </div>
  )
}

function NodeProps({ onSetting, onDuplicate, node, diagram, nodeById, newKind, setNewKind, onLabel, onConnect, onStartConnect, onEdgeKind, onEdgeRemove, onShift, onDelete }) {
  const [target, setTarget] = useState('')
  const out = diagram.edges.filter((e) => e.from === node.id)
  const inc = diagram.edges.filter((e) => e.to === node.id)
  const others = diagram.nodes.filter((n) => n.id !== node.id && !out.some((e) => e.to === n.id))
  const type = NODE_TYPES[node.type]

  return (
    <div className="props">
      <div className={`props-head arch-lane-${laneOf(node)}`}>
        <ArchIcon type={node.type} />
        <div>
          <div className="props-title">{type?.label}</div>
          <div className="props-lane">{LANES.find((l) => l.key === laneOf(node))?.label}</div>
        </div>
      </div>
      <label className="field">
        Name
        <input className="input" value={node.label} onChange={(e) => onLabel(e.target.value)} placeholder={type?.label} />
      </label>
      {type?.api && <p className="muted small">Tip: name APIs by layer, e.g. exp-mobile-api, prc-order-api, sys-sap-api.</p>}
      <NodeSettings node={node} onSetting={onSetting} />

      <div className="props-subtitle">Calls / sends to</div>
      <KindToggle value={newKind} onChange={setNewKind} />
      <div className="props-connect">
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose…</option>
          {others.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-sm"
          disabled={!target}
          onClick={() => {
            onConnect(target)
            setTarget('')
          }}
        >
          Add
        </button>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onStartConnect}>
        Connect by tapping…
      </button>

      {(out.length > 0 || inc.length > 0) && (
        <ul className="props-edges">
          {out.map((e) => (
            <li key={e.id}>
              <span className="edge-to">{nodeById.get(e.to)?.label}</span>
              <select className="input" value={e.kind} onChange={(ev) => onEdgeKind(e.id, ev.target.value)}>
                <option value="sync">sync</option>
                <option value="async">async</option>
              </select>
              <button className="icon-btn" onClick={() => onEdgeRemove(e.id)} title="Remove connection">
                ×
              </button>
            </li>
          ))}
          {inc.map((e) => (
            <li key={e.id} className="muted">
              <span className="edge-from">{nodeById.get(e.from)?.label}</span>
              <span className="small">{e.kind}</span>
              <button className="icon-btn" onClick={() => onEdgeRemove(e.id)} title="Remove connection">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="props-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => onShift(-1)} title="Move left in its lane">
          ←
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => onShift(1)} title="Move right in its lane">
          →
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDuplicate} title="Duplicate (Ctrl+D)">
          Duplicate
        </button>
        <button className="btn btn-ghost btn-sm danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
