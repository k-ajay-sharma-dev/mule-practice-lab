import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LANES, NODE_TYPES } from '../../arch/catalog.js'
import { addEdge, addNode, removeEdge, removeNode, shiftNode, updateEdge, updateNode } from '../../arch/model.js'
import { useCoarsePointer, useRevealWhenStacked } from '../touch.js'

const PALETTE = LANES.map((lane) => ({
  ...lane,
  types: Object.entries(NODE_TYPES)
    .filter(([, t]) => t.lane === lane.key)
    .map(([type, t]) => ({ type, ...t })),
}))

const laneOf = (node) => NODE_TYPES[node.type]?.lane ?? 'backends'

// Curve between two node boxes: vertical when the nodes sit in different lanes, sideways within a lane.
function edgePath(s, t) {
  const dy = t.y + t.h / 2 - (s.y + s.h / 2)
  if (Math.abs(dy) < Math.min(s.h, t.h) / 2) {
    const right = t.x > s.x
    const x1 = right ? s.x + s.w : s.x
    const x2 = right ? t.x : t.x + t.w
    const y1 = s.y + s.h / 2
    const y2 = t.y + t.h / 2
    const c = Math.max(30, Math.abs(x2 - x1) / 2) * (right ? 1 : -1)
    return `M${x1},${y1} C${x1 + c},${y1 - 26} ${x2 - c},${y2 - 26} ${x2},${y2}`
  }
  const down = dy > 0
  const x1 = s.x + s.w / 2
  const y1 = down ? s.y + s.h : s.y
  const x2 = t.x + t.w / 2
  const y2 = down ? t.y : t.y + t.h
  const c = Math.max(24, Math.abs(y2 - y1) / 2) * (down ? 1 : -1)
  return `M${x1},${y1} C${x1},${y1 + c} ${x2},${y2 - c} ${x2},${y2}`
}

export default function ArchDesigner({ diagram, onChange, readOnly = false }) {
  const [selected, setSelected] = useState(null) // { kind: 'node' | 'edge', id }
  const [connectFrom, setConnectFrom] = useState(null)
  const [newKind, setNewKind] = useState('sync')
  const [drag, setDrag] = useState(null) // { from, x, y } while dragging a connection handle
  const [boxes, setBoxes] = useState({})
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
    setBoxes(next)
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
    setSelected(null)
  }

  function onKeyDown(e) {
    if (readOnly || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
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
  const lanesSize = lanesRef.current ? { w: lanesRef.current.scrollWidth, h: lanesRef.current.scrollHeight } : { w: 0, h: 0 }
  // connecting needs the diagram, so the phone's properties sheet steps aside for it
  const sheetOpen = Boolean(selNode || selEdge) && !connectFrom

  return (
    <div
      className={`designer arch${readOnly ? ' read-only' : ''}${sheetOpen ? ' sheet-active' : ''}`}
      ref={rootRef}
      tabIndex={readOnly ? -1 : 0}
      onKeyDown={onKeyDown}
    >
      {!readOnly && (
        <div className="designer-toolbar">
          <span className="mono small muted">
            {diagram.nodes.length} components · {diagram.edges.length} connections
          </span>
          <div className="toolbar-actions">
            <span className="arch-legend small muted">
              <span className="legend-sync" /> sync call <span className="legend-async" /> async message
            </span>
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
                        <span className="arch-glyph">{t.glyph}</span>
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
          <div className="arch-lanes" ref={lanesRef}>
            <svg className="arch-edges" width={lanesSize.w} height={lanesSize.h}>
              <defs>
                <marker id="arch-arrow-sync" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="arrow-sync" />
                </marker>
                <marker id="arch-arrow-async" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" className="arrow-async" />
                </marker>
              </defs>
              {diagram.edges.map((e) => {
                const s = boxes[e.from]
                const t = boxes[e.to]
                if (!s || !t) return null
                const d = edgePath(s, t)
                const active = selEdge?.id === e.id || selNode?.id === e.from || selNode?.id === e.to
                return (
                  <g key={e.id} className={`arch-edge ${e.kind}${active ? ' active' : ''}`}>
                    <path d={d} className="edge-line" markerEnd={`url(#arch-arrow-${e.kind})`} />
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
              <div key={lane.key} className={`arch-lane arch-lane-${lane.key}`}>
                <div className="arch-lane-label">{lane.label}</div>
                <div className="arch-lane-nodes">
                  {lane.nodes.map((n) => {
                    const t = NODE_TYPES[n.type]
                    const isSel = selNode?.id === n.id
                    return (
                      <div
                        key={n.id}
                        data-node-id={n.id}
                        className={`arch-node${isSel ? ' selected' : ''}${connectFrom && connectFrom !== n.id ? ' connect-target' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          clickNode(n.id)
                        }}
                        title={t?.label}
                      >
                        <span className="arch-glyph">{t?.glyph ?? '?'}</span>
                        <span className="arch-node-text">
                          <span className="arch-node-label">{n.label}</span>
                          {n.label !== t?.label && <span className="arch-node-type">{t?.label}</span>}
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
                  {!readOnly && !lane.nodes.length && <span className="arch-lane-empty">—</span>}
                </div>
              </div>
            ))}
          </div>
          {!readOnly && !diagram.nodes.length && (
            <div className="arch-empty muted small">
              Add components from the palette — each one drops into its lane. Then connect them:{' '}
              {touch ? (
                <>
                  tap a component and use <b>Connect by tapping</b>.
                </>
              ) : (
                <>
                  drag a component's dot onto another, or select it and use <b>Connect</b>.
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
                onConnect={(to) => connect(selNode.id, to)}
                onStartConnect={() => setConnectFrom(selNode.id)}
                onEdgeKind={(id, kind) => change(updateEdge(diagram, id, { kind }))}
                onEdgeRemove={(id) => change(removeEdge(diagram, id))}
                onShift={(dir) => change(shiftNode(diagram, selNode.id, dir))}
                onDelete={deleteSelected}
              />
            )}
            {selEdge && (
              <div className="props">
                <div className="props-title">Connection</div>
                <p className="small">
                  <b>{nodeById.get(selEdge.from)?.label}</b> → <b>{nodeById.get(selEdge.to)?.label}</b>
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

function NodeProps({ node, diagram, nodeById, newKind, setNewKind, onLabel, onConnect, onStartConnect, onEdgeKind, onEdgeRemove, onShift, onDelete }) {
  const [target, setTarget] = useState('')
  const out = diagram.edges.filter((e) => e.from === node.id)
  const inc = diagram.edges.filter((e) => e.to === node.id)
  const others = diagram.nodes.filter((n) => n.id !== node.id && !out.some((e) => e.to === n.id))
  const type = NODE_TYPES[node.type]

  return (
    <div className="props">
      <div className="props-title">{type?.label}</div>
      <label className="field">
        Name
        <input className="input" value={node.label} onChange={(e) => onLabel(e.target.value)} placeholder={type?.label} />
      </label>
      {type?.api && <p className="muted small">Tip: name APIs by layer, e.g. exp-mobile-api, prc-order-api, sys-sap-api.</p>}

      <div className="props-subtitle">Calls / sends to</div>
      <KindToggle value={newKind} onChange={setNewKind} />
      <div className="props-connect">
        <select className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Choose a component…</option>
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
              <span>→ {nodeById.get(e.to)?.label}</span>
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
              <span>← {nodeById.get(e.from)?.label}</span>
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
        <button className="btn btn-ghost btn-sm danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}
