import { useEffect, useState } from 'react'
import { apiStatus, assetGroups, createClient, dayText, mark, requestAccess } from '../../lab/platform.js'
import { parseRaml } from '../../raml/parse.js'
import { Btn, Copy, Dot, Errors, Field, Input, Link, Modal, Note, Select, SideNav, Table } from './parts.jsx'

export default function Exchange({ state, update, place, go }) {
  const groups = assetGroups(state)
  const group = groups.find((g) => g[0].assetId === place.asset)
  if (group) return <Asset key={place.asset} group={group} state={state} update={update} go={go} />
  return <Home groups={groups} state={state} go={go} place={place} />
}

function Home({ groups, state, go, place }) {
  const [term, setTerm] = useState('')
  const page = place.page ?? 'Harbor Lab'
  const shown = groups.filter((g) => g[0].name.toLowerCase().includes(term.toLowerCase()))
  return (
    <>
      <SideNav items={[['Harbor Lab', 'Harbor Lab'], ['Shared', 'Shared with me', true], null, ['My applications', 'My applications'], ['Public', 'Public portal', true]]} value={page} onPick={(p) => go({ page: p })} />
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
                  <small>REST API</small>
                  <small>
                    {g[0].version}, {g[0].lifecycle}
                  </small>
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
            </span>
          </div>
          <span className="pc-grow" />
          <Select value={version} onChange={setVersion} options={group.map((a) => [a.version, `${a.version}, ${a.apiVersion}, ${a.lifecycle}`])} aria-label="Version" />
          <Btn kind="primary" onClick={() => setAsking(true)}>
            Request access
          </Btn>
        </div>
        {page === 'Home' && (
          <>
            <p>{String(parseRaml(asset.raml).model?.root.description ?? 'No description yet.')}</p>
            <Note>Other teams find the API here. They read the specification, try it and request access to an instance.</Note>
          </>
        )}
        {page === 'Summary' && <pre className="pc-pre">{asset.raml}</pre>}
        {page === 'Endpoints' && <Table heads={['Resource', 'Methods']} rows={resources.map((r) => <tr key={r.path}><td className="pc-mono">{r.path}</td><td>{Object.keys(r.methods).map((m) => <span key={m} className={`pc-method pc-m-${m}`}>{m.toUpperCase()}</span>)}</td></tr>)} />}
        {page === 'API instances' && <Table heads={['Environment', 'Instance', 'Status']} empty="No API instances. Create one in API Manager." rows={instances.map((a) => <tr key={a.id}><td>{a.env}</td><td><Link onClick={() => go({ product: 'API Manager', api: a.id, env: a.env })}>{a.label || a.id}</Link></td><td><Dot status={apiStatus(state, a)} /></td></tr>)} />}
      </main>
      {asking && <Access instances={instances} state={state} update={update} onClose={() => setAsking(false)} />}
    </>
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
