// API Governance: the overview of conformance, the governance profiles, the rulesets from Exchange and the
// conformance of each API version with its issues. The rules run in src/lab/platform-governance.js.
// "Block publishing" is a lab option; the screen says so where it is set.
import { useEffect, useMemo, useState } from 'react'
import { dayText, mark } from '../../lab/platform.js'
import { parseRaml } from '../../raml/parse.js'
import {
  apiRows, CLI, cliRun, conformanceOf, createProfile, criteriaText, deleteProfile, LAYERS, latestOf, layerOf, LIFECYCLE_STATES, profileById, profileRows, profilesOf, RULESETS, selects, totalsOf, updateProfile, upgradeGovernance,
} from '../../lab/platform-governance.js'
import { Btn, Check, Errors, Field, Input, Link, Modal, Note, Select, SideNav, Table } from './parts.jsx'

const STATUS_CLASS = { Conformant: 'ok', 'Not conformant': 'bad', 'Not validated': 'none' }
const Status = ({ value }) => <span className={`gov-badge gov-${STATUS_CLASS[value] ?? 'none'}`}>{value}</span>
const Severity = ({ value }) => <span className={`gov-sev gov-sev-${value}`}>{value[0].toUpperCase() + value.slice(1)}</span>
const life = (x) => x[0].toUpperCase() + x.slice(1)

export default function Governance({ state, update, place, go }) {
  const g = state.governance
  // a save from before API Governance was built holds a placeholder: give it the default profile
  useEffect(() => {
    if (g && !Array.isArray(g.profiles)) update(upgradeGovernance)
  }, [g, update])
  const rows = useMemo(() => apiRows(state, parseRaml), [state.assets, state.governance]) // eslint-disable-line react-hooks/exhaustive-deps
  const page = place.api ? 'APIs' : place.profile ? 'Profiles' : (place.page ?? 'Overview')
  const nav = [{ title: 'API Governance' }, ['Overview', 'Overview'], ['Profiles', 'Profiles'], ['Rulesets', 'Rulesets'], ['APIs', 'APIs']]

  return (
    <>
      <SideNav items={nav} value={page} onPick={(p) => go({ page: p })} />
      <main className="pc-main gov">
        {page === 'Overview' && <Overview state={state} update={update} rows={rows} go={go} />}
        {page === 'Profiles' && !place.profile && <Profiles state={state} update={update} rows={rows} go={go} />}
        {page === 'Profiles' && place.profile && <ProfileView key={place.profile} id={place.profile} state={state} update={update} go={go} />}
        {page === 'Rulesets' && <Rulesets update={update} />}
        {page === 'APIs' && !place.api && <Apis rows={rows} go={go} />}
        {page === 'APIs' && place.api && <ApiView key={place.api} id={place.api} state={state} update={update} go={go} />}
      </main>
    </>
  )
}

// ---------- Overview ----------

function Overview({ state, update, rows, go }) {
  useEffect(() => update((s) => mark(s, 'gov:overview')), [update])
  const t = totalsOf(rows)
  const profiles = profilesOf(state)
  const bad = rows.filter((r) => r.status === 'Not conformant').sort((a, b) => b.errors - a.errors)
  return (
    <>
      <h2>Overview</h2>
      <div className="gov-tiles">
        <div className="ok"><b>{t.conformant}</b><span>Conformant APIs</span></div>
        <div className="bad"><b>{t.notConformant}</b><span>Not conformant APIs</span></div>
        <div><b>{t.notValidated}</b><span>Not validated APIs</span></div>
        <div><b>{profiles.length}</b><span>Governance profiles</span></div>
      </div>
      {profiles.length === 0 && <Note>No governance profile exists yet, so no API is validated. Create a profile under Profiles.</Note>}
      <h3>Not conformant APIs</h3>
      <Table
        heads={['API', 'Version', 'API layer', 'Errors', 'Warnings']}
        empty="Every governed API is conformant."
        rows={bad.map((r) => (
          <tr key={r.assetId}>
            <td><Link onClick={() => go({ page: 'APIs', api: r.assetId })}>{r.name}</Link></td>
            <td>{r.version}</td>
            <td>{r.layer || 'None'}</td>
            <td>{r.errors}</td>
            <td>{r.warnings}</td>
          </tr>
        ))}
      />
      <h3>Profiles</h3>
      <Table
        heads={['Profile', 'APIs', 'Not conformant', 'Blocks publishing']}
        empty="No profiles yet."
        rows={profiles.map((p) => {
          const list = profileRows(state, p, parseRaml)
          return (
            <tr key={p.id}>
              <td><Link onClick={() => go({ page: 'Profiles', profile: p.id })}>{p.name}</Link></td>
              <td>{list.length}</td>
              <td>{list.filter((r) => r.status === 'Not conformant').length}</td>
              <td>{p.block ? 'Yes (lab option)' : 'No'}</td>
            </tr>
          )
        })}
      />
    </>
  )
}

// ---------- Profiles ----------

function Profiles({ state, update, go }) {
  useEffect(() => update((s) => mark(s, 'gov:profiles')), [update])
  const [creating, setCreating] = useState(false)
  const profiles = profilesOf(state)
  return (
    <>
      <div className="pc-bar">
        <h2 className="pc-grow">Governance profiles</h2>
        <Btn kind="primary" onClick={() => setCreating(true)}>Create profile</Btn>
      </div>
      <p className="pc-dim">A profile selects APIs by filter criteria and applies rulesets to them. The conformance of each selected API version shows in API Governance and in Exchange.</p>
      <Table
        heads={['Profile', 'Filter criteria', 'Rulesets', 'APIs', 'Not conformant', 'Notifications', 'Blocks publishing']}
        empty="No profiles yet. Create one to start validating APIs."
        rows={profiles.map((p) => {
          const list = profileRows(state, p, parseRaml)
          return (
            <tr key={p.id}>
              <td><Link onClick={() => go({ page: 'Profiles', profile: p.id })}>{p.name}</Link></td>
              <td>{criteriaText(p)}</td>
              <td>{p.rulesets.join(', ')}</td>
              <td>{list.length}</td>
              <td>{list.filter((r) => r.status === 'Not conformant').length}</td>
              <td>{p.notify ? p.recipients : 'Off'}</td>
              <td>{p.block ? 'Yes (lab option)' : 'No'}</td>
            </tr>
          )
        })}
      />
      {creating && <ProfileForm state={state} update={update} onClose={() => setCreating(false)} onDone={(id) => (setCreating(false), go({ page: 'Profiles', profile: id }))} />}
    </>
  )
}

function ProfileView({ id, state, update, go }) {
  const p = profileById(state, id)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  if (!p)
    return (
      <>
        <Link onClick={() => go({ page: 'Profiles' })}>← Profiles</Link>
        <p className="pc-empty pc-boxed">This profile does not exist.</p>
      </>
    )
  const list = profileRows(state, p, parseRaml)
  return (
    <>
      <Link onClick={() => go({ page: 'Profiles' })}>← Profiles</Link>
      <div className="pc-bar">
        <h2 className="pc-grow">{p.name}</h2>
        <Btn onClick={() => setEditing(true)}>Edit profile</Btn>
        <Btn kind="danger" onClick={() => setDeleting(true)}>Delete profile</Btn>
      </div>
      {p.description && <p>{p.description}</p>}
      <dl className="gov-facts">
        <dt>Filter criteria</dt>
        <dd>{criteriaText(p)}</dd>
        <dt>Rulesets</dt>
        <dd>{p.rulesets.join(', ')}</dd>
        <dt>Notifications</dt>
        <dd>{p.notify ? `On, to ${p.recipients}` : 'Off'}</dd>
        <dt>Block publishing</dt>
        <dd>{p.block ? 'Yes. A Design Center publish that breaks a rule with severity error is refused (a lab option).' : 'No. Conformance is reported only.'}</dd>
        <dt>Created</dt>
        <dd>{dayText(p.created ?? 0)}</dd>
      </dl>
      <h3>APIs in this profile</h3>
      <Table
        heads={['API', 'Version', 'Conformance', 'Errors', 'Warnings']}
        empty="The filter criteria select no API."
        rows={list.map((r) => (
          <tr key={r.assetId}>
            <td><Link onClick={() => go({ page: 'APIs', api: r.assetId })}>{r.name}</Link></td>
            <td>{r.version}</td>
            <td><Status value={r.status} /></td>
            <td>{r.issues.filter((i) => i.severity === 'error').length}</td>
            <td>{r.issues.filter((i) => i.severity === 'warning').length}</td>
          </tr>
        ))}
      />
      {editing && <ProfileForm state={state} update={update} profile={p} onClose={() => setEditing(false)} onDone={() => setEditing(false)} />}
      {deleting && (
        <Modal
          title="Delete profile"
          onClose={() => setDeleting(false)}
          foot={
            <>
              <Btn onClick={() => setDeleting(false)}>Cancel</Btn>
              <Btn kind="danger" onClick={() => { update((s) => deleteProfile(s, p.id)); go({ page: 'Profiles' }) }}>Delete</Btn>
            </>
          }
        >
          <p>Delete {p.name}? Its {list.length} APIs are no longer validated by it.</p>
        </Modal>
      )}
    </>
  )
}

const blank = { name: '', description: '', rulesets: [], criteria: { by: 'all', value: '', lifecycles: ['development', 'stable'] }, notify: false, recipients: '', block: false }

function ProfileForm({ state, update, profile, onClose, onDone }) {
  const [f, setF] = useState(() => structuredClone(profile ?? blank))
  const [errors, setErrors] = useState([])
  const set = (patch) => setF({ ...f, ...patch })
  const crit = (patch) => setF({ ...f, criteria: { ...f.criteria, ...patch } })
  const toggle = (arr, x, on) => (on ? [...new Set([...arr, x])] : arr.filter((y) => y !== x))
  const count = [...new Set(state.assets.map((a) => a.assetId))].map((id) => latestOf(state, id)).filter((a) => selects(f, state, a)).length
  function save() {
    const r = profile ? updateProfile(state, profile.id, f, parseRaml) : createProfile(state, f, parseRaml)
    setErrors(r.errors)
    if (r.errors.length) return
    update(() => r.state)
    onDone(r.id ?? profile.id)
  }
  return (
    <Modal
      wide
      title={profile ? `Edit ${profile.name}` : 'Create profile'}
      onClose={onClose}
      foot={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={save}>{profile ? 'Save changes' : 'Create profile'}</Btn>
        </>
      }
    >
      <div className="pc-two">
        <div>
          <Field label="Profile name" required>
            <Input value={f.name} onChange={(name) => set({ name })} placeholder="System API security" />
          </Field>
          <Field label="Description">
            <Input value={f.description} onChange={(description) => set({ description })} />
          </Field>
          <fieldset className="gov-set">
            <legend>Rulesets</legend>
            {RULESETS.map((r) => (
              <Check key={r.name} checked={f.rulesets.includes(r.name)} onChange={(on) => set({ rulesets: toggle(f.rulesets, r.name, on) })}>
                {r.name} <small className="pc-dim">{r.rules.length} rules</small>
              </Check>
            ))}
          </fieldset>
        </div>
        <div>
          <fieldset className="gov-set">
            <legend>Filter criteria</legend>
            <Field label="Filter by">
              <Select value={f.criteria.by} onChange={(by) => crit({ by, value: by === 'category' ? 'System' : '' })} options={[['all', 'All APIs'], ['category', 'Category: API layer'], ['tag', 'Tag']]} />
            </Field>
            {f.criteria.by === 'category' && (
              <Field label="Value">
                <Select value={f.criteria.value} onChange={(value) => crit({ value })} options={LAYERS} />
              </Field>
            )}
            {f.criteria.by === 'tag' && (
              <Field label="Value">
                <Input value={f.criteria.value} onChange={(value) => crit({ value })} placeholder="Payments" />
              </Field>
            )}
            <span className="pc-label">Lifecycle states</span>
            {LIFECYCLE_STATES.map((x) => (
              <Check key={x} checked={f.criteria.lifecycles.includes(x)} onChange={(on) => crit({ lifecycles: toggle(f.criteria.lifecycles, x, on) })}>
                {life(x)}
              </Check>
            ))}
            <p className="pc-dim">The newest version of {count} API{count === 1 ? '' : 's'} matches.</p>
          </fieldset>
          <fieldset className="gov-set">
            <legend>Notifications</legend>
            <Check checked={f.notify} onChange={(notify) => set({ notify })}>Send notifications</Check>
            {f.notify && (
              <Field label="Recipients" hint="Email addresses, separated by commas">
                <Input value={f.recipients} onChange={(recipients) => set({ recipients })} placeholder="architecture@brightmart.example" />
              </Field>
            )}
          </fieldset>
          <Check checked={f.block} onChange={(block) => set({ block })}>Block publishing (lab option)</Check>
          <Note>Lab option. Real Anypoint reports conformance and does not stop a publish. Teams make the rules a gate with {CLI} in CI.</Note>
        </div>
      </div>
      <Errors list={errors} />
    </Modal>
  )
}

// ---------- Rulesets ----------

function Rulesets({ update }) {
  useEffect(() => update((s) => mark(s, 'gov:rulesets')), [update])
  return (
    <>
      <h2>Rulesets</h2>
      <p className="pc-dim">Rulesets are assets in Exchange. These are published by MuleSoft. In the lab each one holds a small set of rules for RAML.</p>
      {RULESETS.map((r) => (
        <section key={r.name} className="gov-ruleset">
          <h3>{r.name}</h3>
          <p className="pc-dim">
            {r.publisher}. {r.text}
          </p>
          <Table
            heads={['Rule', 'Severity', 'What it checks']}
            rows={r.rules.map((x) => (
              <tr key={x.id}>
                <td>
                  {x.title}
                  <br />
                  <small className="pc-mono pc-dim">{x.id}</small>
                </td>
                <td><Severity value={x.severity} /></td>
                <td>{x.text}</td>
              </tr>
            ))}
          />
        </section>
      ))}
    </>
  )
}

// ---------- APIs ----------

function Apis({ rows, go }) {
  const [status, setStatus] = useState('')
  const [term, setTerm] = useState('')
  const shown = rows.filter((r) => (!status || r.status === status) && `${r.name} ${r.assetId}`.toLowerCase().includes(term.trim().toLowerCase()))
  return (
    <>
      <h2>APIs</h2>
      <div className="pc-bar">
        <Input value={term} onChange={setTerm} placeholder="Search APIs" aria-label="Search APIs" />
        <Select value={status} onChange={setStatus} placeholder="All statuses" options={['Conformant', 'Not conformant', 'Not validated']} aria-label="Conformance" />
      </div>
      <Table
        heads={['API', 'Version', 'API layer', 'Profiles', 'Conformance', 'Errors', 'Warnings']}
        empty="No API matches."
        rows={shown.map((r) => (
          <tr key={r.assetId}>
            <td><Link onClick={() => go({ page: 'APIs', api: r.assetId })}>{r.name}</Link><br /><small className="pc-dim">{r.assetId}</small></td>
            <td>{r.version}</td>
            <td>{r.layer || 'None'}</td>
            <td>{r.profiles.map((x) => x.profile.name).join(', ') || 'None'}</td>
            <td><Status value={r.status} /></td>
            <td>{r.errors}</td>
            <td>{r.warnings}</td>
          </tr>
        ))}
      />
    </>
  )
}

function Issues({ issues }) {
  return (
    <Table
      heads={['Severity', 'Ruleset', 'Rule', 'Location', 'Message']}
      empty="No issues."
      rows={issues.map((i) => (
        <tr key={`${i.rule}|${i.location}|${i.message}`}>
          <td><Severity value={i.severity} /></td>
          <td>{i.ruleset}</td>
          <td>{i.title}</td>
          <td className="pc-mono">{i.location}</td>
          <td>{i.message}</td>
        </tr>
      ))}
    />
  )
}

function ApiView({ id, state, update, go }) {
  const versions = state.assets.filter((a) => a.assetId === id)
  const [version, setVersion] = useState(versions.at(-1)?.version ?? '')
  const asset = versions.find((a) => a.version === version) ?? versions.at(-1)
  useEffect(() => {
    if (asset) update((s) => mark(mark(s, `gov:api:${id}`), `gov:api:${id}:${asset.version}`))
  }, [id, asset?.version, update]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!asset)
    return (
      <>
        <Link onClick={() => go({ page: 'APIs' })}>← APIs</Link>
        <p className="pc-empty pc-boxed">This API is not in Exchange.</p>
      </>
    )
  const c = conformanceOf(state, asset, parseRaml)
  const project = state.projects.find((p) => p.assetId === id)
  const latest = versions.at(-1)
  const draft = project?.raml && project.raml !== latest.raml ? conformanceOf(state, { ...latest, raml: project.raml }, parseRaml) : null
  const cli = cliRun(state, asset, parseRaml)
  return (
    <>
      <Link onClick={() => go({ page: 'APIs' })}>← APIs</Link>
      <div className="pc-bar">
        <div className="pc-grow">
          <h2>{asset.name}</h2>
          <span className="pc-dim">
            {asset.assetId}, API layer {layerOf(state, asset.assetId, asset.name) || 'None'}, lifecycle {asset.lifecycle ?? 'stable'}, published {dayText(asset.t ?? 0)}
          </span>
        </div>
        <Select value={asset.version} onChange={setVersion} options={[...versions].reverse().map((a) => [a.version, `${a.version}, ${a.apiVersion}`])} aria-label="Version" />
        {project && <Btn onClick={() => go({ product: 'Design Center', project: project.id })}>Open in Design Center</Btn>}
        <Btn onClick={() => go({ product: 'Exchange', asset: id })}>View in Exchange</Btn>
      </div>
      <p>
        Version {asset.version}: <Status value={c.status} /> {c.status !== 'Not validated' && <span className="pc-dim">{c.errors} errors, {c.warnings} warnings, {c.infos} info</span>}
      </p>
      {c.status === 'Not validated' && <Note>No governance profile selects this API version, so no ruleset runs on it.</Note>}
      {c.profiles.length > 0 && (
        <>
          <h3>Profiles</h3>
          <Table
            heads={['Profile', 'Rulesets', 'Conformance', 'Errors']}
            rows={c.profiles.map((r) => (
              <tr key={r.profile.id}>
                <td><Link onClick={() => go({ page: 'Profiles', profile: r.profile.id })}>{r.profile.name}</Link></td>
                <td>{r.profile.rulesets.join(', ')}</td>
                <td><Status value={r.status} /></td>
                <td>{r.issues.filter((i) => i.severity === 'error').length}</td>
              </tr>
            ))}
          />
          <h3>Issues</h3>
          <Issues issues={c.issues} />
        </>
      )}
      {draft && (
        <section className="gov-draft">
          <h3>Design Center draft</h3>
          <p>
            The project {project.name} has changes that are not published. Against the same profiles the draft is <Status value={draft.status} />
          </p>
          {draft.profiles.length > 0 && <Issues issues={draft.issues} />}
        </section>
      )}
      <h3>In a pipeline</h3>
      <p className="pc-dim">The same rulesets run in CI with the Anypoint CLI. A rule with severity error ends the command with exit code 1, which fails the build. The flags here are shortened for the lab.</p>
      <pre className="pc-pre gov-cli">{cli.lines.join('\n')}</pre>
    </>
  )
}
