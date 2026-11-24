import { Fragment, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CodeEditor from '../CodeEditor.jsx'
import { clampZoom, Icon, PanelToggles, useNarrow, usePanels, ZoomBar } from '../designer/parts.jsx'
import { useCoarsePointer, useRevealWhenStacked } from '../touch.js'
import { COMPONENTS, GROUPS } from '../../flow/catalog.js'
import { Ctx } from './context.js'
import FlowIcon from './FlowIcon.jsx'
import Properties, { ConfigView, ReadOnlyProperties } from './FlowProperties.jsx'
import { fromXml, looksLikeMuleXml } from '../../flow/import.js'
import {
  acceptsKind,
  addFlow,
  addRoute,
  countComponents,
  createNode,
  duplicateNode,
  emptyDesign,
  findItem,
  insertNode,
  moveNode,
  removeFlow,
  removeNode,
  removeRoute,
} from '../../flow/model.js'
import { toXml } from '../../flow/xml.js'

// Fit shows the whole design, down to a size that is still readable.
const FIT_MIN = 0.6
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Visual Mule flow editor. Design only: nothing here is executed.
// Props: design, onChange(design), readOnly, history (undo and redo from useUndo),
// settingsAside (read-only: show a component's settings in a side panel, as the editable designer does, instead of
// under the component), toolbarEnd (buttons at the end of the toolbar, such as full screen)
// flags: { nodeId: [labels of failed checks about it] }; runMarks: { nodeId: { fail, text } } from the test run picked
export default function FlowDesigner({ design, onChange, readOnly = false, history = null, settingsAside = false, toolbarEnd = null, flags = null, runMarks = null }) {
  const aside = readOnly && settingsAside
  const [selectedId, setSelectedId] = useState(null)
  const [armed, setArmed] = useState(null) // component type picked from the palette (tap-to-place)
  const [moving, setMoving] = useState(null) // id of a node being moved by tapping a slot
  const [drag, setDrag] = useState(null) // { type } from palette or { moveId } from canvas
  const [view, setView] = useState('design')
  const [pasted, setPasted] = useState('')
  const [notice, setNotice] = useState(null) // { text, warn } after importing XML
  const [pasteError, setPasteError] = useState(null)
  const [removed, setRemoved] = useState(null) // what was just deleted, for the Undo bar
  const root = useRef(null)
  const touch = useCoarsePointer()
  // beside its XML or the reference the canvas is narrow, so there the panels start hidden
  const narrow = useNarrow(root, 700)
  const besidePanels = usePanels('pl.flowNarrowPanels', false)
  const mainPanels = usePanels('pl.flowPanels')
  const { panels, toggle, className: panelClass } = view === 'split' || narrow ? besidePanels : mainPanels
  const [zoom, setZoom] = useState(1)
  const [scale, setScale] = useState(1)
  const canvasRef = useRef(null)
  const sheetRef = useRef(null)
  const zooms = !readOnly || aside

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

  // every delete goes through here, so the Undo bar can offer it back for a few seconds
  function remove(next, what) {
    onChange(next)
    if (history) setRemoved({ what, at: Date.now() })
  }
  useEffect(() => {
    if (!removed) return
    const t = setTimeout(() => setRemoved(null), 6000)
    return () => clearTimeout(t)
  }, [removed])

  const ctx = useMemo(
    () => ({
      design,
      readOnly,
      inlineSettings: readOnly && !aside,
      selectedId,
      // read-only: clicking opens the settings under the component, and clicking again closes them
      select: (id) => setSelectedId((current) => (readOnly && !aside && current === id ? null : id)),
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
      remove,
      flags,
      runMarks,
      movingId: payload?.moveId ?? null,
      touch,
      placing,
      startMove: (id) => {
        setArmed(null)
        setMoving(id)
      },
      duplicate(id) {
        const copy = duplicateNode(design, id)
        if (!copy.id) return
        onChange(copy.design)
        setSelectedId(copy.id)
      },
    }),
    [design, readOnly, aside, selectedId, payload, payloadKind, onChange, touch, placing, flags, runMarks, history],
  )

  // Scales the design. Fit tries smaller and smaller until all of it shows.
  const applyZoom = useRef(null)
  applyZoom.current = () => {
    const canvas = canvasRef.current
    const sheet = sheetRef.current
    if (!zooms || !canvas || !sheet || !canvas.clientWidth) return
    const at = (k) => {
      sheet.style.zoom = k === 1 ? '' : String(k)
    }
    let k = zoom
    if (zoom === 'fit') {
      for (k = 1; ; k = Math.round((k - 0.05) * 100) / 100) {
        at(touch ? 1 : k)
        if (touch || k <= FIT_MIN || (canvas.scrollHeight <= canvas.clientHeight + 1 && canvas.scrollWidth <= canvas.clientWidth + 1)) break
      }
    }
    at(k)
    setScale(k)
  }
  useLayoutEffect(() => applyZoom.current(), [zoom, design, view, touch, panelClass])
  useEffect(() => {
    if (!zooms || !canvasRef.current) return undefined
    const ro = new ResizeObserver(() => applyZoom.current())
    ro.observe(canvasRef.current)
    return () => ro.disconnect()
  }, [zooms, view])

  // Ctrl and the mouse wheel zoom the design instead of the page
  useEffect(() => {
    const canvas = canvasRef.current
    if (!zooms || !canvas) return undefined
    const onWheel = (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      setZoom(clampZoom(scale + (e.deltaY < 0 ? 0.1 : -0.1)))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [zooms, scale, view])

  function importXml(text) {
    let result
    try {
      result = fromXml(text)
    } catch (error) {
      setPasted(text)
      setPasteError(error.message)
      setView('paste')
      return
    }
    if (countComponents(design) && !confirm('Replace your current design with this XML?')) return
    onChange(result.design)
    setSelectedId(null)
    cancelPlacing()
    setPasted('')
    setPasteError(null)
    setView('design')
    const left = result.skipped.map((s) => `${s.name}${s.count > 1 ? ` (${s.count})` : ''}`).join(', ')
    setNotice({
      text: `Imported ${plural(result.flows, 'flow')} and ${plural(result.components, 'component')}.${left ? ` Left out: ${left}.` : ''}`,
      warn: Boolean(left),
    })
  }

  // Ctrl+V anywhere on the page, unless the cursor is in something that takes text
  const onPaste = useRef(null)
  onPaste.current = (e) => {
    const typing = e.target.closest?.('input, textarea, select, [contenteditable]')
    const text = e.clipboardData?.getData('text') ?? ''
    if (typing || root.current?.closest('.read-only-lock.locked') || !looksLikeMuleXml(text)) return
    e.preventDefault()
    importXml(text)
  }
  useEffect(() => {
    if (readOnly) return
    const listener = (e) => onPaste.current(e)
    document.addEventListener('paste', listener)
    return () => document.removeEventListener('paste', listener)
  }, [readOnly])

  // Ctrl+Z and Ctrl+Y anywhere on the page, unless the cursor is in something that takes text
  const keys = useRef(null)
  keys.current = (e) => {
    if (!history || !(e.ctrlKey || e.metaKey)) return
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || root.current?.closest('.read-only-lock.locked')) return
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

  function duplicate(id) {
    const copy = duplicateNode(design, id)
    if (!copy.id) return
    onChange(copy.design)
    setSelectedId(copy.id)
  }

  function onKeyDown(e) {
    if (readOnly) return
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && !typing && selectedId) {
      e.preventDefault()
      duplicate(selectedId)
    }
    if (e.key === 'Escape') {
      cancelPlacing()
      setSelectedId(null)
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && selectedId) {
      const found = findItem(design, selectedId)
      if (found && !found.ctx.isFlow && !found.ctx.isRoute) {
        remove(removeNode(design, selectedId), COMPONENTS[found.item.type]?.label)
        setSelectedId(null)
      }
    }
  }

  const body = (
    <div className={`designer-body${readOnly ? '' : panelClass}`}>
      {!readOnly && <Palette armed={armed} setArmed={setArmed} />}
      <div className="canvas-stage">
      <div className="canvas" ref={canvasRef} onClick={() => setSelectedId(null)}>
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
        <div className="flow-sheet" ref={sheetRef}>
          {design.flows.map((f) => (
            <FlowView key={f.id} flow={f} />
          ))}
        </div>
      </div>
      {zooms && <ZoomBar zoom={zoom} scale={scale} setZoom={setZoom} fitTitle="Shrink the design until all of it shows" />}
      </div>
    {!readOnly && <Properties selectedId={selectedId} onDeselect={() => setSelectedId(null)} />}

    {aside && <ReadOnlyProperties selectedId={selectedId} onDeselect={() => setSelectedId(null)} />}
    </div>
  )
  return (
    <Ctx.Provider value={ctx}>
      <div
        ref={root}
        className={`designer ${readOnly ? 'read-only' : ''}${aside ? ' settings-aside' : ''}${selectedId && !placing && (!readOnly || aside) ? ' sheet-active' : ''}`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="designer-toolbar">
          <div className="seg">
            <button className={view === 'design' ? 'active' : ''} onClick={() => setView('design')}>
              <span className="seg-long">Message Flow</span>
              <span className="seg-short">Flow</span>
            </button>
            <button className={view === 'xml' ? 'active' : ''} onClick={() => setView('xml')}>
              <span className="seg-long">Configuration XML</span>
              <span className="seg-short">XML</span>
            </button>
            <button className={view === 'split' ? 'active' : ''} onClick={() => setView('split')} title="The canvas and its XML side by side: change either one">
              Split
            </button>
          </div>
          {readOnly && view !== 'xml' && view !== 'paste' && <span className="muted small">Click a component to see its settings</span>}
          {!readOnly && (view === 'design' || view === 'split') && (
            <div className="toolbar-actions">
              {history && (
                <>
                  <button className="btn btn-ghost btn-sm tb-icon" onClick={history.undo} disabled={!history.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
                    <Icon name="undo" />
                  </button>
                  <button className="btn btn-ghost btn-sm tb-icon" onClick={history.redo} disabled={!history.canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
                    <Icon name="redo" />
                  </button>
                  <span className="tb-sep" aria-hidden="true" />
                </>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => onChange(addFlow(design, 'flow'))} title="Add a flow">
                + Flow
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => onChange(addFlow(design, 'sub-flow'))} title="Add a sub-flow">
                + Sub-flow
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setView('paste')} title="Paste Mule XML to load a design">
                Paste XML
              </button>
              <button
                className="btn btn-ghost btn-sm tb-icon"
                title="Clear the whole design"
                aria-label="Clear"
                onClick={() => {
                  if (countComponents(design) && !confirm('Clear the whole design?')) return
                  onChange(emptyDesign())
                  setSelectedId(null)
                }}
              >
                <Icon name="trash" />
              </button>
              <span className="tb-sep panel-toggle" aria-hidden="true" />
              <PanelToggles panels={panels} toggle={toggle} />
            </div>
          )}
          {toolbarEnd && <div className="designer-toolbar-end">{toolbarEnd}</div>}
        </div>

        {notice && view === 'design' && (
          <div className={`designer-notice small${notice.warn ? ' warn-text' : ''}`}>
            <span>{notice.text}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
              Dismiss
            </button>
          </div>
        )}

        {removed && history?.canUndo && (
          <div className="designer-notice undo-bar small" role="status">
            <span>Deleted {removed.what ?? 'it'}</span>
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

        {view === 'xml' ? (
          <XmlView design={design} readOnly={readOnly} onChange={onChange} />

        ) : view === 'paste' ? (
          <div className="designer-paste">
            <p className="muted small">
              Paste from the Configuration XML tab in Anypoint Studio. This replaces the design. Global configurations
              such as connection details are not imported.
            </p>
            <textarea
              className="input mono"
              autoFocus
              spellCheck={false}
              placeholder={'<mule ...>\n  <flow name="orders-api">\n    ...\n  </flow>\n</mule>'}
              value={pasted}
              onChange={(e) => {
                setPasted(e.target.value)
                setPasteError(null)
              }}
            />
            {pasteError && <p className="warn-text small">{pasteError}</p>}
            <div className="designer-paste-actions">
              <button className="btn btn-primary" onClick={() => importXml(pasted)} disabled={!pasted.trim()}>
                Import
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setPasteError(null)
                  setView('design')
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : view === 'split' ? (
          <div className="designer-split">
            {body}
            <XmlView design={design} readOnly={readOnly} onChange={onChange} />
          </div>
        ) : (
          body
        )}
      </div>
    </Ctx.Provider>
  )
}

// ---------- Palette ----------

// Words people search for that are not in a component's name.
const ALIASES = {
  'wsc-consume': 'soap wsc wsdl',
  transform: 'dataweave dw map',
  'http-request': 'rest api call',
  'http-listener': 'rest api endpoint',
  'flow-ref': 'subflow sub-flow call',
  'os-store': 'cache save',
  'on-error-propagate': 'catch exception',
  'on-error-continue': 'catch exception',
  'raise-error': 'throw exception',
  'until-successful': 'retry',
  idempotent: 'duplicate',
  choice: 'if else when',
  foreach: 'loop for each',
  'parallel-foreach': 'loop for each',
  'scatter-gather': 'parallel',
  scheduler: 'cron poll timer',
  'apikit-router': 'raml',
  'db-stored-procedure': 'call sp plsql',
}

function Palette({ armed, setArmed }) {
  const { setDrag, touch } = useContext(Ctx)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // A lane (Batch step, When) is not a palette item of its own, so a search for it finds the component that holds it.
  const byLane = (c) => q && !c.label.toLowerCase().includes(q) && c.routeLabel?.toLowerCase().includes(q)

  return (
    <aside className="palette">
      <input className="input palette-search" type="search" placeholder="Search components…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="palette-groups">
        {GROUPS.map((g) => {
          const items = Object.entries(COMPONENTS).filter(([type, c]) => c.group === g.id && (c.label.toLowerCase().includes(q) || byLane(c) || ALIASES[type]?.includes(q)))
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
                  <FlowIcon type={type} />
                  <span>
                    {c.label}
                    {byLane(c) && <span className="palette-lane">{c.routeLabel} is inside it</span>}
                  </span>
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
  const { design, readOnly, selectedId, select, remove } = useContext(Ctx)
  return (
    <section className={`flow-box ${selectedId === flow.id ? 'selected' : ''}`}>
      <header
        className="flow-head"
        onClick={(e) => {
          e.stopPropagation()
          if (!readOnly) select(flow.id)
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
              if (confirm(`Remove ${flow.name}?`)) remove(removeFlow(design, flow.id), flow.name)
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
              <NodeView node={flow.source} at={{ key: `${flow.id}:source`, index: 0 }} />
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
          <NodeView node={n} at={{ key: containerKey, index: i }} />
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

// The XML tab is a live editor: after a short pause the typed XML becomes the design. While the XML does not parse,
// the design stays as it was and the error shows under the editor.
function XmlView({ design, readOnly, onChange }) {
  const generated = toXml(design)
  const [text, setText] = useState(generated)
  const [status, setStatus] = useState(null) // { text, warn }
  const mine = useRef(generated) // the XML of the design this editor last produced

  // a change made elsewhere (undo, the canvas) replaces the text; our own change does not
  useEffect(() => {
    if (generated !== mine.current) {
      mine.current = generated
      setText(generated)
      setStatus(null)
    }
  }, [generated])

  useEffect(() => {
    if (readOnly || text === mine.current) return
    const t = setTimeout(() => {
      let result
      try {
        result = fromXml(text)
      } catch (error) {
        setStatus({ text: error.message, warn: true })
        return
      }
      mine.current = toXml(result.design)
      onChange(result.design)
      const left = result.skipped.map((s) => s.name).join(', ')
      setStatus({
        text: `Flow updated: ${plural(result.flows, 'flow')}, ${plural(result.components, 'component')}.${left ? ` Left out: ${left}.` : ''}`,
        warn: Boolean(left),
      })
    }, 600)
    return () => clearTimeout(t)
  }, [text, readOnly, onChange])

  return (
    <div className="designer-xml">
      <div className="designer-xml-editor">
        <CodeEditor value={text} language="xml" readOnly={readOnly} onChange={(v) => setText(v ?? '')} />
      </div>
      {!readOnly && (
        <p className={`designer-xml-status small ${status?.warn ? 'warn-text' : 'muted'}`}>
          {status?.text ?? 'Edit or paste Mule XML here. The flow updates as you type.'}
        </p>
      )}
    </div>
  )
}

// at: { key, index } of the list this component sits in, so a drop on the component lands just above or below it
function NodeView({ node, at }) {
  const { readOnly, inlineSettings, selectedId, select, setDrag, design, change, remove, touch, flags, runMarks, canDrop, dropAt, movingId, payloadKind } = useContext(Ctx)
  const [dropSide, setDropSide] = useState(null)
  // a drag that ends anywhere (or moves on to a step inside this one) clears the line
  useEffect(() => {
    if (!payloadKind) setDropSide(null)
  }, [payloadKind])
  const def = COMPONENTS[node.type]
  const summary = def.summary?.(node.config, node)
  const flagged = flags?.[node.id]
  const ran = runMarks?.[node.id]
  const droppable = !readOnly && at && movingId !== node.id && canDrop(at.key)

  const head = (
    <div
      className="node-head"
      onClick={(e) => {
        e.stopPropagation()
        select(node.id)
      }}
    >
      <FlowIcon type={node.type} />
      <span className="node-text">
        <span className="node-title">{def.label}</span>
        {summary && <span className="node-sub">{summary}</span>}
      </span>
      {ran && (
        <span className={`run-mark ${ran.fail ? 'fail' : 'ok'}`} title={ran.text}>
          {ran.fail ? '✗' : '✓'}
        </span>
      )}
      {flagged && !ran && (
        <span className="check-mark" title={`Failed check: ${flagged.join('; ')}`}>
          !
        </span>
      )}
    </div>
  )

  return (
    <div
      className={`node node-${def.kind} group-${def.group} ${selectedId === node.id ? 'selected' : ''}${flagged ? ' node-flagged' : ''}${ran?.fail ? ' run-failed' : ''}${dropSide ? ` drop-${dropSide}` : ''}`}
      title={flagged ? `Failed check: ${flagged.join('; ')}` : undefined}
      onDragOver={(e) => {
        if (!droppable) return
        e.preventDefault()
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        setDropSide(e.clientY < r.top + Math.min(r.height / 2, 40) ? 'before' : 'after')
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget) && setDropSide(null)}
      onDrop={(e) => {
        if (!droppable) return
        e.preventDefault()
        e.stopPropagation()
        const side = dropSide
        setDropSide(null)
        dropAt(at.key, at.index + (side === 'after' ? 1 : 0))
      }}
      draggable={!readOnly && !touch}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.setData('text/plain', node.id)
        e.dataTransfer.effectAllowed = 'move'
        setDrag({ moveId: node.id })
      }}
      onDragEnd={() => {
        setDrag(null)
        setDropSide(null)
      }}
    >
      {head}
      {inlineSettings && selectedId === node.id && <ConfigView fields={def.fields} values={node.config} />}
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
                  title={def.routeFields.length ? `Click to set this ${def.routeLabel.toLowerCase()}` : undefined}
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
                    {r.config.acceptPolicy && r.config.acceptPolicy !== 'NO_FAILURES' && (
                      <span className="route-sub"> · {r.config.acceptPolicy}</span>
                    )}
                    {r.config.acceptExpression && <span className="route-sub"> · when {r.config.acceptExpression}</span>}
                  </span>
                  {!readOnly && node.routes.length > 1 && (
                    <button
                      className="icon-x"
                      title="Remove route"
                      onClick={(e) => {
                        e.stopPropagation()
                        remove(removeRoute(design, r.id), `${def.routeLabel} ${i + 1}`)
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                {inlineSettings && selectedId === r.id && <ConfigView fields={def.routeFields} values={r.config} />}
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
