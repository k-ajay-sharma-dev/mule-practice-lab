// Epic (FHIR): the Epic side of Bayview Health, a fictional hospital. Backend apps holds the SMART backend services
// registrations with their client IDs, incoming APIs (scopes) and public keys, as on the Build Apps page of Epic on FHIR.
// Brightmart keys is a lab tool for the signing keys in the key store of the Brightmart apps. The FHIR browser runs R4 queries
// as an Epic analyst, the Audit log lists the FHIR calls of the apps, and Token requests the calls to the token endpoint
// with the reason Epic gives in its own log. The rules live in lab/platform-epic.js.
import { useEffect, useState } from 'react'
import { mark, stamp, timeText } from '../../lab/platform.js'
import {
  addPublicKey, appOf, BASE, browse, createBackendApp, generateKeyPair, BRIGHTMART_JWKS, isFilled, MAX_COUNT, MAX_EXP, ORG, publicJwk, publicKeysOf, RATE, removePublicKey, SCOPES, setAppScopes, setInJwks, setJwksUrl, TOKEN_URL,
  upgradeEpic,
} from '../../lab/platform-epic.js'
import { Btn, Check, Field, Input, Link, Note, Select, SideNav, Table } from './parts.jsx'

const VIEWS = ['Backend apps', 'Brightmart keys', 'FHIR browser', 'Audit log', 'Token requests']
const SEEN = { 'Backend apps': 'epic:apps', 'Brightmart keys': 'epic:keys', 'Audit log': 'epic:audit', 'Token requests': 'epic:tokens' }
const json = (v) => JSON.stringify(v, null, 2)
const Status = ({ code }) => <span className={`ep-code ep-${code >= 400 || code === 0 ? 'bad' : 'good'}`}>{code}</span>

export default function EpicFhir({ state, update, place, go }) {
  const y = state.epic
  const view = VIEWS.includes(place?.view) ? place.view : 'Backend apps'
  // a save from before Epic was built, or the open console, holds a placeholder: build the system on first open
  useEffect(() => {
    if (y && !isFilled(y)) update((s) => upgradeEpic(s))
  }, [y, update])
  useEffect(() => {
    if (isFilled(y) && SEEN[view]) update((s) => mark(s, SEEN[view]))
  }, [view, Boolean(isFilled(y))]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!y)
    return (
      <main className="pc-main">
        <h2>Epic (FHIR)</h2>
        <p className="pc-empty pc-boxed">This lab has no Epic system.</p>
      </main>
    )
  if (!isFilled(y)) return <main className="pc-main">Starting Epic...</main>
  // runs an action on the current state, saves its state and gives back its result
  const act = (fn) => {
    const r = fn(state)
    update(() => r.state)
    return r.result
  }
  const props = { y, state, update, act, place, go }
  const nameOf = (clientId) => appOf(y, clientId)?.name ?? clientId
  return (
    <>
      <SideNav items={[{ title: 'Epic on FHIR' }, ...VIEWS.map((v) => [v, v])]} value={view} onPick={(v) => go({ view: v })} />
      <main className="pc-main ep-main">
        <header className="ep-bar">
          <b>Epic</b>
          <span>{ORG}</span>
          <span className="ep-env">Non-production</span>
          <span className="ep-clock">FHIR R4 | {timeText(state.clock)}</span>
        </header>
        {view === 'Backend apps' && (place?.app && appOf(y, place.app) ? <AppPage key={place.app} {...props} a={appOf(y, place.app)} /> : <AppList {...props} />)}
        {view === 'Brightmart keys' && <Keys {...props} />}
        {view === 'FHIR browser' && <Browser {...props} />}
        {view === 'Audit log' && <Audit y={y} nameOf={nameOf} />}
        {view === 'Token requests' && <Tokens y={y} nameOf={nameOf} />}
      </main>
    </>
  )
}

// ---------- backend apps ----------

function AppList({ y, act, go }) {
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)
  const create = () => {
    const r = act((s) => createBackendApp(s, form))
    setMsg(r)
    if (r.ok) {
      setForm(null)
      go({ view: 'Backend apps', app: r.clientId })
    }
  }
  return (
    <>
      <div className="pc-title">
        <h2>Backend apps</h2>
        {!form && (
          <Btn kind="primary" onClick={() => (setForm({ name: '', audience: 'Backend Systems' }), setMsg(null))}>
            Create
          </Btn>
        )}
      </div>
      <p className="pc-dim">Apps that call the FHIR APIs of {ORG} without a user: SMART backend services. Each app signs a JWT with its private key and trades it for an access token at the token endpoint.</p>
      {form && (
        <section className="ep-card">
          <h3>Create app</h3>
          <div className="ep-grid">
            <Field label="Application name" required>
              <Input value={form.name} onChange={(name) => setForm({ ...form, name })} aria-label="Application name" />
            </Field>
            <Field label="Application audience" hint="Who uses the app. A backend app runs without a user.">
              <Select value={form.audience} onChange={(audience) => setForm({ ...form, audience })} options={['Backend Systems', 'Clinicians or Administrative Users', 'Patients']} />
            </Field>
          </div>
          <div className="ep-row">
            <Btn kind="primary" onClick={create}>
              Create app
            </Btn>
            <Btn onClick={() => setForm(null)}>Cancel</Btn>
          </div>
        </section>
      )}
      {msg && <p className={msg.ok ? 'ep-ok' : 'ep-err'} role="status">{msg.text}</p>}
      <Table
        heads={['Application name', 'Audience', 'Non-production client ID', 'Incoming APIs', 'Public keys']}
        empty="No backend apps yet"
        rows={y.apps.map((a) => (
          <tr key={a.clientId}>
            <td>
              <Link onClick={() => go({ view: 'Backend apps', app: a.clientId })}>{a.name}</Link>
            </td>
            <td>{a.audience}</td>
            <td className="ep-mono">{a.clientId}</td>
            <td>{a.scopes.length ? a.scopes.join(', ') : 'None'}</td>
            <td>{publicKeysOf(y, a).map((k) => k.kid).join(', ') || 'None'}</td>
          </tr>
        ))}
      />
    </>
  )
}

function AppPage({ y, a, act, go }) {
  const [scopes, setScopes] = useState(a.scopes)
  const [pick, setPick] = useState('')
  const [url, setUrl] = useState(a.jwksUrl)
  const [msg, setMsg] = useState(null)
  const run = (fn) => setMsg(act(fn))
  const keys = publicKeysOf(y, a)
  return (
    <>
      <p className="pc-dim">
        <Link onClick={() => go({ view: 'Backend apps' })}>Backend apps</Link> / {a.name}
      </p>
      <h2>{a.name}</h2>
      {msg && <p className={msg.ok ? 'ep-ok' : 'ep-err'} role="status">{msg.text}</p>}
      <dl className="ep-dl">
        {[
          ['Non-production client ID', a.clientId],
          ['Client ID (production)', a.prodId],
          ['Application audience', a.audience],
          ['Token endpoint', TOKEN_URL],
          ['FHIR base URL', BASE],
          ['Created', `${stamp(a.t)} by ${a.by}`],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="ep-mono">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="ep-card">
        <h3>Incoming APIs</h3>
        <p className="pc-dim">The APIs the app may call. The token carries the SMART scope of each. Pick only what the use case needs.</p>
        {SCOPES.map(([sc, apis]) => (
          <Check key={sc} checked={scopes.includes(sc)} onChange={(on) => setScopes(on ? [...scopes, sc] : scopes.filter((x) => x !== sc))}>
            <code>{sc}</code> <small className="pc-dim">{apis}</small>
          </Check>
        ))}
        <div className="ep-row">
          <Btn kind="primary" onClick={() => run((s) => setAppScopes(s, a.clientId, scopes))}>
            Save APIs
          </Btn>
        </div>
      </section>

      <section className="ep-card">
        <h3>Public keys</h3>
        <p className="pc-dim">Epic checks the signature of the JWT with the public key whose kid is in the JWT header. Only public keys go here.</p>
        <Table
          heads={['kid', 'Thumbprint', 'Source', '']}
          empty="No public key. Every token request gets invalid_client."
          rows={keys.map((k) => (
            <tr key={`${k.kid}${k.jwks ? 'j' : ''}`}>
              <td className="ep-mono">{k.kid}</td>
              <td className="ep-mono">{k.thumb.slice(0, 16)}...</td>
              <td>{k.jwks ? 'JWK Set URL' : `Uploaded ${stamp(k.t)}`}</td>
              <td>{!k.jwks && <Btn onClick={() => run((s) => removePublicKey(s, a.clientId, k.kid))}>Remove</Btn>}</td>
            </tr>
          ))}
        />
        <div className="ep-grid">
          <Field label="Brightmart public key" hint="From Brightmart keys. Only the public part is sent.">
            <Select value={pick} onChange={setPick} placeholder="Pick a kid" options={y.keystore.map((k) => k.kid)} />
          </Field>
          <div className="ep-row ep-end">
            <Btn disabled={!pick} onClick={() => run((s) => addPublicKey(s, a.clientId, pick))}>
              Add public key
            </Btn>
          </div>
          <Field label="Non-Production JWK Set URL" hint={`Epic fetches the keys from this URL. Brightmart publishes at ${BRIGHTMART_JWKS}`}>
            <Input value={url} onChange={setUrl} aria-label="Non-Production JWK Set URL" />
          </Field>
          <div className="ep-row ep-end">
            <Btn onClick={() => run((s) => setJwksUrl(s, a.clientId, url))}>Save URL</Btn>
          </div>
        </div>
      </section>

      <section className="ep-card">
        <h3>In the Mule app</h3>
        <p className="pc-dim">The properties a Brightmart app needs for this registration. The key store password is a protected property.</p>
        <Table
          heads={['Property', 'Value']}
          rows={[
            ['epic.tokenUrl', TOKEN_URL],
            ['epic.fhirBase', BASE],
            ['epic.clientId', a.clientId],
            ['epic.jwt.keyAlias', 'the alias of the private key in the key store'],
            ['epic.jwt.kid', keys.map((k) => k.kid).join(' or ') || 'the kid of a public key above'],
            ['epic.jwt.alg', 'RS384'],
            ['epic.jwt.expSeconds', `${MAX_EXP} or less`],
            ['epic.scopes', a.scopes.join(' ') || 'empty means every API of the app'],
            ['epic.keystore.password', 'protected'],
          ].map(([k, v]) => (
            <tr key={k}>
              <td className="ep-mono">{k}</td>
              <td className="ep-mono">{v}</td>
            </tr>
          ))}
        />
      </section>
    </>
  )
}

// ---------- Brightmart keys ----------

function Keys({ y, act }) {
  const [form, setForm] = useState({ alias: '', kid: '' })
  const [msg, setMsg] = useState(null)
  const [show, setShow] = useState(null)
  const users = (kid) => y.apps.filter((a) => publicKeysOf(y, a).some((k) => k.kid === kid)).map((a) => a.name)
  return (
    <>
      <h2>Brightmart keys</h2>
      <Note>Lab tool: the signing keys in the key store of the Brightmart apps. The private key never leaves Brightmart; Epic gets the public JWK. Keys marked Published in JWKS are served at {BRIGHTMART_JWKS}.</Note>
      {msg && <p className={msg.ok ? 'ep-ok' : 'ep-err'} role="status">{msg.text}</p>}
      <Table
        heads={['Alias', 'Key ID (kid)', 'Thumbprint', 'Created', 'Published in JWKS', 'Used by', '']}
        empty="The key store is empty"
        rows={y.keystore.map((k) => (
          <tr key={k.alias}>
            <td className="ep-mono">{k.alias}</td>
            <td className="ep-mono">{k.kid}</td>
            <td className="ep-mono">{k.thumb.slice(0, 16)}...</td>
            <td>{stamp(k.t)}</td>
            <td>
              <Check checked={k.jwks} onChange={(on) => setMsg(act((s) => setInJwks(s, k.alias, on)))}>
                <span className="pc-dim">{k.jwks ? 'Yes' : 'No'}</span>
              </Check>
            </td>
            <td>{users(k.kid).join(', ') || 'No app'}</td>
            <td>
              <Btn onClick={() => setShow(show === k.alias ? null : k.alias)}>{show === k.alias ? 'Hide' : 'Show public JWK'}</Btn>
            </td>
          </tr>
        ))}
      />
      {show && y.keystore.find((k) => k.alias === show) && <pre className="ep-pre">{json(publicJwk(y.keystore.find((k) => k.alias === show)))}</pre>}
      <section className="ep-card">
        <h3>Generate key pair</h3>
        <div className="ep-grid">
          <Field label="Alias" required>
            <Input value={form.alias} onChange={(alias) => setForm({ ...form, alias })} aria-label="Alias" />
          </Field>
          <Field label="Key ID (kid)" hint="Empty means the alias">
            <Input value={form.kid} onChange={(kid) => setForm({ ...form, kid })} aria-label="Key ID (kid)" />
          </Field>
        </div>
        <div className="ep-row">
          <Btn
            kind="primary"
            onClick={() => {
              const r = act((s) => generateKeyPair(s, form))
              setMsg(r)
              if (r.ok) setForm({ alias: '', kid: '' })
            }}
          >
            Generate key pair
          </Btn>
        </div>
      </section>
    </>
  )
}

// ---------- FHIR browser ----------

function Browser({ y, act }) {
  const [q, setQ] = useState('Patient?identifier=MRN|203711')
  const [res, setRes] = useState(null)
  // the seen keys go on the state that browse is given, so they are saved with its result
  const run = (text, paged = false) => {
    const r = act((s) => browse(mark(paged ? mark(s, 'epic:next') : s, 'epic:browser'), text))
    setRes(r)
    setQ(String(text).replace(`${BASE}/`, ''))
  }
  const body = res?.body
  const nextUrl = body?.resourceType === 'Bundle' ? body.link?.find((l) => l.relation === 'next')?.url : null
  const examples = [
    'Patient?identifier=MRN|203711',
    'Patient?family=Quint',
    `Observation?patient=${y.patients[0].id}&category=vital-signs`,
    `Observation?patient=${y.patients[0].id}&category=laboratory`,
    `Encounter?patient=${y.patients[0].id}`,
    `Appointment?patient=${y.patients[1].id}`,
  ]
  return (
    <>
      <h2>FHIR browser</h2>
      <p className="pc-dim">
        Runs a FHIR R4 query as an Epic analyst of {ORG}, without a token and outside the rate limit of the apps. Pages hold {MAX_COUNT} entries at most.
      </p>
      <form
        className="ep-query"
        onSubmit={(e) => {
          e.preventDefault()
          run(q)
        }}
      >
        <span className="ep-mono ep-get">GET {BASE}/</span>
        <input className="pc-input ep-mono" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Query" placeholder="Patient?identifier=MRN|203711" />
        <Btn kind="primary" type="submit">
          Send
        </Btn>
      </form>
      <p className="ep-examples">
        {examples.map((x) => (
          <button key={x} type="button" className="pc-link" onClick={() => setQ(x)}>
            {x.length > 60 ? `${x.slice(0, 60)}...` : x}
          </button>
        ))}
      </p>
      {res && (
        <section className="ep-card" aria-label="Response">
          <p>
            <Status code={res.status} /> {body?.resourceType}
            {body?.resourceType === 'Bundle' && (
              <>
                {' '}
                type {body.type}, total <b>{body.total}</b>, {body.entry.length} entries on this page{nextUrl ? ', link next' : ', no link next'}
              </>
            )}
          </p>
          {nextUrl && (
            <div className="ep-row">
              <Btn kind="primary" onClick={() => run(nextUrl, true)}>
                Follow link next
              </Btn>
              <span className="ep-mono pc-dim">{nextUrl.replace(BASE, '')}</span>
            </div>
          )}
          {body?.resourceType === 'Bundle' && body.entry.length > 0 && (
            <Table
              heads={['Resource', 'Summary', '']}
              rows={body.entry.map(({ resource: r }) => (
                <tr key={r.id}>
                  <td className="ep-mono">
                    {r.resourceType}/{r.id}
                  </td>
                  <td>{summary(r)}</td>
                  <td>
                    {r.resourceType === 'Patient' && (
                      <span className="ep-row">
                        <Btn onClick={() => run(`Observation?patient=${r.id}&category=vital-signs`)}>Vital signs</Btn>
                        <Btn onClick={() => run(`Observation?patient=${r.id}&category=laboratory`)}>Labs</Btn>
                        <Btn onClick={() => run(`Encounter?patient=${r.id}`)}>Encounters</Btn>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            />
          )}
          <details>
            <summary>JSON</summary>
            <pre className="ep-pre">{json(body)}</pre>
          </details>
        </section>
      )}
    </>
  )
}
function summary(r) {
  if (r.resourceType === 'Patient') return `${r.name?.[0]?.text}, ${r.gender}, born ${r.birthDate}, MRN ${r.identifier?.[0]?.value}`
  if (r.resourceType === 'Observation') return `${r.code.text} (LOINC ${r.code.coding[0].code}): ${r.valueQuantity.value} ${r.valueQuantity.unit}, ${r.effectiveDateTime}`
  if (r.resourceType === 'Encounter') return `${r.class.display}, ${r.status}, ${r.type?.[0]?.text}, from ${r.period.start}`
  if (r.resourceType === 'Appointment') return `${r.description}, ${r.status}, ${r.start} with ${r.participant?.[1]?.actor?.display}`
  return r.resourceType
}

// ---------- logs ----------

function Audit({ y, nameOf }) {
  const [only, setOnly] = useState('')
  const rows = [...y.audit].reverse().filter((x) => !only || (only === 'errors' ? x.st >= 400 : String(x.st) === only))
  return (
    <>
      <h2>Audit log</h2>
      <p className="pc-dim">
        The FHIR API calls of the backend apps, newest first. Bayview allows {RATE.n} calls in {RATE.seconds} seconds per client (lab-made); more get 429 with Retry-After.
      </p>
      <Field label="Status">
        <Select value={only} onChange={setOnly} placeholder="All" options={[['errors', '4xx and 5xx'], '200', '201', '401', '403', '404', '409', '429']} />
      </Field>
      <Table
        heads={['Time', 'Backend app', 'Mule app', 'Method', 'URL', 'Status', 'ms', 'Reason']}
        empty="No API calls yet"
        rows={rows.map((x, i) => (
          <tr key={i}>
            <td>{stamp(x.t)}</td>
            <td>{x.c ? nameOf(x.c) : 'Unknown'}</td>
            <td>{x.app}</td>
            <td>{x.m}</td>
            <td className="ep-mono ep-url">{x.u}</td>
            <td>
              <Status code={x.st} />
            </td>
            <td>{x.ms}</td>
            <td>{x.why}</td>
          </tr>
        ))}
      />
    </>
  )
}

function Tokens({ y, nameOf }) {
  return (
    <>
      <h2>Token requests</h2>
      <p className="pc-dim">
        POST {TOKEN_URL} with grant_type client_credentials and a client_assertion JWT, newest first. The app gets only the error; the Reason is what the Epic team of Bayview sees in its log.
      </p>
      <Table
        heads={['Time', 'Backend app', 'Mule app', 'kid', 'alg', 'jti', 'Status', 'Error', 'Granted scope', 'Reason']}
        empty="No token requests yet"
        rows={[...y.tokenLog].reverse().map((x, i) => (
          <tr key={i}>
            <td>{stamp(x.t)}</td>
            <td>{nameOf(x.c) || 'Unknown client'}</td>
            <td>{x.app}</td>
            <td className="ep-mono">{x.kid}</td>
            <td>{x.alg}</td>
            <td className="ep-mono">{x.jti.slice(0, 10)}...</td>
            <td>
              <Status code={x.st} />
            </td>
            <td>{x.err}</td>
            <td className="ep-mono">{x.sc}</td>
            <td>{x.why}</td>
          </tr>
        ))}
      />
    </>
  )
}
