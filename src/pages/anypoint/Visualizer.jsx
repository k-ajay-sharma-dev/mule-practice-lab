import { useEffect, useState } from 'react'
import { apiStatus, dayText, endpointOf, eventsOf, HOUR, internalOf, isFailed, mark, MINUTE, pairing, propsOf } from '../../lab/platform.js'
import { BACKENDS, LAYER_PROPERTY, LAYERS } from '../../lab/platform-led.js'
import { packageOf } from '../../lab/platform-packages.js'
import { Btn, Dot, Link, Note, SideNav, Table, Tabs } from './parts.jsx'

const W = 196
const H = 70
const GAP_X = 84
const GAP_Y = 22
const TOP = 34
const FRESH = 15 * MINUTE // a line counts the calls of the last minutes

const mean = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null)
const isBad = (status) => status === 0 || status >= 500 || status === 401 || status === 403

function graphOf(state) {
  const apps = state.apps.filter((a) => a.env === state.env)
  const edges = Object.entries(state.links ?? {})
    .filter(([key]) => key.startsWith(`${state.env}|`))
    .map(([key, calls]) => {
      const [from, to] = key.slice(state.env.length + 1).split('>')
      const fresh = calls.filter(([t]) => t > state.clock - FRESH)
      return { key, from, to, calls: fresh.length, errors: fresh.filter(([, s]) => isBad(s)).length, ms: mean(fresh.map(([, , ms]) => ms)), last: calls.at(-1)[0] }
    })
  const nodes = apps.map((app) => {
    const layer = LAYERS.find((l) => l === propsOf(app)[LAYER_PROPERTY]) ?? 'Ungrouped'
    const calls = eventsOf(state, { app: app.name, env: app.env }, state.clock - FRESH, state.clock).filter((e) => e.k !== 'skip')
    return { id: app.name, name: app.name, layer, app, calls: calls.length, errors: calls.filter(isFailed).length, ms: mean(calls.map((e) => e.ms)), status: app.status }
  })
  const others = [...new Set(edges.flatMap((e) => [e.from, e.to]))].filter((id) => !apps.some((a) => a.name === id))
  for (const id of others) {
    const queue = state.queues.find((q) => q.name === id)
    const near = edges.filter((e) => e.to === id)
    // a queue stands under the application that fills or reads it, a system in a column of its own
    const beside = queue && nodes.findIndex((n) => edges.some((e) => e.to === id && e.from === n.id) || edges.some((e) => e.from === id && e.to === n.id))
    const node = { id, name: BACKENDS[id]?.name ?? id, layer: queue && beside >= 0 ? nodes[beside].layer : 'Outside', kind: queue ? `Queue, ${queue.messages.length} waiting` : BACKENDS[id] ? 'Backend' : 'Address', errors: near.reduce((n, e) => n + e.errors, 0), calls: near.reduce((n, e) => n + e.calls, 0) }
    if (queue && beside >= 0) nodes.splice(beside + 1, 0, node)
    else nodes.push(node)
  }
  // the systems in the order of the applications that call them, so fewer lines cross
  const order = (n) => (n.layer === 'Outside' ? nodes.findIndex((x) => edges.some((e) => e.from === x.id && e.to === n.id)) : -1)
  nodes.sort((a, b) => order(a) - order(b))
  const columns = [...LAYERS, 'Outside', 'Ungrouped'].map((name) => ({ name, nodes: nodes.filter((n) => n.layer === name) })).filter((c) => c.nodes.length)
  const tall = Math.max(1, ...columns.map((c) => c.nodes.length))
  columns.forEach((c, x) =>
    c.nodes.forEach((n, y) => {
      n.x = x * (W + GAP_X)
      n.y = TOP + (y + (tall - c.nodes.length) / 2) * (H + GAP_Y)
    }),
  )
  return { nodes, edges, columns, width: columns.length * (W + GAP_X) - GAP_X, height: TOP + tall * (H + GAP_Y) }
}

function pathOf(a, b) {
  if (b.x === a.x) {
    const below = b.y > a.y
    const x = a.x + W / 2
    const [y1, y2] = below ? [a.y + H, b.y] : [a.y, b.y + H]
    return { d: `M${x} ${y1} L${x} ${y2}`, x: x + 30, y: (y1 + y2) / 2 + 9 }
  }
  const ahead = b.x > a.x
  const [x1, x2] = ahead ? [a.x + W, b.x] : [a.x, b.x + W]
  const [y1, y2] = [a.y + H / 2, b.y + H / 2]
  const bend = (x2 - x1) / 2
  // two lines between the same boxes stay readable when the label sits near the target
  return { d: `M${x1} ${y1} C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`, x: x1 + (x2 - x1) * 0.62, y: y1 + (y2 - y1) * 0.7 }
}

export default function Visualizer({ state, update, place, go, openEnv }) {
  const { view = 'Architecture', node } = place
  const graph = graphOf(state)
  const picked = graph.nodes.find((n) => n.id === node)
  useEffect(() => update((s) => mark(s, 'visualizer')), [update])
  useEffect(() => {
    if (node) update((s) => mark(s, `vis:${node}`))
  }, [node, update])
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} items={[['Architecture', 'Architecture'], ['Troubleshooting', 'Troubleshooting'], ['Policy', 'Policy']]} value={view} onPick={(v) => go({ view: v, node })} />
      <main className="pc-main">
        <div className="pc-title">
          <h2>{view}</h2>
        </div>
        <p className="pc-dim">
          The calls of the last 15 minutes. The layer comes from the property {LAYER_PROPERTY}. Move the lab clock to bring new traffic.
        </p>
        {graph.nodes.length === 0 && <p className="pc-empty pc-boxed">No applications in this environment.</p>}
        {graph.nodes.length > 0 && <NetworkMap graph={graph} view={view} state={state} picked={picked} onPick={(id) => go({ view, node: id })} />}
        {picked && <Details node={picked} graph={graph} state={state} go={go} />}
        {graph.edges.length > 0 && (
          <>
            <h3 className="pc-h3">Connections</h3>
            <Table
              heads={['From', 'To', 'Calls', 'Errors', 'Average ms', 'Last call']}
              rows={graph.edges.map((e) => (
                <tr key={e.key}>
                  <td>{nameOf(graph, e.from)}</td>
                  <td>{nameOf(graph, e.to)}</td>
                  <td>{e.calls}</td>
                  <td className={e.errors ? 'pc-bad' : ''}>{e.errors}</td>
                  <td>{e.ms ?? ''}</td>
                  <td>{dayText(e.last)}</td>
                </tr>
              ))}
            />
          </>
        )}
        {graph.edges.length === 0 && graph.nodes.length > 0 && <Note>No calls between applications yet.</Note>}
      </main>
    </>
  )
}

const nameOf = (graph, id) => graph.nodes.find((n) => n.id === id)?.name ?? id

function textOf(node, view, state) {
  if (!node.app) return node.kind
  if (node.status !== 'Running') return node.status
  if (view === 'Policy') {
    const pair = pairing(state, node.app)
    if (pair.state === 'none') return 'Not managed'
    return pair.api ? `${pair.api.policies.length} polic${pair.api.policies.length === 1 ? 'y' : 'ies'}` : 'Blocked'
  }
  if (view === 'Troubleshooting') return node.calls ? `${node.errors} of ${node.calls} failed, ${node.ms} ms` : 'No calls'
  return packageOf(node.app.pkg).handle ? (node.app.publicEndpoint === false ? 'Private' : 'Public endpoint') : 'No endpoint'
}

function NetworkMap({ graph, view, state, picked, onPick }) {
  const near = (e) => !picked || e.from === picked.id || e.to === picked.id
  const at = (id) => graph.nodes.find((n) => n.id === id)
  return (
    <div className="pc-map-box" tabIndex={0} aria-label="Application network">
      <div className="pc-map" style={{ width: graph.width, height: graph.height }}>
        <svg width={graph.width} height={graph.height} aria-hidden="true">
          <defs>
            {['', '-bad'].map((k) => (
              <marker key={k} id={`pc-arrow${k}`} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="8" markerHeight="8" orient="auto">
                <path d="M0 0 L8 4 L0 8 z" className={`pc-arrow${k}`} />
              </marker>
            ))}
          </defs>
          {graph.edges.map((e) => {
            const p = pathOf(at(e.from), at(e.to))
            const bad = e.errors > 0
            return (
              <g key={e.key} className={`pc-edge${bad ? ' bad' : ''}${e.calls === 0 ? ' old' : ''}${near(e) ? '' : ' far'}`}>
                <path d={p.d} markerEnd={`url(#pc-arrow${bad ? '-bad' : ''})`} />
                {view === 'Troubleshooting' && e.ms !== null && (
                  <text x={p.x} y={p.y - 5} textAnchor="middle">
                    {e.ms} ms
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {graph.columns.map((c) => (
          <b key={c.name} className="pc-map-head" style={{ left: c.nodes[0].x, width: W }}>
            {c.name === 'Outside' ? 'Backends' : c.name}
          </b>
        ))}
        {graph.nodes.map((n) => {
          const bad = n.errors > 0 || (n.app && n.status !== 'Running')
          return (
            <button key={n.id} type="button" aria-pressed={picked?.id === n.id} className={`pc-node${bad ? ' bad' : ''}${n.app ? '' : ' out'}${picked?.id === n.id ? ' on' : ''}`} style={{ left: n.x, top: n.y, width: W, height: H }} onClick={() => onPick(picked?.id === n.id ? undefined : n.id)}>
              <b>{n.name}</b>
              <span>{textOf(n, view, state)}</span>
              {bad && <i>{n.app && n.status !== 'Running' ? 'Down' : 'Errors'}</i>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Details({ node, graph, state, go }) {
  const [tab, setTab] = useState('Info')
  const list = (edges, key) => edges.map((e) => nameOf(graph, e[key])).join(', ') || 'None'
  const calls = list(graph.edges.filter((e) => e.from === node.id), 'to')
  const callers = list(graph.edges.filter((e) => e.to === node.id), 'from')
  const { app } = node
  const api = app ? pairing(state, app).api : null
  const hour = app ? eventsOf(state, { app: app.name, env: app.env }, state.clock - HOUR, state.clock).filter((e) => e.k === 'in') : []
  return (
    <section className="pc-sheet" aria-label={node.name}>
      <div className="pc-title">
        {app && <Dot status={app.status} />}
        <h3>{node.name}</h3>
        <span className="pc-grow" />
        {app && (
          <>
            <Btn onClick={() => go({ product: 'Runtime Manager', app: app.name, tab: 'Dashboard' })}>Runtime Manager</Btn>
            <Btn onClick={() => go({ product: 'Monitoring', page: 'Built-in dashboards', target: `app:${app.name}` })}>Monitoring</Btn>
          </>
        )}
      </div>
      {app && <Tabs tabs={['Info', 'API']} value={tab} onChange={setTab} />}
      {(tab === 'Info' || !app) && (
        <dl className="pc-facts">
          <dt>Calls</dt>
          <dd>{calls}</dd>
          <dt>Called by</dt>
          <dd>{callers}</dd>
          {app && (
            <>
              <dt>Layer</dt>
              <dd>{node.layer}</dd>
              <dt>Target</dt>
              <dd>{app.target}</dd>
              <dt>Public endpoint</dt>
              <dd>{packageOf(app.pkg).handle && app.publicEndpoint !== false ? endpointOf(app) : 'None'}</dd>
              <dt>Private endpoint</dt>
              <dd>{packageOf(app.pkg).handle ? internalOf(app) : 'None'}</dd>
              <dt>Requests, last hour</dt>
              <dd>
                {hour.length}, {hour.filter(isFailed).length} failed
              </dd>
            </>
          )}
          {!app && (
            <>
              <dt>Type</dt>
              <dd>{node.kind}</dd>
            </>
          )}
        </dl>
      )}
      {tab === 'API' && app && !api && <p className="pc-dim">No API instance is linked to this application.</p>}
      {tab === 'API' && api && (
        <dl className="pc-facts">
          <dt>API</dt>
          <dd>
            <Link onClick={() => go({ product: 'API Manager', api: api.id })}>{api.name}</Link>
          </dd>
          <dt>Status</dt>
          <dd>{apiStatus(state, api)}</dd>
          <dt>Policies</dt>
          <dd>{api.policies.map((p) => p.type).join(', ') || 'None'}</dd>
          <dt>Contracts</dt>
          <dd>{api.contracts.map((c) => `${c.client} (${c.status})`).join(', ') || 'None'}</dd>
        </dl>
      )}
    </section>
  )
}
