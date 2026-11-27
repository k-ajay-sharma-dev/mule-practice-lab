// Runtime Manager, Runtime Fabrics: the list of fabrics and a fabric page with Nodes, Applications, Associated
// environments, Ingress, Persistence gateway, Alerts, Events and a kubectl terminal. The rules live in lab/platform-rtf.js.
import { useEffect, useRef, useState } from 'react'
import { mark, stamp } from '../../lab/platform.js'
import { addNode, age, cpuText, instanceOf, INSTANCES, kubectl, memText, NAMESPACES, NODE, nodeUse, rtfAlerts, rtfApps, rtfEndpoint, systemPods } from '../../lab/platform-rtf.js'
import { Btn, Copy, Dot, Errors, Link, Note, SideNav, Table, Tabs } from './parts.jsx'

const TABS = ['Nodes', 'Applications', 'Associated environments', 'Ingress', 'Persistence gateway', 'Alerts', 'Events', 'kubectl']
const SEEN = { Nodes: 'rtf-nodes' }

export default function RuntimeFabric({ state, update, place, go, openEnv }) {
  // a lab without Runtime Fabric state shows the practice cluster, read only
  const readOnly = !state.rtf
  const inst = place.rtf && instanceOf(state, place.rtf)
  return (
    <>
      <SideNav env={state.env} onEnv={openEnv} items={[['Runtime Fabrics', 'Runtime Fabrics']]} value="Runtime Fabrics" onPick={() => go({})} />
      <main className="pc-main">
        {readOnly && <Note>This lab does not use Runtime Fabric. The page shows the practice cluster and cannot be changed here.</Note>}
        {inst ? <FabricPage key={inst.name} state={state} inst={inst} tab={place.tab ?? 'Nodes'} readOnly={readOnly} update={update} go={go} /> : <FabricList state={state} go={go} />}
      </main>
    </>
  )
}

function FabricList({ state, go }) {
  const rows = INSTANCES.map((meta) => {
    const inst = instanceOf(state, meta.name)
    return (
      <tr key={meta.name}>
        <td>
          <Link onClick={() => go({ rtf: meta.name, tab: 'Nodes' })}>{meta.name}</Link>
        </td>
        <td>
          <Dot status={meta.status} />
        </td>
        <td>{meta.version}</td>
        <td>{inst.nodes.length}</td>
        <td>{meta.envs.join(', ')}</td>
        <td>
          {meta.vendor} {meta.k8s}
        </td>
        <td>{rtfApps(state, meta.name).length}</td>
      </tr>
    )
  })
  return (
    <>
      <div className="pc-title">
        <h2>Runtime Fabrics</h2>
      </div>
      <p className="pc-dim">A Runtime Fabric runs Mule apps as pods on a Kubernetes cluster that you operate. Runtime Manager deploys to it like to any target, and the Runtime Fabric agent in the cluster turns each deployment into pods.</p>
      <Table heads={['Name', 'Status', 'Version', 'Nodes', 'Environments', 'Kubernetes', 'Apps']} rows={rows} empty="No Runtime Fabrics in this organization." />
    </>
  )
}

function FabricPage({ state, inst, tab, readOnly, update, go }) {
  useEffect(() => {
    if (!readOnly) update((s) => mark(s, `rtf:${inst.name}`))
  }, [inst.name, readOnly, update])
  useEffect(() => {
    if (!readOnly && SEEN[tab]) update((s) => mark(s, SEEN[tab]))
  }, [tab, readOnly, update])
  const props = { state, inst, readOnly, update, go }
  return (
    <>
      <p className="pc-dim">
        <Link onClick={() => go({})}>Runtime Fabrics</Link> / {inst.name}
      </p>
      <div className="pc-title">
        <h2>{inst.name}</h2>
        <Dot status={inst.status} />
      </div>
      <p className="pc-dim">
        {inst.vendor}, {inst.region}. Kubernetes {inst.k8s}. Agent version {inst.version}. {inst.nodes.length} worker nodes.
      </p>
      <Tabs tabs={TABS} value={tab} onChange={(t) => go({ rtf: inst.name, tab: t })} />
      {tab === 'Nodes' && <NodesTab {...props} />}
      {tab === 'Applications' && <AppsTab {...props} />}
      {tab === 'Associated environments' && <EnvsTab {...props} />}
      {tab === 'Ingress' && <IngressTab {...props} />}
      {tab === 'Persistence gateway' && <PersistenceTab />}
      {tab === 'Alerts' && <AlertsTab {...props} />}
      {tab === 'Events' && <EventsTab {...props} />}
      {tab === 'kubectl' && <KubectlTab {...props} />}
    </>
  )
}

const Bar = ({ value, max, label }) => {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="rtf-bar" title={`${label}: ${pct}%`}>
      <span className="rtf-track">
        <i className={pct >= 90 ? 'rtf-hot' : pct >= 70 ? 'rtf-warm' : ''} style={{ width: `${pct}%` }} />
      </span>
      <small>
        {label} ({pct}%)
      </small>
    </div>
  )
}

// ---------- Nodes ----------

function NodesTab({ state, inst, readOnly, update }) {
  const [error, setError] = useState('')
  const rows = inst.nodes.map((n, i) => {
    const u = nodeUse(state, inst, i)
    return (
      <tr key={n.name}>
        <td className="pc-mono">{n.name}</td>
        <td>
          <span className="rtf-phase rtf-ok">Ready</span>
        </td>
        <td>
          {NODE.type}, {n.zone}
        </td>
        <td>
          <Bar value={u.reqCpu} max={NODE.allocCpu} label={`${u.reqCpu}m of ${NODE.allocCpu}m`} />
        </td>
        <td>
          <Bar value={u.useCpu} max={NODE.allocCpu} label={`${u.useCpu}m`} />
        </td>
        <td>
          <Bar value={u.reqMem} max={NODE.allocMem} label={`${u.reqMem}Mi of ${NODE.allocMem}Mi`} />
        </td>
        <td>
          <Bar value={u.useMem} max={NODE.allocMem} label={`${u.useMem}Mi`} />
        </td>
        <td>
          {u.pods} of {NODE.pods}
        </td>
        <td>{age(state.clock - n.since)}</td>
      </tr>
    )
  })
  const pending = inst.pods.filter((p) => p.phase === 'Pending').length
  return (
    <section className="rtf-section">
      <p className="pc-dim">Reserved is what the pods on the node have requested: the vCores reserved and the memory of each replica, plus the system pods. The scheduler places a new pod only where its request still fits. Used is what the pods use now.</p>
      <Table heads={['Node', 'Status', 'Type', 'CPU reserved', 'CPU used', 'Memory reserved', 'Memory used', 'Pods', 'Age']} rows={rows} />
      {pending > 0 && <Note>{pending} pod{pending > 1 ? 's are' : ' is'} Pending. The Events tab and kubectl describe pod show why.</Note>}
      <div className="rtf-row">
        <span className="pc-dim">Lab action. On a real cluster you scale the node group of EKS, and the new node registers with Kubernetes. Each node is an {NODE.type} with {NODE.allocCpu}m CPU and {NODE.allocMem}Mi memory allocatable.</span>
        <Btn
          disabled={readOnly}
          onClick={() => {
            const r = addNode(state, inst.name)
            setError(r.error ?? '')
            if (!r.error) update((s) => addNode(s, inst.name).state)
          }}
        >
          Add node
        </Btn>
      </div>
      <Errors list={error ? [error] : []} />
    </section>
  )
}

// ---------- Applications ----------

function AppsTab({ state, inst, go }) {
  const apps = rtfApps(state, inst.name)
  if (!apps.length) return <p className="pc-empty pc-boxed">No application is deployed to {inst.name}. Deploy one from Runtime Manager and choose {inst.name} as the target.</p>
  return (
    <section className="rtf-section">
      {apps.map((a) => {
        const pods = inst.pods.filter((p) => p.app === a.name && p.env === a.env)
        const ready = pods.filter((p) => p.phase === 'Running').length
        const limit = Math.round((a.rtf.memory ?? 1) * 1024)
        return (
          <div key={`${a.env}-${a.name}`} className="rtf-app">
            <div className="rtf-row">
              <b>
                <Link onClick={() => go({ product: 'Runtime Manager', app: a.name, tab: 'Dashboard' })}>{a.name}</Link>
              </b>
              <Dot status={a.status} />
              <span className="pc-dim">
                {a.env}. {ready} of {a.replicas} replicas ready. {a.rtf.cpu} vCores reserved, {a.rtf.limit} vCore limit, {a.rtf.memory} GB memory. Mule {a.version}.
                {a.rtf.spread ? ' Replicas enforced across nodes.' : ' Replicas may share a node.'}
                {a.rtf.lastMile ? ' Last-mile security on.' : ''}
              </span>
            </div>
            <Table
              heads={['Pod', 'Node', 'Status', 'Restarts', 'CPU', 'Memory', 'Age']}
              empty="No pods yet."
              rows={pods.map((p) => (
                <tr key={p.name}>
                  <td className="pc-mono">{p.name}</td>
                  <td className="pc-mono">{p.node === null ? '<none>' : inst.nodes[p.node]?.name}</td>
                  <td>
                    <span className={`rtf-phase rtf-${p.phase === 'Running' ? 'ok' : p.phase === 'Pending' || p.phase === 'ContainerCreating' ? 'wait' : 'bad'}`}>{p.phase === 'Terminated' ? p.last?.reason : p.phase}</span>
                    {p.phase === 'Pending' && p.why && <small className="pc-dim rtf-why">{p.why}</small>}
                  </td>
                  <td>{p.restarts ? `${p.restarts}${p.last ? `, last ${p.last.reason} (exit ${p.last.code})` : ''}` : 0}</td>
                  <td>{p.phase === 'Running' ? `${p.cpu}m` : ''}</td>
                  <td>{p.phase === 'Running' ? <Bar value={p.mem} max={limit} label={`${p.mem}Mi of ${memText(limit)}`} /> : ''}</td>
                  <td>{age(state.clock - p.created)}</td>
                </tr>
              ))}
            />
          </div>
        )
      })}
    </section>
  )
}

// ---------- Associated environments ----------

function EnvsTab({ state, inst }) {
  return (
    <section className="rtf-section">
      <p className="pc-dim">Each environment that is associated with the fabric gets its own namespace in the cluster, named by the environment ID. Use it with kubectl -n.</p>
      <Table
        heads={['Environment', 'Namespace', 'Apps']}
        rows={inst.envs.map((env) => (
          <tr key={env}>
            <td>{env}</td>
            <td className="pc-mono">
              {NAMESPACES[env]} <Copy text={NAMESPACES[env]} />
            </td>
            <td>{rtfApps(state, inst.name).filter((a) => a.env === env).length}</td>
          </tr>
        ))}
      />
    </section>
  )
}

// ---------- Ingress ----------

function IngressTab({ state, inst }) {
  const controllers = systemPods(inst).filter((p) => p.ns === 'ingress-nginx')
  const apps = rtfApps(state, inst.name).filter((a) => a.publicEndpoint !== false)
  return (
    <section className="rtf-section">
      <dl className="rtf-facts">
        <dt>Ingress class</dt>
        <dd className="pc-mono">{inst.ingressClass}</dd>
        <dt>Controller</dt>
        <dd>
          ingress-nginx-controller in the namespace ingress-nginx, {controllers.length} replicas
        </dd>
        <dt>Host template</dt>
        <dd className="pc-mono">https://app-name-lab1a2.sbx.{inst.domain}, https://app-name-lab1a2.prd.{inst.domain}</dd>
      </dl>
      <p className="pc-dim">The ingress resource template lives in the rtf namespace. When an app is deployed with a public endpoint, the agent creates an ingress for it from the template. With last-mile security the controller talks to the app over HTTPS too.</p>
      <Table
        heads={['Application', 'Environment', 'Endpoint', 'Last-mile security']}
        empty="No app on this fabric has a public endpoint."
        rows={apps.map((a) => (
          <tr key={`${a.env}-${a.name}`}>
            <td>{a.name}</td>
            <td>{a.env}</td>
            <td className="pc-mono">{rtfEndpoint(a)}</td>
            <td>{a.rtf.lastMile ? 'On' : 'Off'}</td>
          </tr>
        ))}
      />
    </section>
  )
}

const PersistenceTab = () => (
  <section className="rtf-section">
    <dl className="rtf-facts">
      <dt>Status</dt>
      <dd>Not configured</dd>
    </dl>
    <p className="pc-dim">With the persistence gateway, apps on the fabric keep persistent Object Store data in a PostgreSQL database that you run, and the data survives pod restarts and is shared by the replicas. Without it, an object store lives in the memory of each replica. The lab does not model the gateway.</p>
  </section>
)

// ---------- Alerts and Events ----------

function AlertsTab({ state, inst }) {
  return (
    <section className="rtf-section">
      <Table
        heads={['Alert', 'State', 'Details']}
        rows={rtfAlerts(state, inst.name).map((a) => (
          <tr key={a.name}>
            <td>{a.name}</td>
            <td>
              <Dot status={a.firing ? 'Alerting' : 'OK'} />
            </td>
            <td className="pc-mono rtf-wrap">{a.detail}</td>
          </tr>
        ))}
      />
    </section>
  )
}

function EventsTab({ state, inst }) {
  const list = [...inst.events].sort((a, b) => b.last - a.last)
  return (
    <section className="rtf-section">
      <p className="pc-dim">Kubernetes events of the cluster. Kubernetes keeps events for about an hour.</p>
      <Table
        heads={['Last seen', 'Type', 'Reason', 'Object', 'Message']}
        empty="No events."
        rows={list.map((e, i) => (
          <tr key={i}>
            <td title={stamp(e.last)}>
              {age(state.clock - e.last)}
              {e.count > 1 ? ` (x${e.count})` : ''}
            </td>
            <td className={e.type === 'Warning' ? 'pc-bad' : ''}>{e.type}</td>
            <td>{e.reason}</td>
            <td className="pc-mono rtf-wrap">{e.obj}</td>
            <td className="rtf-wrap">{e.msg}</td>
          </tr>
        ))}
      />
    </section>
  )
}

// ---------- kubectl ----------

function KubectlTab({ state, readOnly, update }) {
  const [text, setText] = useState('')
  const [lines, setLines] = useState([])
  const end = useRef(null)
  useEffect(() => end.current?.scrollIntoView?.({ block: 'nearest' }), [lines])
  const sbx = NAMESPACES.Sandbox
  function run(cmd) {
    const line = cmd.trim()
    if (!line) return
    if (line === 'clear') {
      setLines([])
      setText('')
      return
    }
    const out = kubectl(state, line).out
    setLines((l) => [...l, { cmd: line, out }].slice(-25))
    setText('')
    if (!readOnly) update((s) => kubectl(s, line).state)
  }
  const quick = [
    ['get nodes', 'kubectl get nodes'],
    ['get pods (Sandbox)', `kubectl get pods -n ${sbx}`],
    ['top pods (Sandbox)', `kubectl top pods -n ${sbx}`],
    ['top nodes', 'kubectl top nodes'],
    ['get events (Sandbox)', `kubectl get events -n ${sbx}`],
  ]
  return (
    <section className="rtf-section">
      <p className="pc-dim">
        A shell with a kubeconfig for the cluster. The namespace of Sandbox is <span className="pc-mono">{sbx}</span>. Type help for the commands the lab answers, or clear.
      </p>
      <div className="rtf-quick">
        {quick.map(([label, cmd]) => (
          <Btn key={label} onClick={() => run(cmd)}>
            {label}
          </Btn>
        ))}
      </div>
      <div className="rtf-term" aria-label="kubectl output">
        {lines.map((l, i) => (
          <div key={i}>
            <div className="rtf-cmd">$ {l.cmd}</div>
            <pre>{l.out}</pre>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="rtf-prompt"
        onSubmit={(e) => {
          e.preventDefault()
          run(text)
        }}
      >
        <span className="pc-mono">$</span>
        <input className="pc-input pc-mono" aria-label="kubectl command" value={text} onChange={(e) => setText(e.target.value)} placeholder={`kubectl get pods -n ${sbx}`} spellCheck={false} autoComplete="off" />
        <Btn kind="primary" type="submit">
          Run
        </Btn>
      </form>
      <p className="pc-dim">
        Pods show the app container and the anypoint-monitoring sidecar, so a healthy replica is 2/2. CPU is in millicores: {cpuText(500)} is 0.5 vCores.
      </p>
    </section>
  )
}
