import { useEffect, useState } from 'react'
import { apiStatus, assetGroups, createClient, dayText, LIFECYCLE_MOVES, mark, requestAccess, setLifecycle } from '../../lab/platform.js'
import { parseRaml } from '../../raml/parse.js'
import { conformanceOf } from '../../lab/platform-governance.js'
import { Btn, Copy, Dot, Errors, Field, Input, Link, Modal, Note, Select, SideNav, Table } from './parts.jsx'

export default function Exchange({ state, update, place, go }) {
  const groups = assetGroups(state)
  const group = groups.find((g) => g[0].assetId === place.asset)
  if (group) return <Asset key={place.asset} group={group} state={state} update={update} go={go} />
  return <Home groups={groups} state={state} go={go} place={place} />
}

function Home({ groups, state, go, place }) {
  const [term, setTerm] = useState('')
  const page = place.page ?? 'Brightmart Lab'
  // the search reads the name, the asset ID, the owner team and the tags, so "orders", "Process" or "Payments team" all find something
  const shown = groups.filter((g) => [g[0].name, g[0].assetId, g[0].team, ...(g[0].tags ?? [])].join(' ').toLowerCase().includes(term.toLowerCase()))
  return (
    <>
      <SideNav items={[['Brightmart Lab', 'Brightmart Lab'], ['Shared', 'Shared with me', true], null, ['My applications', 'My applications'], ['Public', 'Public portal', true]]} value={page} onPick={(p) => go({ page: p })} />
      <main className="pc-main">
        {page === 'My applications' ? (
          <>
            <h2>My applications</h2>
            <Table heads={['Name', 'Client ID', 'Client Secret']} empty="No applications yet." rows={state.clients.map((c) => <tr key={c.name}><td>{c.name}</td><td className="pc-mono">{c.clientId} <Copy text={c.clientId} /></td><td className="pc-mono">{c.clientSecret} <Copy text={c.clientSecret} /></td></tr>)} />
          </>
        ) : (
          <>
            <div className="pc-bar">
              <Input value={term} onChange={setTerm} placeholder="Search for assets" aria-label="Search for assets" />
            </div>
            <h2>Assets</h2>
            {shown.length === 0 && <div className="pc-empty pc-boxed">No assets match.</div>}
            <div className="pc-assets">
              {shown.map((g) => (
                <button key={g[0].assetId} type="button" onClick={() => go({ asset: g[0].assetId })}>
                  <span className="pc-asset-icon">REST</span>
                  <b>{g[0].name}</b>
                  <small>REST API{g[0].tags?.length ? `, ${g[0].tags.join(', ')}` : ''}</small>
                  <small>
                    {g[0].version}, {g[0].lifecycle}
                  </small>
                  {g[0].lifecycle === 'deprecated' && <span className="pc-tag pc-tag-deprecated">Deprecated</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  )
}

function Asset({ group, state, update, go }) {
  const [version, setVersion] = useState(group[0].version)
  const [page, setPage] = useState('Home')
  const [asking, setAsking] = useState(false)
  const [managing, setManaging] = useState(false)
  const asset = group.find((a) => a.version === version) ?? group[0]
  useEffect(() => update((s) => mark(s, `asset:${asset.assetId}`)), [asset.assetId, update])
  const instances = state.apis.filter((a) => a.assetId === asset.assetId)
  const resources = parseRaml(asset.raml).model?.resources ?? []
  return (
    <>
      <SideNav back={['Assets list', () => go({})]} items={[['Home', 'Home'], { title: 'Specification' }, ['Summary', 'Summary'], ['Endpoints', 'Endpoints'], null, ['API instances', 'API instances']]} value={page} onPick={setPage} />
      <main className="pc-main">
        <div className="pc-title">
          <span className="pc-asset-icon">REST</span>
          <div>
            <h2>{asset.name}</h2>
            <span className="pc-dim">
              REST API, published {dayText(asset.t)}, asset ID {asset.assetId}
            </span>{' '}
            {/* API Governance: the conformance of this version */}
            {((c) => <span className={`pc-tag gov-tag gov-tag-${c.replace(/\s/g, '-').toLowerCase()}`} title="API Governance">{c}</span>)(conformanceOf(state, asset, parseRaml).status)}
          </div>
          <span className="pc-grow" />
          <Select value={version} onChange={setVersion} options={group.map((a) => [a.version, `${a.version}, ${a.apiVersion}, ${a.lifecycle}`])} aria-label="Version" />
          <Btn onClick={() => { setManaging(true); update((s) => mark(s, `versions:${asset.assetId}`)) }}>Manage versions</Btn>
          <Btn kind="primary" onClick={() => setAsking(true)}>
            Request access
          </Btn>
        </div>
        {asset.lifecycle === 'deprecated' && (
          <Note>
            <span className="pc-tag pc-tag-deprecated">Deprecated</span> Version {asset.version} is deprecated. API instances that use it keep working. Consumers should move to a newer version.
          </Note>
        )}
        {asset.lifecycle === 'development' && (
          <Note>
            <span className="pc-tag">Development</span> Version {asset.version} is still in development.
          </Note>
        )}
        {page === 'Home' && (
          <>
            <p>{String(parseRaml(asset.raml).model?.root.description ?? 'No description yet.')}</p>
            {asset.team && (
              <p className="pc-dim">
                Owner: {asset.team}. Tags: {(asset.tags ?? []).join(', ')}.
              </p>
            )}
            <Note>Other teams find the API here. They read the specification, try it and request access to an instance.</Note>
          </>
        )}
        {page === 'Summary' && <pre className="pc-pre">{asset.raml}</pre>}
        {page === 'Endpoints' && <Table heads={['Resource', 'Methods']} rows={resources.map((r) => <tr key={r.path}><td className="pc-mono">{r.path}</td><td>{Object.keys(r.methods).map((m) => <span key={m} className={`pc-method pc-m-${m}`}>{m.toUpperCase()}</span>)}</td></tr>)} />}
        {/* every version of the asset, with the client applications that hold a contract: who still uses v1 */}
        {page === 'API instances' && <Table heads={['Environment', 'Instance', 'Version', 'Status', 'Client applications']} empty="No API instances. Create one in API Manager." rows={state.apis.filter((a) => a.assetId === asset.assetId).map((a) => <tr key={a.id}><td>{a.env}</td><td><Link onClick={() => go({ product: 'API Manager', api: a.id, env: a.env })}>{a.label || a.id}</Link></td><td>{a.version}, {a.apiVersion}</td><td><Dot status={apiStatus(state, a)} /></td><td>{(a.contracts ?? []).map((c) => (c.status === 'approved' ? c.client : `${c.client} (${c.status})`)).join(', ') || 'None'}</td></tr>)} />}
      </main>
      {asking && <Access instances={instances} state={state} update={update} onClose={() => setAsking(false)} />}
      {managing && <Versions group={group} state={state} update={update} onClose={() => setManaging(false)} />}
    </>
  )
}

// Manage versions: the lifecycle of each version. Only the allowed changes are offered.
function Versions({ group, state, update, onClose }) {
  const [errors, setErrors] = useState([])
  const change = (version, lifecycle) => {
    const r = setLifecycle(state, group[0].assetId, version, lifecycle)
    setErrors(r.errors)
    if (!r.errors.length) update(() => r.state)
  }
  return (
    <Modal title="Manage versions" onClose={onClose} wide foot={<Btn kind="primary" onClick={onClose}>Close</Btn>}>
      <Table
        heads={['Version', 'API version', 'Published', 'Lifecycle state', 'Instances']}
        rows={group.map((a) => {
          const current = state.assets.find((x) => x.assetId === a.assetId && x.version === a.version) ?? a
          const life = current.lifecycle ?? 'stable'
          const uses = state.apis.filter((x) => x.assetId === a.assetId && x.version === a.version).length
          return (
            <tr key={a.version}>
              <td>
                {a.version} {life === 'deprecated' && <span className="pc-tag pc-tag-deprecated">Deprecated</span>}
              </td>
              <td>{a.apiVersion}</td>
              <td>{dayText(a.t)}</td>
              <td>
                <Select value={life} onChange={(v) => change(a.version, v)} aria-label={`Lifecycle state of ${a.version}`} options={[life, ...(LIFECYCLE_MOVES[life] ?? [])].map((x) => [x, x[0].toUpperCase() + x.slice(1)])} />
              </td>
              <td>{uses}</td>
            </tr>
          )
        })}
      />
      <p className="pc-dim">A development version can become stable. A stable version can be deprecated, and a deprecated version can become stable again. A version does not go back to development. Deprecating changes only the state: instances that use the version keep working.</p>
      <Errors list={errors} />
    </Modal>
  )
}

function Access({ instances, state, update, onClose }) {
  const [id, setId] = useState(instances[0]?.id ?? '')
  const [client, setClient] = useState('')
  const [tier, setTier] = useState('')
  const [name, setName] = useState('')
  const [sent, setSent] = useState(false)
  const api = instances.find((a) => a.id === id)
  const creating = client === '+'
  const taken = state.clients.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())
  const who = creating ? name.trim() : client
  const ready = api && who && (!creating || !taken) && (api.tiers.length === 0 || tier)
  function send() {
    update((s) => requestAccess(creating ? createClient(s, who) : s, id, who, tier))
    setSent(true)
  }
  if (sent) {
    const c = state.clients.find((x) => x.name === who)
    const contract = api.contracts.find((x) => x.client === who)
    const waits = contract?.status === 'pending' || contract?.change
    return (
      <Modal title="Request API access" onClose={onClose} foot={<Btn kind="primary" onClick={onClose}>Close</Btn>}>
        <p className={waits ? 'pc-warn' : 'pc-good'}>{waits ? 'Your request was submitted and waits for approval.' : 'Your request has been received and approved.'}</p>
        <p className="pc-dim">Use this client ID and client secret to access the requested API instance.</p>
        <dl className="pc-facts one">
          <dt>Client ID</dt>
          <dd className="pc-mono">
            {c?.clientId} <Copy text={c?.clientId ?? ''} />
          </dd>
          <dt>Client Secret</dt>
          <dd className="pc-mono">
            {c?.clientSecret} <Copy text={c?.clientSecret ?? ''} />
          </dd>
        </dl>
      </Modal>
    )
  }
  return (
    <Modal
      title="Request access"
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" disabled={!ready} onClick={send}>
            Request access
          </Btn>
        </>
      }
    >
      {instances.length === 0 && <Note>This API has no instance yet. Create one in API Manager first.</Note>}
      <Field label="API Instance">
        <Select value={id} onChange={setId} options={instances.map((a) => [a.id, `${a.env}, ${a.label || a.id}`])} />
      </Field>
      <Field label="Application">
        <Select value={client} onChange={setClient} placeholder="Select application" options={[...state.clients.map((c) => c.name), ['+', 'Create a new application']]} />
      </Field>
      {creating && (
        <Field label="Application Name" required>
          <Input value={name} onChange={setName} placeholder="Web Shop" />
        </Field>
      )}
      {api?.tiers.length > 0 && (
        <Field label="SLA tier">
          <Select value={tier} onChange={setTier} placeholder="Select SLA tier" options={api.tiers.map((t) => [t.name, `${t.name}, ${t.requests} per ${t.periodMs / 1000} s, ${t.autoApprove ? 'automatic' : 'manual'} approval`])} />
        </Field>
      )}
      <Errors list={creating && taken ? ['An application with this name exists.'] : []} />
    </Modal>
  )
}
