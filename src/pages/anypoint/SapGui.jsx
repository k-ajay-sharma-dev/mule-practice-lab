// SAP: an SAP GUI style screen of system HRP with a command field for transaction codes. WE02 and WE05 list IDocs with
// their control, data and status records, BD87 processes IDocs again, WE19 tests IDocs, SM58 shows the tRFC queue,
// SM59 the RFC destinations, SMGW the gateway, WE20, WE21 and BD54 the ALE setup, VA03, MMBE and XD03 the business
// data, SE37 runs function modules and SU01 keeps the users. The tab "In the Mule app" maps all of it to the SAP
// connector configuration of each app. A lab tool: one dialog user, BRIGHT_DEV, does everything.
import { useEffect, useMemo, useState } from 'react'
import { mark, stamp, timeText } from '../../lab/platform.js'
import {
  addInbound, addOutbound, AREA, areaText, availableOf, createDestination, createLogicalSystem, createPartner, createPort, createUser, deleteDestination, deleteLuws, executeLuws, FUNCTION_MODULES, GW_SERVICE, IDOC_TYPES,
  isFilled, MSG, orderedOf, partnerOf, processIdocs, PROCESS_CODES, registration, removeInbound, removeOutbound, requestSalesArea, SAP_HOST, sapCtx, setInboundTrigger, setNoFurther, statusLight, statusText, testDestination,
  testFunction, testInbound, testOutbound, unlockUser, upgradeSap, vbelnOf,
} from '../../lab/platform-sap.js'
import { Btn, Check, Field, Input, Select, Tabs, Table } from './parts.jsx'

const TRANSACTIONS = {
  SMEN: 'SAP Menu',
  WE02: 'IDoc List',
  WE05: 'IDoc List',
  WE19: 'Test Tool for IDoc Processing',
  BD87: 'Status Monitor for ALE Messages',
  SM58: 'Transactional RFC',
  SM59: 'Configuration of RFC Connections',
  SMGW: 'Gateway Monitor',
  WE20: 'Partner Profiles',
  WE21: 'Ports in IDoc processing',
  BD54: 'Logical Systems',
  VA03: 'Display Sales Order',
  MMBE: 'Stock Overview',
  SE37: 'Function Builder',
  XD03: 'Display Customer',
  SU01: 'User Maintenance',
}
const MENU = [
  ['Logistics', ['VA03', 'MMBE', 'XD03']],
  ['ALE and IDocs', ['WE02', 'WE05', 'BD87', 'WE19', 'WE20', 'WE21', 'BD54']],
  ['Communication', ['SM58', 'SM59', 'SMGW']],
  ['Development and users', ['SE37', 'SU01']],
]
const MESTYPES = Object.keys(IDOC_TYPES)
const AREAS = [AREA, '1000/20/00']
const json = (v) => JSON.stringify(v, null, 2)
const n0 = (v) => String(Number(v))

const Light = ({ c }) => <i className={`sg-light sg-${statusLight(c)}`} role="img" aria-label={`Status ${c}: ${statusText(c)}`} title={statusText(c)} />

export default function SapGui({ state, update, place }) {
  const y = state.sap
  const [view, setView] = useState(place?.view === 'mule' ? 'In the Mule app' : 'SAP GUI')
  const [tcode, setTcode] = useState(TRANSACTIONS[place?.tcode] ? place.tcode : 'SMEN')
  const [cmd, setCmd] = useState('')
  const [bar, setBar] = useState(null)

  // a save from before SAP was built, or the open console, holds a placeholder: build the system on first open
  useEffect(() => {
    if (y && !isFilled(y)) update((s) => upgradeSap(s))
  }, [y, update])
  useEffect(() => {
    if (!isFilled(y) || tcode === 'SMEN' || tcode === 'VA03') return
    update((s) => mark(tcode === 'WE05' ? mark(s, 'sap:WE02') : s, `sap:${tcode}`))
  }, [tcode, Boolean(isFilled(y))]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!y)
    return (
      <main className="pc-main">
        <h2>SAP</h2>
        <p className="pc-empty pc-boxed">This lab has no SAP system.</p>
      </main>
    )
  if (!isFilled(y)) return <main className="pc-main">Starting SAP...</main>

  const msg = (type, text) => setBar({ type, text })
  const go = (raw) => {
    const code = String(raw ?? '').trim().toUpperCase().replace(/^\/[NO]/, '')
    if (!code) return
    if (!TRANSACTIONS[code]) return msg('E', `Transaction ${code} does not exist`)
    setBar(null)
    setTcode(code)
  }
  // runs an action on the current state, saves its state and gives back its result
  const act = (fn) => {
    const r = fn(state)
    update(() => r.state)
    return r.result
  }
  const props = { y, state, update, act, msg, go }

  return (
    <main className="pc-main sg-app">
      <Tabs tabs={['SAP GUI', 'In the Mule app']} value={view} onChange={setView} />
      {view === 'In the Mule app' ? (
        <InMule state={state} />
      ) : (
        <div className="sg-window">
          <div className="sg-menubar" aria-hidden="true">
            <span>Menu</span>
            <span>Edit</span>
            <span>Favorites</span>
            <span>Extras</span>
            <span>System</span>
            <span>Help</span>
          </div>
          <form
            className="sg-toolbar"
            onSubmit={(e) => {
              e.preventDefault()
              go(cmd)
              setCmd('')
            }}
          >
            <input className="sg-cmd" value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="Command field, such as WE02" aria-label="Command field" />
            <button type="submit" className="sg-tool" title="Enter">
              Enter
            </button>
            <button type="button" className="sg-tool" onClick={() => go('SMEN')} disabled={tcode === 'SMEN'}>
              Back
            </button>
            <span className="sg-sys">
              {y.sid} ({y.client}) {SAP_HOST}
            </span>
          </form>
          <h2 className="sg-title">
            {TRANSACTIONS[tcode]}
            {tcode !== 'SMEN' && <small> {tcode}</small>}
          </h2>
          <div className="sg-body">
            {tcode === 'SMEN' && <Home go={go} />}
            {(tcode === 'WE02' || tcode === 'WE05') && <IdocList key={tcode} {...props} />}
            {tcode === 'BD87' && <Bd87 {...props} />}
            {tcode === 'WE19' && <We19 {...props} />}
            {tcode === 'SM58' && <Sm58 {...props} />}
            {tcode === 'SM59' && <Sm59 {...props} />}
            {tcode === 'SMGW' && <Smgw {...props} />}
            {tcode === 'WE20' && <We20 {...props} />}
            {tcode === 'WE21' && <We21 {...props} />}
            {tcode === 'BD54' && <Bd54 {...props} />}
            {tcode === 'VA03' && <Va03 {...props} />}
            {tcode === 'MMBE' && <Mmbe {...props} />}
            {tcode === 'SE37' && <Se37 {...props} />}
            {tcode === 'XD03' && <Xd03 {...props} />}
            {tcode === 'SU01' && <Su01 {...props} />}
          </div>
          <footer className={`sg-status ${bar ? `sg-${bar.type}` : ''}`} role="status">
            {bar && <b>{bar.type === 'E' ? 'Error' : bar.type === 'W' ? 'Warning' : 'Done'}</b>}
            <span>{bar?.text ?? ''}</span>
            <span className="sg-clock">
              {y.sid} | BRIGHT_DEV | {timeText(state.clock)}
            </span>
          </footer>
        </div>
      )}
    </main>
  )
}

function Home({ go }) {
  return (
    <nav className="sg-home" aria-label="SAP menu">
      {MENU.map(([group, codes]) => (
        <section key={group}>
          <h3>{group}</h3>
          <ul>
            {codes.map((c) => (
              <li key={c}>
                <button type="button" className="sg-link" onClick={() => go(c)}>
                  <code>{c}</code> {TRANSACTIONS[c]}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

// ---------- IDocs ----------

function IdocList({ y, go }) {
  const [f, setF] = useState({ dir: '', mestyp: '', status: '', partner: '' })
  const [ran, setRan] = useState(false)
  const [pick, setPick] = useState(null)
  const list = useMemo(
    () =>
      [...y.idocs]
        .filter((d) => (!f.dir || d.dir === f.dir) && (!f.mestyp || d.mestyp === f.mestyp) && (!f.status || d.status === f.status.padStart(2, '0')) && (!f.partner || [d.sndprn, d.rcvprn].includes(f.partner.toUpperCase())))
        .reverse(),
    [y.idocs, f],
  )
  const d = pick && y.idocs.find((x) => x.docnum === pick)
  if (d) return <IdocDetail d={d} back={() => setPick(null)} go={go} />
  const groups = ['in', 'out'].map((dir) => [dir, [...new Set(list.filter((x) => x.dir === dir).map((x) => x.status))].sort()])
  return (
    <>
      <form className="sg-select" onSubmit={(e) => (e.preventDefault(), setRan(true))}>
        <Field label="Direction">
          <Select value={f.dir} onChange={(dir) => setF({ ...f, dir })} options={[['', 'Both'], ['in', 'Inbound'], ['out', 'Outbound']]} />
        </Field>
        <Field label="Message type">
          <Select value={f.mestyp} onChange={(mestyp) => setF({ ...f, mestyp })} placeholder="All" options={MESTYPES} />
        </Field>
        <Field label="Current status">
          <Input value={f.status} onChange={(status) => setF({ ...f, status })} placeholder="such as 51" />
        </Field>
        <Field label="Partner number">
          <Input value={f.partner} onChange={(partner) => setF({ ...f, partner })} />
        </Field>
        <Btn kind="primary" type="submit">
          Execute
        </Btn>
      </form>
      {ran && (
        <>
          <div className="sg-tree" aria-label="IDocs by status">
            {groups.map(([dir, codes]) => (
              <div key={dir}>
                <b>{dir === 'in' ? 'Inbound IDocs' : 'Outbound IDocs'}</b>
                {codes.map((c) => (
                  <button key={c} type="button" className="sg-node" onClick={() => setF({ ...f, dir, status: c })}>
                    <Light c={c} /> {c} {statusText(c)} <span>{list.filter((x) => x.dir === dir && x.status === c).length}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <Table
            heads={['', 'IDoc number', 'Status', 'Message type', 'Basic type', 'Partner', 'Created', 'Last status message']}
            empty="No IDocs selected"
            rows={list.slice(0, 80).map((x) => (
              <tr key={x.docnum}>
                <td>
                  <Light c={x.status} />
                </td>
                <td>
                  <button type="button" className="sg-link" onClick={() => setPick(x.docnum)}>
                    {x.docnum}
                  </button>
                </td>
                <td>{x.status}</td>
                <td>{x.mestyp}</td>
                <td>{x.idoctp}</td>
                <td>{x.dir === 'in' ? x.sndprn : x.rcvprn}</td>
                <td>{stamp(x.t)}</td>
                <td>{x.hist.at(-1)?.m ?? statusText(x.status)}</td>
              </tr>
            ))}
          />
          {list.length > 80 && <p className="pc-dim">The first 80 of {list.length} IDocs. Narrow the selection.</p>}
        </>
      )}
    </>
  )
}

function IdocDetail({ d, back }) {
  const [seg, setSeg] = useState(0)
  const s = d.segs[seg]
  return (
    <div className="sg-idoc">
      <p>
        <Btn onClick={back}>Back to the list</Btn>
      </p>
      <div className="sg-split">
        <section aria-label="IDoc tree">
          <h3>
            IDoc {d.docnum} <Light c={d.status} />
          </h3>
          <h4>Control record</h4>
          <dl className="sg-dl">
            {[
              ['DOCNUM', d.docnum],
              ['IDOCTP', d.idoctp],
              ['MESTYP', d.mestyp],
              ['DIRECT', d.dir === 'in' ? '2 (inbound)' : '1 (outbound)'],
              ['SNDPOR', d.sndpor],
              ['SNDPRT', d.sndprt],
              ['SNDPRN', d.sndprn],
              ['RCVPOR', d.rcvpor],
              ['RCVPRN', d.rcvprn],
              ['STATUS', d.status],
              ['CREDAT', stamp(d.t)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || ' '}</dd>
              </div>
            ))}
          </dl>
          <h4>Data records</h4>
          <ul className="sg-segs">
            {d.segs.map(([name, level], i) => (
              <li key={i} style={{ paddingLeft: `${(level - 1) * 16}px` }}>
                <button type="button" className={`sg-link${i === seg ? ' on' : ''}`} onClick={() => setSeg(i)}>
                  {name}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          {s && (
            <>
              <h4>Segment {s[0]}</h4>
              <Table heads={['Field', 'Value']} rows={Object.entries(s[2]).map(([k, v]) => <tr key={k}><td>{k}</td><td><code>{String(v)}</code></td></tr>)} />
            </>
          )}
          <h4>Status records</h4>
          <Table
            heads={['', 'Status', 'Text', 'Message', 'Time']}
            rows={[...d.hist].reverse().map((h, i) => (
              <tr key={i}>
                <td>
                  <Light c={h.c} />
                </td>
                <td>{h.c}</td>
                <td>{statusText(h.c)}</td>
                <td>{h.m ?? ''}</td>
                <td>{stamp(h.t)}</td>
              </tr>
            ))}
          />
        </section>
      </div>
    </div>
  )
}

function Bd87({ y, act, msg }) {
  const [sel, setSel] = useState([])
  const [done, setDone] = useState([])
  const [open, setOpen] = useState({})
  const groups = ['in', 'out'].map((dir) => [dir, [...new Set(y.idocs.filter((d) => d.dir === dir).map((d) => d.status))].sort()])
  const of = (dir, c) => y.idocs.filter((d) => d.dir === dir && d.status === c)
  const toggle = (nums, on) => setSel((x) => (on ? [...new Set([...x, ...nums])] : x.filter((n) => !nums.includes(n))))
  const run = () => {
    const r = act((s) => processIdocs(s, sel))
    setDone(r)
    setSel([])
    const ok = r.filter((x) => x.status === '53').length
    msg(ok === r.length ? 'S' : 'W', `${r.length} IDoc${r.length === 1 ? '' : 's'} processed: ${ok} posted (53), ${r.length - ok} not posted`)
  }
  return (
    <>
      <div className="sg-actions">
        <Btn kind="primary" disabled={!sel.length} onClick={run}>
          Process
        </Btn>
        <span className="pc-dim">{sel.length} selected</span>
      </div>
      <div className="sg-tree sg-bd87">
        {groups.map(([dir, codes]) => (
          <div key={dir}>
            <b>{dir === 'in' ? 'IDoc in inbound processing' : 'IDoc in outbound processing'}</b>
            {codes.map((c) => {
              const list = of(dir, c)
              const nums = list.map((d) => d.docnum)
              const key = `${dir}${c}`
              return (
                <div key={c} className="sg-group">
                  <div className="sg-row">
                    <Check checked={nums.every((n) => sel.includes(n))} onChange={(on) => toggle(nums, on)} aria-label={`Select all IDocs in status ${c}`}>
                      <Light c={c} /> {c} {statusText(c)} ({list.length})
                    </Check>
                    <button type="button" className="sg-link" onClick={() => setOpen({ ...open, [key]: !open[key] })}>
                      {open[key] ? 'Hide IDocs' : 'Show IDocs'}
                    </button>
                  </div>
                  {open[key] && (
                    <ul>
                      {list.slice(-60).map((d) => (
                        <li key={d.docnum}>
                          <Check checked={sel.includes(d.docnum)} onChange={(on) => toggle([d.docnum], on)}>
                            {d.docnum} {d.mestyp} {d.ref} <small>{d.hist.at(-1)?.m ?? ''}</small>
                          </Check>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {done.length > 0 && (
        <>
          <h3>Processing log</h3>
          <Table heads={['', 'IDoc', 'Status', 'Message']} rows={done.map((r) => <tr key={r.docnum}><td><Light c={r.status} /></td><td>{r.docnum}</td><td>{r.status}</td><td>{r.m}</td></tr>)} />
        </>
      )}
    </>
  )
}

function We19({ y, act, msg }) {
  const [num, setNum] = useState('')
  const [segs, setSegs] = useState(null)
  const [src, setSrc] = useState('')
  const [res, setRes] = useState(null)
  const [out, setOut] = useState({ prn: y.partners[0]?.prn ?? '', mestyp: 'INVOIC' })
  const load = () => {
    const d = y.idocs.find((x) => x.docnum === num.trim().padStart(16, '0'))
    if (!d) return msg('E', `IDoc ${num} does not exist`)
    if (d.dir !== 'in') return msg('E', 'Pick an inbound IDoc as the template')
    setSrc(d.docnum)
    setSegs(structuredClone(d.segs))
    setRes(null)
  }
  const setField = (i, k, v) => setSegs(segs.map((s, j) => (j === i ? [s[0], s[1], { ...s[2], [k]: v }] : s)))
  return (
    <>
      <h3>Inbound test from an existing IDoc</h3>
      <form className="sg-select" onSubmit={(e) => (e.preventDefault(), load())}>
        <Field label="Existing IDoc">
          <Input value={num} onChange={setNum} />
        </Field>
        <Btn type="submit">Create</Btn>
      </form>
      {segs && (
        <>
          <p className="pc-dim">A copy of IDoc {src}. Change fields, then Standard inbound makes a NEW IDoc. The original keeps its status.</p>
          {segs.map(([name, level, fields], i) => (
            <fieldset key={i} className="sg-seg" style={{ marginLeft: `${(level - 1) * 16}px` }}>
              <legend>{name}</legend>
              {Object.entries(fields).map(([k, v]) => (
                <label key={k}>
                  <span>{k}</span>
                  <input className="pc-input" value={v} onChange={(e) => setField(i, k, e.target.value)} />
                </label>
              ))}
            </fieldset>
          ))}
          <div className="sg-actions">
            <Btn
              kind="primary"
              onClick={() => {
                const r = act((s) => testInbound(s, src, segs))
                setRes(r)
                msg(r.status === '53' ? 'S' : 'E', `IDoc ${r.docnum} created: status ${r.status}, ${r.m}`)
              }}
            >
              Standard inbound
            </Btn>
            {res && y.idocs.find((d) => d.docnum === src)?.status === '51' && (
              <Btn onClick={() => (act((s) => setNoFurther(s, [src])), msg('S', `IDoc ${src} set to 68 with RC1_IDOC_SET_STATUS`))}>Set original IDoc to 68</Btn>
            )}
          </div>
        </>
      )}
      <h3>Outbound test</h3>
      <div className="sg-select">
        <Field label="Partner">
          <Select value={out.prn} onChange={(prn) => setOut({ ...out, prn })} options={y.partners.map((p) => p.prn)} placeholder="Choose a partner" />
        </Field>
        <Field label="Message type">
          <Select value={out.mestyp} onChange={(mestyp) => setOut({ ...out, mestyp })} options={['INVOIC', 'DESADV', 'MATMAS']} />
        </Field>
        <Btn
          kind="primary"
          disabled={!out.prn}
          onClick={() => {
            const r = act((s) => testOutbound(s, out.prn, out.mestyp))
            msg(r.ok ? 'S' : 'E', r.text)
          }}
        >
          Send outbound IDoc
        </Btn>
      </div>
    </>
  )
}

// ---------- RFC ----------

function Sm58({ y, act, msg }) {
  const [sel, setSel] = useState([])
  return (
    <>
      <div className="sg-actions">
        <Btn kind="primary" disabled={!sel.length} onClick={() => { const r = act((s) => executeLuws(s, sel)); setSel([]); msg(r.left ? 'E' : 'S', `${r.ok} LUW${r.ok === 1 ? '' : 's'} executed, ${r.left} still in error`) }}>
          Execute LUW
        </Btn>
        <Btn disabled={!sel.length} onClick={() => { const n = act((s) => deleteLuws(s, sel)); setSel([]); msg('W', `${n} LUW${n === 1 ? '' : 's'} deleted. Their IDocs will not be sent again.`) }}>
          Delete
        </Btn>
      </div>
      <Table
        heads={['', 'Caller', 'Function module', 'Target system', 'Date and time', 'Status text', 'Transaction ID']}
        empty="No entries found"
        rows={y.trfc.map((e) => (
          <tr key={e.tid}>
            <td>
              <input type="checkbox" checked={sel.includes(e.tid)} onChange={(ev) => setSel(ev.target.checked ? [...sel, e.tid] : sel.filter((x) => x !== e.tid))} aria-label={`Select ${e.tid}`} />
            </td>
            <td>{e.user}</td>
            <td>{e.fm}</td>
            <td>{e.dest}</td>
            <td>{stamp(e.t)}</td>
            <td className={e.tries ? 'sg-bad' : ''}>{e.status}</td>
            <td>
              <code>{e.tid}</code>
            </td>
          </tr>
        ))}
      />
    </>
  )
}

function Sm59({ y, act, msg }) {
  const [pick, setPick] = useState(y.dests[0]?.name ?? '')
  const [test, setTest] = useState(null)
  const [f, setF] = useState(null)
  const d = y.dests.find((x) => x.name === pick)
  return (
    <div className="sg-split">
      <section>
        <div className="sg-actions">
          <Btn onClick={() => setF({ name: '', text: '', programId: '', gwhost: '', gwserv: '' })}>Create</Btn>
        </div>
        {[['3', 'ABAP Connections'], ['T', 'TCP/IP Connections']].map(([t, label]) => (
          <div key={t} className="sg-tree">
            <b>{label}</b>
            {y.dests.filter((x) => x.type === t).map((x) => (
              <button key={x.name} type="button" className={`sg-node${x.name === pick ? ' on' : ''}`} onClick={() => (setPick(x.name), setTest(null), setF(null))}>
                {x.name} <span>{x.text}</span>
              </button>
            ))}
          </div>
        ))}
      </section>
      <section>
        {f ? (
          <form
            className="sg-form"
            onSubmit={(e) => {
              e.preventDefault()
              const r = act((s) => createDestination(s, f))
              msg(r.ok ? 'S' : 'E', r.text)
              if (r.ok) setPick(f.name.trim().toUpperCase()), setF(null)
            }}
          >
            <h3>New RFC destination, connection type T</h3>
            <Field label="RFC Destination"><Input value={f.name} onChange={(name) => setF({ ...f, name })} /></Field>
            <Field label="Description"><Input value={f.text} onChange={(text) => setF({ ...f, text })} /></Field>
            <p className="pc-dim">Technical Settings, Activation Type: Registered Server Program</p>
            <Field label="Program ID"><Input value={f.programId} onChange={(programId) => setF({ ...f, programId })} /></Field>
            <Field label="Gateway Host"><Input value={f.gwhost} onChange={(gwhost) => setF({ ...f, gwhost })} /></Field>
            <Field label="Gateway Service"><Input value={f.gwserv} onChange={(gwserv) => setF({ ...f, gwserv })} /></Field>
            <div className="sg-actions">
              <Btn kind="primary" type="submit">Save</Btn>
              <Btn onClick={() => setF(null)}>Cancel</Btn>
            </div>
          </form>
        ) : d ? (
          <>
            <h3>
              {d.name} <small>Connection type {d.type}</small>
            </h3>
            <dl className="sg-dl">
              <div><dt>Description</dt><dd>{d.text}</dd></div>
              {d.type === 'T' ? (
                <>
                  <div><dt>Activation Type</dt><dd>{d.activation ?? 'Registered Server Program'}</dd></div>
                  <div><dt>Program ID</dt><dd>{d.programId}</dd></div>
                  <div><dt>Gateway Host</dt><dd>{d.gwhost || '(this system)'}</dd></div>
                  <div><dt>Gateway Service</dt><dd>{d.gwserv || '(this system)'}</dd></div>
                </>
              ) : (
                <div><dt>Target Host</dt><dd>{d.host}</dd></div>
              )}
            </dl>
            <div className="sg-actions">
              <Btn kind="primary" onClick={() => setTest(act((s) => testDestination(s, d.name)))}>Connection Test</Btn>
              {d.type === 'T' && <Btn onClick={() => { const r = act((s) => deleteDestination(s, d.name)); msg(r.ok ? 'S' : 'E', r.text) }}>Delete</Btn>}
            </div>
            {test && (
              <div className={`sg-result ${test.ok ? 'sg-ok' : 'sg-err'}`}>
                <b>{test.text}</b>
                {test.rows && <Table heads={['Action', 'Result']} rows={test.rows.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)} />}
              </div>
            )}
          </>
        ) : null}
      </section>
    </div>
  )
}

function Smgw({ y, state }) {
  const rows = Object.entries(y.programs)
  return (
    <>
      <h3>Logged on clients</h3>
      <Table
        heads={['Program ID', 'Registered by', 'Connections', 'Registered since', 'Last contact', 'State']}
        empty="No registered programs"
        rows={rows.map(([pid, p]) => {
          const live = registration(state, y, pid, state.clock)
          return (
            <tr key={pid}>
              <td>{pid}</td>
              <td>{p.app}</td>
              <td>{live ? p.count : 0}</td>
              <td>{stamp(p.since)}</td>
              <td>{stamp(p.t)}</td>
              <td className={live ? 'sg-good' : 'sg-bad'}>{live ? 'Registered' : 'Not registered'}</td>
            </tr>
          )
        })}
      />
      <h3>Gateway log</h3>
      <Table heads={['Time', 'Entry']} empty="The log is empty" rows={[...y.gwlog].reverse().map((l, i) => <tr key={i} className={l.ok ? '' : 'sg-badrow'}><td>{stamp(l.t)}</td><td>{l.text}</td></tr>)} />
    </>
  )
}

// ---------- ALE setup ----------

function We20({ y, act, msg }) {
  const [pick, setPick] = useState(y.partners[0]?.prn ?? '')
  const [prn, setPrn] = useState('')
  const [inb, setInb] = useState({ mestyp: 'ORDERS', process: 'ORDE', trigger: 'immediately' })
  const [out, setOut] = useState({ mestyp: 'ALEAUD', port: y.ports[0]?.name ?? '', idoctp: 'ALEAUD01', mode: 'immediately' })
  const p = partnerOf(y, pick)
  return (
    <div className="sg-split">
      <section>
        <div className="sg-tree">
          <b>Partner type LS</b>
          {y.partners.map((x) => (
            <button key={x.prn} type="button" className={`sg-node${x.prn === pick ? ' on' : ''}`} onClick={() => setPick(x.prn)}>
              {x.prn} <span>{x.text}</span>
            </button>
          ))}
        </div>
        <form className="sg-select" onSubmit={(e) => { e.preventDefault(); const r = act((s) => createPartner(s, prn)); msg(r.ok ? 'S' : 'E', r.text); if (r.ok) setPick(prn.trim().toUpperCase()), setPrn('') }}>
          <Field label="New partner number (type LS)"><Input value={prn} onChange={setPrn} /></Field>
          <Btn type="submit">Create partner</Btn>
        </form>
      </section>
      {p && (
        <section>
          <h3>
            Partner {p.prn} <small>type {p.prt}</small>
          </h3>
          <h4>Inbound parameters</h4>
          <Table
            heads={['Message type', 'Process code', 'Processing', '']}
            rows={p.inbound.map((r) => (
              <tr key={r.mestyp}>
                <td>{r.mestyp}</td>
                <td>{r.process}</td>
                <td>
                  <Select value={r.trigger} onChange={(t) => act((s) => setInboundTrigger(s, p.prn, r.mestyp, t))} options={[['immediately', 'Trigger immediately'], ['background', 'Trigger by background program']]} aria-label={`Processing of ${r.mestyp}`} />
                </td>
                <td><Btn onClick={() => act((s) => removeInbound(s, p.prn, r.mestyp))}>Remove</Btn></td>
              </tr>
            ))}
          />
          <div className="sg-select">
            <Field label="Message type"><Select value={inb.mestyp} onChange={(mestyp) => setInb({ ...inb, mestyp, process: PROCESS_CODES[mestyp] ?? '' })} options={MESTYPES} /></Field>
            <Field label="Process code"><Input value={inb.process} onChange={(process) => setInb({ ...inb, process })} /></Field>
            <Field label="Processing"><Select value={inb.trigger} onChange={(trigger) => setInb({ ...inb, trigger })} options={[['immediately', 'Trigger immediately'], ['background', 'Trigger by background program']]} /></Field>
            <Btn onClick={() => { const ok = act((s) => addInbound(s, p.prn, inb)); msg(ok ? 'S' : 'E', ok ? `Inbound parameter ${inb.mestyp} added` : `${p.prn} has ${inb.mestyp} inbound already`) }}>Add inbound parameter</Btn>
          </div>
          <h4>Outbound parameters</h4>
          <Table
            heads={['Message type', 'Receiver port', 'Basic type', 'Output mode', '']}
            rows={p.outbound.map((r) => (
              <tr key={r.mestyp}>
                <td>{r.mestyp}</td>
                <td>{r.port}</td>
                <td>{r.idoctp}</td>
                <td>{r.mode === 'collect' ? 'Collect IDocs' : 'Transfer IDoc immediately'}</td>
                <td><Btn onClick={() => act((s) => removeOutbound(s, p.prn, r.mestyp))}>Remove</Btn></td>
              </tr>
            ))}
          />
          <div className="sg-select">
            <Field label="Message type"><Select value={out.mestyp} onChange={(mestyp) => setOut({ ...out, mestyp, idoctp: IDOC_TYPES[mestyp] ?? '' })} options={MESTYPES} /></Field>
            <Field label="Receiver port"><Select value={out.port} onChange={(port) => setOut({ ...out, port })} options={y.ports.map((x) => x.name)} placeholder="Choose a port" /></Field>
            <Field label="Basic type"><Input value={out.idoctp} onChange={(idoctp) => setOut({ ...out, idoctp })} /></Field>
            <Field label="Output mode"><Select value={out.mode} onChange={(mode) => setOut({ ...out, mode })} options={[['immediately', 'Transfer IDoc immediately'], ['collect', 'Collect IDocs']]} /></Field>
            <Btn disabled={!out.port} onClick={() => { const ok = act((s) => addOutbound(s, p.prn, out)); msg(ok ? 'S' : 'E', ok ? `Outbound parameter ${out.mestyp} added` : `${p.prn} has ${out.mestyp} outbound already`) }}>Add outbound parameter</Btn>
          </div>
        </section>
      )}
    </div>
  )
}

function We21({ y, act, msg }) {
  const [f, setF] = useState({ name: '', text: '', dest: '' })
  return (
    <>
      <h3>Transactional RFC</h3>
      <Table heads={['Port', 'Description', 'RFC destination']} empty="No ports" rows={y.ports.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.text}</td><td>{p.dest}</td></tr>)} />
      <form className="sg-select" onSubmit={(e) => { e.preventDefault(); const r = act((s) => createPort(s, f)); msg(r.ok ? 'S' : 'E', r.text); if (r.ok) setF({ name: '', text: '', dest: '' }) }}>
        <Field label="Port"><Input value={f.name} onChange={(name) => setF({ ...f, name })} /></Field>
        <Field label="Description"><Input value={f.text} onChange={(text) => setF({ ...f, text })} /></Field>
        <Field label="RFC destination"><Select value={f.dest} onChange={(dest) => setF({ ...f, dest })} options={y.dests.map((d) => d.name)} placeholder="Choose a destination" /></Field>
        <Btn kind="primary" type="submit">Create</Btn>
      </form>
    </>
  )
}

function Bd54({ y, act, msg }) {
  const [name, setName] = useState('')
  return (
    <>
      <Table heads={['Logical system']} rows={y.logsys.map((l) => <tr key={l}><td>{l}</td></tr>)} />
      <form className="sg-select" onSubmit={(e) => { e.preventDefault(); const r = act((s) => createLogicalSystem(s, name)); msg(r.ok ? 'S' : 'E', r.text); if (r.ok) setName('') }}>
        <Field label="New logical system"><Input value={name} onChange={setName} /></Field>
        <Btn kind="primary" type="submit">Save</Btn>
      </form>
    </>
  )
}

// ---------- business data ----------

function Va03({ y, update, msg }) {
  const [num, setNum] = useState('')
  const [shown, setShown] = useState(null)
  const show = () => {
    update((s) => mark(s, 'sap:VA03'))
    const o = y.orders[vbelnOf(num)]
    setShown(o ?? null)
    if (!o) msg('E', MSG.noDoc(num.trim() || '0'))
    else msg('S', `Standard Order ${n0(o.vbeln)} displayed`)
  }
  const o = shown && y.orders[shown.vbeln]
  return (
    <>
      <form className="sg-select" onSubmit={(e) => (e.preventDefault(), show())}>
        <Field label="Order"><Input value={num} onChange={setNum} /></Field>
        <Btn kind="primary" type="submit">Display</Btn>
      </form>
      {o && (
        <>
          <h3>Standard Order {n0(o.vbeln)}</h3>
          <dl className="sg-dl">
            <div><dt>Sold-To Party</dt><dd>{o.kunnr} {y.customers[o.kunnr]?.name}</dd></div>
            <div><dt>Cust. Reference</dt><dd>{o.po}</dd></div>
            <div><dt>Sales area</dt><dd>{areaText(o.area)}</dd></div>
            <div><dt>Created on</dt><dd>{stamp(o.t)}</dd></div>
            <div><dt>Created through</dt><dd>{o.source === 'IDoc' ? `IDoc ${o.by}` : `RFC by ${o.by} (${o.source})`}</dd></div>
          </dl>
          <Table heads={['Item', 'Material', 'Order Quantity', 'Description']} rows={o.items.map((i) => <tr key={i.posnr}><td>{i.posnr}</td><td>{i.matnr}</td><td>{i.qty} PC</td><td>{y.materials[i.matnr]?.text}</td></tr>)} />
        </>
      )}
    </>
  )
}

function Mmbe({ y }) {
  const [m, setM] = useState(Object.keys(y.materials)[0])
  const mat = y.materials[m]
  return (
    <>
      <div className="sg-select">
        <Field label="Material"><Select value={m} onChange={setM} options={Object.keys(y.materials)} /></Field>
      </div>
      {mat && (
        <Table
          heads={['Client / Plant / Storage location', 'Unrestricted use', 'Sales orders', 'Available', 'Locked by']}
          rows={[
            <tr key="x">
              <td>{y.client} / {mat.plant} / {mat.sloc} <small>{mat.text}</small></td>
              <td>{mat.unrestricted} PC</td>
              <td>{orderedOf(y, m)} PC</td>
              <td>{availableOf(y, m)} PC</td>
              <td>{mat.lockedBy ?? ''}</td>
            </tr>,
          ]}
        />
      )}
    </>
  )
}

function Xd03({ y, act, msg }) {
  const [k, setK] = useState('4711')
  const [area, setArea] = useState(AREA)
  const c = y.customers[k]
  const open = y.requests.filter((r) => r.kunnr === k)
  return (
    <>
      <div className="sg-select">
        <Field label="Customer"><Select value={k} onChange={setK} options={Object.keys(y.customers).map((x) => [x, `${x} ${y.customers[x].name}`])} /></Field>
      </div>
      {c && (
        <>
          <h3>{k} {c.name}</h3>
          <h4>Sales areas</h4>
          <Table heads={['Sales org.', 'Distr. channel', 'Division']} empty="No sales area" rows={c.areas.map((a) => { const [o, d, v] = a.split('/'); return <tr key={a}><td>{o}</td><td>{d}</td><td>{v}</td></tr> })} />
          <h4>Changes</h4>
          <Table heads={['Time', 'By', 'Change']} empty="No changes" rows={[...c.changes].reverse().map((x, i) => <tr key={i}><td>{stamp(x.t)}</td><td>{x.by}</td><td>{x.text}</td></tr>)} />
          <div className="sg-lab">
            <h4>Request to the master data team</h4>
            <p className="pc-dim">A lab tool: in a real company you open a ticket. The team extends the customer about 5 lab minutes later and mails ops.</p>
            <div className="sg-select">
              <Field label="Sales area"><Select value={area} onChange={setArea} options={AREAS.map((a) => [a, areaText(a)])} /></Field>
              <Btn onClick={() => { const ok = act((s) => requestSalesArea(s, k, area)); msg(ok ? 'S' : 'E', ok ? `Request for ${k} in ${areaText(area)} sent` : `${k} has ${areaText(area)} already, or a request is open`) }}>Send request</Btn>
            </div>
            {open.map((r) => <p key={r.area}>Open request: {areaText(r.area)}, due {timeText(r.at)}</p>)}
          </div>
        </>
      )}
    </>
  )
}

function Su01({ y, act, msg }) {
  const [f, setF] = useState({ name: '', type: 'System', password: '' })
  return (
    <>
      <Table
        heads={['User', 'User type', 'Failed logons', 'State', '']}
        rows={Object.entries(y.users).map(([n, u]) => (
          <tr key={n}>
            <td>{n}</td>
            <td>{u.type}</td>
            <td>{u.failed}</td>
            <td className={u.locked ? 'sg-bad' : ''}>{u.locked ? 'Locked after failed logons' : 'Not locked'}</td>
            <td>{u.locked && <Btn onClick={() => (act((s) => unlockUser(s, n)), msg('S', `User ${n} unlocked`))}>Unlock</Btn>}</td>
          </tr>
        ))}
      />
      <h3>Create user</h3>
      <form className="sg-select" onSubmit={(e) => { e.preventDefault(); const r = act((s) => createUser(s, f)); msg(r.ok ? 'S' : 'E', r.text); if (r.ok) setF({ name: '', type: 'System', password: '' }) }}>
        <Field label="User"><Input value={f.name} onChange={(name) => setF({ ...f, name })} /></Field>
        <Field label="User type"><Select value={f.type} onChange={(type) => setF({ ...f, type })} options={['System', 'Dialog', 'Communications', 'Service']} /></Field>
        <Field label="Initial password"><Input type="password" value={f.password} onChange={(password) => setF({ ...f, password })} autoComplete="new-password" /></Field>
        <Btn kind="primary" type="submit">Create</Btn>
      </form>
    </>
  )
}

// ---------- SE37 ----------

function paramsOf(name) {
  const fm = FUNCTION_MODULES[name]
  if (!fm) return {}
  const tables = Object.fromEntries(Object.entries(fm.tables).filter(([k]) => k !== 'RETURN'))
  return Object.fromEntries(Object.entries({ ...fm.imports, ...tables }).map(([k, v]) => [k, typeof v === 'string' ? v : json(v)]))
}
function Se37({ y, act, msg }) {
  const names = Object.keys(FUNCTION_MODULES)
  const [name, setName] = useState('BAPI_SALESORDER_CREATEFROMDAT2')
  const [vals, setVals] = useState(() => paramsOf('BAPI_SALESORDER_CREATEFROMDAT2'))
  const [sequence, setSequence] = useState(false)
  const [res, setRes] = useState(null)
  const fm = FUNCTION_MODULES[name]
  const pickFm = (n) => (setName(n), setVals(paramsOf(n)), setRes(null))
  const run = () => {
    const params = {}
    for (const [k, v] of Object.entries(vals)) {
      if (!/^\s*[[{]/.test(v)) params[k] = v
      else
        try {
          params[k] = JSON.parse(v)
        } catch {
          return msg('E', `Parameter ${k} is not valid JSON`)
        }
    }
    const r = act((s) => testFunction(s, name, params, { sequence }))
    setRes(r)
    if (!r.ok) return msg('E', r.text)
    const ret = r.tables?.RETURN ?? (r.export?.RETURN ? [r.export.RETURN] : [])
    const bad = ret.some((x) => x.TYPE === 'E' || x.TYPE === 'A')
    msg(bad ? 'E' : r.lost.length ? 'W' : 'S', r.committed.length ? `Test sequence: order ${r.committed.map(Number).join(', ')} committed` : r.lost.length ? `The test session ended without COMMIT WORK: order ${r.lost.map(Number).join(', ')} rolled back` : 'Function module executed')
  }
  return (
    <>
      <div className="sg-select">
        <Field label="Function Module"><Select value={name} onChange={pickFm} options={names} /></Field>
      </div>
      <p className="pc-dim">{fm?.text}</p>
      {fm?.sendOnly ? (
        <p>This module takes IDocs over tRFC from a sender such as the Send IDoc operation. Test IDocs in WE19.</p>
      ) : (
        <>
          <h3>Test: import parameters and tables</h3>
          {Object.entries(vals).map(([k, v]) => (
            <label key={k} className="sg-param">
              <span>{k}</span>
              {/^\s*[[{]/.test(v) ? <textarea className="pc-input" rows={Math.min(8, v.split('\n').length)} value={v} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /> : <input className="pc-input" value={v} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}
            </label>
          ))}
          <Check checked={sequence} onChange={setSequence}>
            Test sequence: run BAPI_TRANSACTION_COMMIT after it in the same session
          </Check>
          <div className="sg-actions">
            <Btn kind="primary" onClick={run}>Execute</Btn>
          </div>
        </>
      )}
      {res?.ok && (
        <>
          <h3>Export parameters</h3>
          <pre className="sg-pre">{json(Object.fromEntries(Object.entries(res.export ?? {}).filter(([k]) => k !== 'RETURN' || !res.tables?.RETURN)))}</pre>
          {Object.entries(res.tables ?? {}).map(([t, rows]) => (
            <div key={t}>
              <h4>Table {t}</h4>
              <Table heads={rows[0] ? Object.keys(rows[0]) : ['(empty)']} empty="0 entries" rows={rows.map((r, i) => <tr key={i} className={r.TYPE === 'E' || r.TYPE === 'A' ? 'sg-badrow' : ''}>{Object.values(r).map((v, j) => <td key={j}>{String(v)}</td>)}</tr>)} />
            </div>
          ))}
          <p className="pc-dim">{res.committed.length ? `Committed in the same session: ${res.committed.map(Number).join(', ')}.` : res.lost.length ? `Single test: the session ended without COMMIT WORK and rolled back ${res.lost.map(Number).join(', ')}.` : ''}</p>
        </>
      )}
      <h3>Last RFC calls</h3>
      <Table heads={['Time', 'Caller', 'Function module', 'Session', 'Result']} empty="No calls yet" rows={[...y.calls].reverse().slice(0, 25).map((c, i) => <tr key={i} className={c.ok ? '' : 'sg-badrow'}><td>{timeText(c.t)}</td><td>{c.who}</td><td>{c.fm}</td><td>{c.session}</td><td>{c.text}</td></tr>)} />
    </>
  )
}

// ---------- In the Mule app ----------

const MAP = [
  ['Application server, system number 00', 'applicationServerHost, systemNumber', 'The client side: Send IDoc and Execute BAPI connect here, to port 3300 for system number 00.'],
  ['Client 100', 'client', 'Every logon names the client. A wrong one gives Client is not available in this system.'],
  ['SU01 user of type System', 'username, password', 'Keep the password in a secure property. Five wrong logons lock the user: Name or password is incorrect (repeat logon) first, then User is locked.'],
  ['SMGW gateway sapgw00', 'gatewayHost, gatewayService', 'The server side: the Document listener connects out to the gateway and registers there.'],
  ['SM59 type T, Registered Server Program', 'programId, connectionCount', 'The program ID must match the destination. connectionCount is how many registrations the listener holds.'],
  ['WE21 port, WE20 partner profile', '(none)', 'SAP picks the port and the destination from the outbound parameters of the partner. Inbound IDocs need an inbound parameter or they stop in 56.'],
  ['IDoc status 50, 64, 53 or 51', 'Send IDoc completes', 'Send IDoc is tRFC: it completes when SAP saved the IDoc. Posting comes after, so read ALEAUD or check the status.'],
  ['BAPI RETURN and COMMIT WORK', 'Execute BAPI, Transactional scope', 'A BAPI does not commit. Run BAPI_TRANSACTION_COMMIT in the same session, and read RETURN for E and A first.'],
]
const sapProps = (a) => Object.keys({ ...a.props, ...a.secrets }).filter((k) => k.startsWith('sap.'))
function InMule({ state }) {
  const y = state.sap
  const [tests, setTests] = useState({})
  const apps = state.apps.filter((a) => sapProps(a).length)
  const cfgOf = (a) => {
    const p = { ...a.props, ...a.secrets }
    return { applicationServerHost: p['sap.applicationServerHost'], systemNumber: p['sap.systemNumber'], client: p['sap.client'], username: p['sap.username'], password: p['sap.password'] }
  }
  // Test Connection, as in Studio: RFC_PING on a copy of the state, so the system does not change
  const test = (a) => {
    const copy = { clock: state.clock, apps: state.apps, sap: structuredClone(y) }
    const r = sapCtx(copy, { name: `${a.name} (test)` }).executeBapi(cfgOf(a), 'RFC_PING', {})
    setTests((t) => ({ ...t, [a.name]: r.ok ? 'Test connection successful' : `${r.type}: ${r.error}` }))
  }
  return (
    <section className="sg-mule" aria-label="In the Mule app">
      <h3>From SAP to the SAP connector</h3>
      <Table heads={['In SAP', 'In the connector', 'What to know']} rows={MAP.map(([a, b, c]) => <tr key={a}><td>{a}</td><td><code>{b}</code></td><td>{c}</td></tr>)} />
      <h3>Apps that use SAP {y?.sid}</h3>
      {!apps.length && <p className="pc-empty pc-boxed">No app of this lab has sap.* properties.</p>}
      {apps.map((a) => {
        const p = { ...a.props, ...a.secrets }
        return (
          <div key={a.name} className="sg-muleapp">
            <h4>{a.name}</h4>
            <dl className="sg-dl">
              {sapProps(a).map((k) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{a.secrets?.[k] !== undefined ? '(secure property)' : String(p[k])}</dd>
                </div>
              ))}
            </dl>
            <div className="sg-actions">
              <Btn onClick={() => test(a)}>Test connection</Btn>
              {tests[a.name] && <span className={tests[a.name].startsWith('Test') ? 'sg-good' : 'sg-bad'}>{tests[a.name]}</span>}
            </div>
            <Table heads={['Time', 'Function module', 'Session', 'Result']} empty="No RFC calls from this app" rows={(y?.calls ?? []).filter((c) => c.who === a.name).slice(-8).reverse().map((c, i) => <tr key={i}><td>{timeText(c.t)}</td><td>{c.fm}</td><td>{c.session}</td><td>{c.text}</td></tr>)} />
          </div>
        )
      })}
      <p className="pc-dim">Gateway {SAP_HOST} {GW_SERVICE}. The lab plays JCo: the error texts follow JCoException, the error types are those of the SAP connector.</p>
    </section>
  )
}
