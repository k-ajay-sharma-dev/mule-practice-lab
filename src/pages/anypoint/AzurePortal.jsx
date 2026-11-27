// Storage accounts (Blob containers, File shares, SAS, access keys) and Key Vaults in the style of the Azure portal,
// on the lab systems of platform-systems.js. A lab tool with fictional resources of Harbor.
import { useEffect, useState } from 'react'
import { dateText, mark, timeText } from '../../lab/platform.js'
import {
  ACCESS_MODELS, addContainer, addSecretVersion, addShare, connectionString, createSas, DEFAULT_EGRESS, deleteSecret, finishWrite, latestVersion, listDir, makeDir, putFile, putLocal, regenerateKey, removeContainer,
  removeFile, removeShare, sasState, secretUri, setNetwork, setSecretVersion, setSystemUp, setTier, setVaultAccess, setVaultModel, setVaultRoles, TIERS, VAULT_PERMS, VAULT_ROLES,
} from '../../lab/platform-systems.js'
import { Check, Copy, Input, Select } from './parts.jsx'

const MIN = 60000
const DAY = 24 * 60 * MIN
const azTime = (t) => {
  const [y, m, d] = dateText(t).split('-').map(Number)
  const [h, mi, s] = timeText(t).split(':').map(Number)
  return `${m}/${d}/${y}, ${h % 12 || 12}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const bytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MiB` : n >= 1024 ? `${(n / 1024).toFixed(2)} KiB` : `${n} B`)
const cap = (x) => x[0].toUpperCase() + x.slice(1)

// ---------- the portal shell ----------

function Shell({ crumbs, children }) {
  return (
    <main className="pc-main sy-az">
      <div className="sy-az-top">
        <b>Microsoft Azure</b>
        <span className="sy-az-lab">Lab copy</span>
        <input className="sy-az-search" placeholder="Search resources, services, and docs (G+/)" aria-label="Search" />
        <span className="sy-az-user">you@harbor.lab</span>
      </div>
      <nav className="sy-az-crumbs" aria-label="Breadcrumb">
        {crumbs.map(([label, onClick], i) => (
          <span key={i}>
            {i > 0 && <i aria-hidden="true"> › </i>}
            {onClick ? (
              <button type="button" onClick={onClick}>
                {label}
              </button>
            ) : (
              <b>{label}</b>
            )}
          </span>
        ))}
      </nav>
      {children}
    </main>
  )
}
function Resource({ icon, name, kind, menu, blade, onBlade, children }) {
  return (
    <div className="sy-az-res">
      <header className="sy-az-title">
        <span className="sy-az-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h2>
            {name}
            {blade !== 'Overview' && <span> | {blade}</span>}
          </h2>
          <small>{kind}</small>
        </div>
      </header>
      <div className="sy-az-body">
        <nav className="sy-az-menu" aria-label={`${name} menu`}>
          {menu.map((item) =>
            typeof item === 'string' ? (
              <button key={item} type="button" className={item === blade ? 'on' : ''} aria-current={item === blade ? 'page' : undefined} onClick={() => onBlade(item)}>
                {item}
              </button>
            ) : (
              <b key={item.title}>{item.title}</b>
            ),
          )}
        </nav>
        <section className="sy-az-blade">{children}</section>
      </div>
    </div>
  )
}
const Cmd = ({ children }) => <div className="sy-az-cmd">{children}</div>
const CBtn = ({ icon, children, ...props }) => (
  <button type="button" className="sy-az-cbtn" {...props}>
    {icon && <span aria-hidden="true">{icon}</span>}
    {children}
  </button>
)
const ABtn = ({ primary, ...props }) => <button type="button" className={`sy-az-btn${primary ? ' primary' : ''}`} {...props} />
function Grid({ heads, rows, empty = 'No items to show.' }) {
  return (
    <div className="sy-az-grid">
      <table>
        <thead>
          <tr>
            {heads.map((h, i) => (
              <th key={i} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows}
          {rows.length === 0 && (
            <tr>
              <td colSpan={heads.length} className="sy-az-empty">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
// The context pane that opens on the right side of the portal
function Pane({ title, sub, onClose, children, foot }) {
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && (e.stopPropagation(), onClose())
    document.addEventListener('keydown', key, true)
    return () => document.removeEventListener('keydown', key, true)
  }, [onClose])
  return (
    <div className="sy-az-paneback" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="sy-az-pane" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sy-az-panehead">
          <div>
            <h3>{title}</h3>
            {sub && <small>{sub}</small>}
          </div>
          <button type="button" className="sy-az-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="sy-az-panebody">{children}</div>
        {foot && <div className="sy-az-panefoot">{foot}</div>}
      </aside>
    </div>
  )
}
// a label around one control; `group` for several controls, buttons or plain text, which a label must not wrap
const Row = ({ label, group, children }) =>
  group ? (
    <div className="sy-az-row" role="group" aria-label={label}>
      <span>{label}</span>
      <div>{children}</div>
    </div>
  ) : (
    <label className="sy-az-row">
      <span>{label}</span>
      <div>{children}</div>
    </label>
  )
const Info = ({ children, kind = 'info' }) => <p className={`sy-az-info ${kind}`}>{children}</p>
function Masked({ value, label = 'Show' }) {
  const [show, setShow] = useState(false)
  return (
    <span className="sy-az-masked">
      <code>{show ? value : '•'.repeat(Math.min(24, Math.max(8, String(value).length)))}</code>
      <ABtn onClick={() => setShow(!show)}>{show ? 'Hide' : label}</ABtn>
      <Copy text={value} />
    </span>
  )
}
function Essentials({ items }) {
  return (
    <dl className="sy-az-ess">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
function ActivityLog({ log }) {
  return (
    <Grid
      heads={['Time', 'Operation name', 'Status', 'Event initiated by', 'Resource']}
      empty="No events yet."
      rows={log
        .slice()
        .reverse()
        .map((l, i) => (
          <tr key={i}>
            <td>{azTime(l.t)}</td>
            <td>{l.op}</td>
            <td className={l.ok ? 'sy-ok' : 'sy-bad'}>{l.ok ? 'Succeeded' : 'Failed'}</td>
            <td>{l.who}</td>
            <td className="pc-mono">{l.text}</td>
          </tr>
        ))}
    />
  )
}
function Networking({ x, onSave, kind }) {
  const [mode, setMode] = useState(x.network.mode)
  const [ips, setIps] = useState(x.network.ips.join(', '))
  const changed = mode !== x.network.mode || ips !== x.network.ips.join(', ')
  return (
    <>
      <Cmd>
        <CBtn icon="💾" disabled={!changed} onClick={() => onSave({ mode, ips: ips.split(/[\s,]+/).filter(Boolean) })}>
          Save
        </CBtn>
        <CBtn icon="↺" disabled={!changed} onClick={() => { setMode(x.network.mode); setIps(x.network.ips.join(', ')) }}>
          Discard
        </CBtn>
      </Cmd>
      <h3 className="sy-az-h3">Public network access</h3>
      <div className="sy-az-radios" role="radiogroup">
        {[['All networks', 'Enabled from all networks'], ['Selected networks', 'Enabled from selected virtual networks and IP addresses'], ['Disabled', 'Disabled']].map(([v, label]) => (
          <label key={v}>
            <input type="radio" name={`net-${kind}`} checked={mode === v} onChange={() => setMode(v)} /> {label}
          </label>
        ))}
      </div>
      {mode === 'Selected networks' && (
        <Row label="Firewall: address range">
          <Input value={ips} onChange={setIps} placeholder="IP address or CIDR, such as 203.0.113.24" />
        </Row>
      )}
      <Info>The apps of this lab call from {DEFAULT_EGRESS} (lab made). A call from an address the rules do not allow gets 403 {kind === 'vault' ? 'ForbiddenByFirewall' : 'AuthorizationFailure'}.</Info>
    </>
  )
}

// ---------- Storage accounts ----------

const STORAGE_MENU = ['Overview', 'Activity log', { title: 'Data storage' }, 'Containers', 'File shares', { title: 'Security + networking' }, 'Networking', 'Access keys', 'Shared access signature']

function StoragePortal({ state, update, start }) {
  const accounts = Object.values(state.systems?.storage ?? {})
  const [name, setName] = useState(accounts.length === 1 ? accounts[0].account : null)
  const [blade, setBlade] = useState(start)
  const [inside, setInside] = useState(null) // a container or share name
  const acc = state.systems?.storage?.[name]
  useEffect(() => {
    if (acc) update((s) => mark(s, `blob:${acc.account}`))
  }, [acc?.account, update]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (acc && blade === 'File shares') update((s) => mark(s, `share:${acc.account}`))
  }, [acc?.account, blade, update]) // eslint-disable-line react-hooks/exhaustive-deps
  const home = () => { setName(null); setInside(null) }
  const pick = (b) => { setBlade(b); setInside(null) }
  if (!acc)
    return (
      <Shell crumbs={[['Home', home], ['Storage accounts']]}>
        <div className="sy-az-page">
          <h2 className="sy-az-h2">Storage accounts</h2>
          <Cmd>
            <CBtn icon="+" disabled title="Not part of the lab">
              Create
            </CBtn>
          </Cmd>
          <Grid
            heads={['Name', 'Type', 'Kind', 'Resource group', 'Location', 'Status']}
            empty="No storage accounts in this lab."
            rows={accounts.map((a) => (
              <tr key={a.account}>
                <td>
                  <button type="button" className="sy-az-link" onClick={() => setName(a.account)}>
                    {a.account}
                  </button>
                </td>
                <td>Storage account</td>
                <td>{a.kind}</td>
                <td>harbor-integration-rg</td>
                <td>{a.region}</td>
                <td>{a.up ? 'Available' : 'Unavailable'}</td>
              </tr>
            ))}
          />
        </div>
      </Shell>
    )
  const crumbs = [['Home', home], ['Storage accounts', home], [acc.account, () => pick('Overview')], ...(inside ? [[blade, () => setInside(null)], [inside]] : [[blade]])]
  return (
    <Shell crumbs={crumbs}>
      {inside && blade === 'Containers' && <Container key={inside} state={state} update={update} acc={acc} name={inside} />}
      {inside && blade === 'File shares' && <Share key={inside} state={state} update={update} acc={acc} name={inside} />}
      {!inside && (
        <Resource icon="▦" name={acc.account} kind="Storage account" menu={STORAGE_MENU} blade={blade} onBlade={pick}>
          {blade === 'Overview' && <StorageOverview acc={acc} update={update} />}
          {blade === 'Activity log' && <ActivityLog log={acc.log} />}
          {blade === 'Containers' && <Containers state={state} update={update} acc={acc} open={setInside} />}
          {blade === 'File shares' && <Shares update={update} acc={acc} open={setInside} />}
          {blade === 'Networking' && <Networking key={acc.account} x={acc} kind="storage" onSave={(n) => update((s) => setNetwork(s, 'storage', acc.account, n))} />}
          {blade === 'Access keys' && <AccessKeys acc={acc} update={update} />}
          {blade === 'Shared access signature' && <SasBlade state={state} update={update} acc={acc} />}
        </Resource>
      )}
    </Shell>
  )
}

function StorageOverview({ acc, update }) {
  const blobs = Object.values(acc.containers).reduce((n, c) => n + Object.keys(c.blobs).length, 0)
  return (
    <>
      <Cmd>
        <CBtn icon={acc.up ? '■' : '▶'} onClick={() => update((s) => setSystemUp(s, 'storage', acc.account, !acc.up))}>
          {acc.up ? 'Make unavailable (lab)' : 'Make available (lab)'}
        </CBtn>
      </Cmd>
      <Essentials
        items={[
          ['Resource group', 'harbor-integration-rg'], ['Location', acc.region], ['Subscription', 'Harbor Lab'], ['Status', acc.up ? 'Primary: Available' : 'Primary: Unavailable (lab outage)'],
          ['Performance', 'Standard'], ['Replication', acc.replication], ['Account kind', acc.kind], ['Blob endpoint', `https://${acc.account}.blob.core.windows.net/`],
          ['File endpoint', `https://${acc.account}.file.core.windows.net/`], ['Public network access', acc.network.mode],
        ]}
      />
      <div className="sy-az-tiles">
        <div>
          <b>{Object.keys(acc.containers).length}</b> containers, {blobs} blobs
        </div>
        <div>
          <b>{Object.keys(acc.shares).length}</b> file shares
        </div>
        <div>
          <b>{acc.sas.filter((x) => x.expires > 0).length}</b> SAS tokens issued in the lab
        </div>
      </div>
    </>
  )
}

function Containers({ state, update, acc, open }) {
  const [adding, setAdding] = useState(null)
  const [picked, setPicked] = useState([])
  const list = Object.entries(acc.containers)
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setAdding({ name: '', access: 'Private' })}>
          Container
        </CBtn>
        <CBtn icon="🗑" disabled={!picked.length} onClick={() => { picked.forEach((n) => update((s) => removeContainer(s, acc.account, n))); setPicked([]) }}>
          Delete
        </CBtn>
      </Cmd>
      <Grid
        heads={['', 'Name', 'Last modified', 'Anonymous access level', 'Lease state', 'Blobs']}
        rows={list.map(([n, c]) => (
          <tr key={n}>
            <td>
              <input type="checkbox" aria-label={`Select ${n}`} checked={picked.includes(n)} onChange={(e) => setPicked(e.target.checked ? [...picked, n] : picked.filter((x) => x !== n))} />
            </td>
            <td>
              <button type="button" className="sy-az-link" onClick={() => open(n)}>
                📁 {n}
              </button>
            </td>
            <td>{azTime(Math.max(c.created, ...Object.values(c.blobs).map((b) => b.t)))}</td>
            <td>{c.access}</td>
            <td>Available</td>
            <td>{Object.keys(c.blobs).length}</td>
          </tr>
        ))}
      />
      {adding && (
        <Pane
          title="New container"
          onClose={() => setAdding(null)}
          foot={
            <ABtn primary disabled={!/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(adding.name) || Boolean(acc.containers[adding.name])} onClick={() => { update((s) => addContainer(s, acc.account, adding.name, adding.access)); setAdding(null) }}>
              Create
            </ABtn>
          }
        >
          <Row label="Name">
            <Input value={adding.name} onChange={(v) => setAdding({ ...adding, name: v })} placeholder="lowercase letters, numbers and hyphens" />
          </Row>
          <Row label="Anonymous access level">
            <Select value={adding.access} onChange={(v) => setAdding({ ...adding, access: v })} options={['Private', 'Blob', 'Container']} />
          </Row>
          <Info>Private means no anonymous access. Callers then need an account key, a SAS or an identity with a role.</Info>
        </Pane>
      )}
      {!state.systems.storage[acc.account].up && <Info kind="warn">The account is unavailable (lab outage). Apps get 503 ServerBusy.</Info>}
    </>
  )
}

function Container({ state, update, acc, name }) {
  const target = `blob:${acc.account}/${name}`
  const [prefix, setPrefix] = useState('')
  const [picked, setPicked] = useState([])
  const [upload, setUpload] = useState(null)
  const [open, setOpen] = useState(null)
  const c = acc.containers[name]
  if (!c) return <Info kind="warn">The container {name} was deleted.</Info>
  const list = listDir(state, target, prefix)
  const blob = open && c.blobs[open]
  const crumbsIn = prefix ? prefix.split('/') : []
  return (
    <div className="sy-az-res">
      <header className="sy-az-title">
        <span className="sy-az-icon" aria-hidden="true">
          📁
        </span>
        <div>
          <h2>{name}</h2>
          <small>Container</small>
        </div>
      </header>
      <div className="sy-az-page">
        <Cmd>
          <CBtn icon="⇪" onClick={() => setUpload({ name: '', content: '', local: '', tier: 'Hot', overwrite: false, error: null })}>
            Upload
          </CBtn>
          <CBtn icon="🗑" disabled={!picked.length} onClick={() => { picked.forEach((p) => update((s) => removeFile(s, target, p))); setPicked([]) }}>
            Delete
          </CBtn>
          <CBtn icon="⇅" disabled={picked.length !== 1} onClick={() => setOpen(picked[0])}>
            Change tier
          </CBtn>
        </Cmd>
        <p className="sy-az-path">
          Location:{' '}
          <button type="button" className="sy-az-link" onClick={() => setPrefix('')}>
            {name}
          </button>
          {crumbsIn.map((p, i) => (
            <span key={i}>
              {' / '}
              <button type="button" className="sy-az-link" onClick={() => setPrefix(crumbsIn.slice(0, i + 1).join('/'))}>
                {p}
              </button>
            </span>
          ))}
        </p>
        <Grid
          heads={['', 'Name', 'Modified', 'Access tier', 'Blob type', 'Size', 'Lease state']}
          empty="No blobs found."
          rows={list.map((b) => (
            <tr key={b.path}>
              <td>{!b.dir && <input type="checkbox" aria-label={`Select ${b.name}`} checked={picked.includes(b.path)} onChange={(e) => setPicked(e.target.checked ? [...picked, b.path] : picked.filter((x) => x !== b.path))} />}</td>
              <td>
                <button type="button" className="sy-az-link" onClick={() => (b.dir ? (setPrefix(b.path), setPicked([])) : setOpen(b.path))}>
                  {b.dir ? '📁' : '📄'} {b.name}
                </button>
              </td>
              <td>{b.dir ? '' : azTime(b.t)}</td>
              <td>{b.dir ? '' : `${b.tier}${b.tier === 'Archive' ? ' (offline)' : ''}`}</td>
              <td>{b.dir ? 'Folder' : 'Block blob'}</td>
              <td>{b.dir ? '' : bytes(b.size)}</td>
              <td>{b.dir ? '' : 'Available'}</td>
            </tr>
          ))}
        />
        <Info>Blob folders are virtual: they are part of the blob names. A blob upload is committed in one step, so a reader never sees half of a blob.</Info>
      </div>
      {upload && (
        <Pane
          title="Upload blob"
          sub={`${acc.account}/${name}${prefix ? `/${prefix}` : ''}`}
          onClose={() => setUpload(null)}
          foot={
            <ABtn
              primary
              disabled={!upload.name.trim()}
              onClick={() => {
                const path = `${prefix ? `${prefix}/` : ''}${upload.name.trim()}`
                if (c.blobs[path] && !upload.overwrite) return setUpload({ ...upload, error: '1 blob already exists. Select Overwrite if files already exist.' })
                const content = upload.local ? state.systems.local.files[upload.local]?.content ?? '' : upload.content
                update((s) => putFile(s, target, path, content, { tier: upload.tier, ...(upload.local && { size: state.systems.local.files[upload.local].size }) }))
                setUpload(null)
              }}
            >
              Upload
            </ABtn>
          }
        >
          <Row label="Browse for files">
            <Select value={upload.local} onChange={(v) => setUpload({ ...upload, local: v, name: v || upload.name })} placeholder="Write the content below" options={Object.keys(state.systems.local.files)} />
          </Row>
          <Row label="Blob name">
            <Input value={upload.name} onChange={(v) => setUpload({ ...upload, name: v })} placeholder="customers-2026-11-03.csv" />
          </Row>
          {!upload.local && (
            <Row label="Content">
              <textarea className="pc-input pc-mono" rows={4} value={upload.content} onChange={(e) => setUpload({ ...upload, content: e.target.value })} />
            </Row>
          )}
          <Row label="Access tier">
            <Select value={upload.tier} onChange={(v) => setUpload({ ...upload, tier: v })} options={TIERS} />
          </Row>
          <Check checked={upload.overwrite} onChange={(v) => setUpload({ ...upload, overwrite: v })}>
            Overwrite if files already exist
          </Check>
          {upload.error && <Info kind="bad">{upload.error}</Info>}
        </Pane>
      )}
      {blob && <BlobPane key={open} state={state} update={update} acc={acc} container={name} path={open} blob={blob} onClose={() => setOpen(null)} />}
    </div>
  )
}

function BlobPane({ update, acc, container, path, blob, onClose }) {
  const [tier, setTierV] = useState(blob.tier)
  return (
    <Pane
      title={path.split('/').pop()}
      sub="Blob"
      onClose={onClose}
      foot={
        <>
          <ABtn primary disabled={tier === blob.tier} onClick={() => update((s) => setTier(s, acc.account, container, path, tier))}>
            Save tier
          </ABtn>
          <ABtn disabled={blob.tier === 'Archive'} onClick={() => update((s) => putLocal(s, path.split('/').pop(), blob.content ?? ''))}>
            Download
          </ABtn>
        </>
      }
    >
      <Essentials
        items={[
          ['URL', `https://${acc.account}.blob.core.windows.net/${container}/${path}`], ['Last modified', azTime(blob.t)], ['Type', 'Block blob'], ['Size', bytes(blob.size)],
          ['Access tier', blob.tier], ['ETag', blob.etag ?? ''], ['Lease state', 'Available'],
        ]}
      />
      <Row label="Change tier">
        <Select value={tier} onChange={setTierV} options={TIERS} />
      </Row>
      {blob.tier === 'Archive' ? (
        <Info kind="warn">This blob is in the Archive tier and is offline. A read gets 409 BlobArchived until it is moved to Hot, Cool or Cold. In Azure that rehydration takes hours; in the lab it is instant.</Info>
      ) : (
        <>
          <b className="sy-az-h3">Edit</b>
          <pre className="sy-az-pre">{blob.content || '(binary content, not shown)'}</pre>
        </>
      )}
    </Pane>
  )
}

function Shares({ update, acc, open }) {
  const [adding, setAdding] = useState(null)
  const [picked, setPicked] = useState([])
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setAdding({ name: '', quota: 100 })}>
          File share
        </CBtn>
        <CBtn icon="🗑" disabled={!picked.length} onClick={() => { picked.forEach((n) => update((s) => removeShare(s, acc.account, n))); setPicked([]) }}>
          Delete share
        </CBtn>
      </Cmd>
      <Grid
        heads={['', 'Name', 'Modified', 'Tier', 'Quota', 'Files']}
        empty="No file shares found."
        rows={Object.entries(acc.shares).map(([n, x]) => (
          <tr key={n}>
            <td>
              <input type="checkbox" aria-label={`Select ${n}`} checked={picked.includes(n)} onChange={(e) => setPicked(e.target.checked ? [...picked, n] : picked.filter((y) => y !== n))} />
            </td>
            <td>
              <button type="button" className="sy-az-link" onClick={() => open(n)}>
                🗂 {n}
              </button>
            </td>
            <td>{azTime(Math.max(x.created, ...Object.values(x.files).map((f) => f.t)))}</td>
            <td>{x.tier}</td>
            <td>{x.quota} GiB</td>
            <td>{Object.keys(x.files).length}</td>
          </tr>
        ))}
      />
      <Info>A file share is a folder tree that servers mount over SMB on port 445, and that apps reach over the REST API. A file there is visible while it is still written, unlike a blob.</Info>
      {adding && (
        <Pane
          title="New file share"
          onClose={() => setAdding(null)}
          foot={
            <ABtn primary disabled={!/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(adding.name) || Boolean(acc.shares[adding.name]) || !(Number(adding.quota) >= 1)} onClick={() => { update((s) => addShare(s, acc.account, adding.name, Math.floor(Number(adding.quota)))); setAdding(null) }}>
              Create
            </ABtn>
          }
        >
          <Row label="Name">
            <Input value={adding.name} onChange={(v) => setAdding({ ...adding, name: v })} />
          </Row>
          <Row label="Quota (GiB)">
            <input className="pc-input" type="number" min="1" max="102400" value={adding.quota} onChange={(e) => setAdding({ ...adding, quota: e.target.value })} />
          </Row>
        </Pane>
      )}
    </>
  )
}

function Share({ state, update, acc, name }) {
  const target = `share:${acc.account}/${name}`
  const [dir, setDir] = useState('')
  const [picked, setPicked] = useState(null)
  const [upload, setUpload] = useState(null)
  const [folder, setFolder] = useState(null)
  const share = acc.shares[name]
  if (!share) return <Info kind="warn">The file share {name} was deleted.</Info>
  const list = listDir(state, target, dir)
  const file = picked && share.files[picked]
  const parts = dir ? dir.split('/') : []
  return (
    <div className="sy-az-res">
      <header className="sy-az-title">
        <span className="sy-az-icon" aria-hidden="true">
          🗂
        </span>
        <div>
          <h2>{name}</h2>
          <small>SMB file share</small>
        </div>
      </header>
      <div className="sy-az-page">
        <Cmd>
          <CBtn icon="+" onClick={() => setFolder('')}>
            Add directory
          </CBtn>
          <CBtn icon="⇪" onClick={() => setUpload({ name: '', content: '', local: '', slow: false })}>
            Upload
          </CBtn>
          <CBtn icon="🗑" disabled={!file} onClick={() => { update((s) => removeFile(s, target, picked)); setPicked(null) }}>
            Delete
          </CBtn>
          <CBtn icon="✓" disabled={!file?.writing} title="Lab tool: the writer finishes the file" onClick={() => update((s) => finishWrite(s, target, picked))}>
            Finish the upload (lab)
          </CBtn>
        </Cmd>
        <p className="sy-az-path">
          <button type="button" className="sy-az-link" onClick={() => setDir('')}>
            {name}
          </button>
          {parts.map((p, i) => (
            <span key={i}>
              {' / '}
              <button type="button" className="sy-az-link" onClick={() => setDir(parts.slice(0, i + 1).join('/'))}>
                {p}
              </button>
            </span>
          ))}
        </p>
        <Grid
          heads={['Name', 'Type', 'Size', 'Last modified']}
          empty="No files found in this directory."
          rows={list.map((f) => (
            <tr key={f.path} className={picked === f.path ? 'on' : ''}>
              <td>
                <button type="button" className="sy-az-link" onClick={() => (f.dir ? (setDir(f.path), setPicked(null)) : setPicked(f.path))}>
                  {f.dir ? '📁' : '📄'} {f.name}
                </button>
                {f.writing && <span className="sy-tag warn">being written</span>}
              </td>
              <td>{f.dir ? 'Directory' : 'File'}</td>
              <td>{f.dir ? '' : bytes(f.size)}</td>
              <td>{f.dir ? '' : azTime(f.t)}</td>
            </tr>
          ))}
        />
        {file && (
          <div className="sy-az-props">
            <b>{picked}</b>
            <span>
              URL https://{acc.account}.file.core.windows.net/{name}/{picked}
            </span>
            <pre className="sy-az-pre">{file.content || '(empty)'}</pre>
          </div>
        )}
      </div>
      {folder !== null && (
        <Pane title="New directory" onClose={() => setFolder(null)} foot={<ABtn primary disabled={!folder.trim()} onClick={() => { update((s) => makeDir(s, target, `${dir ? `${dir}/` : ''}${folder.trim()}`)); setFolder(null) }}>OK</ABtn>}>
          <Row label="Name">
            <Input value={folder} onChange={setFolder} />
          </Row>
        </Pane>
      )}
      {upload && (
        <Pane
          title="Upload files"
          sub={`${name}/${dir}`}
          onClose={() => setUpload(null)}
          foot={
            <ABtn
              primary
              disabled={!upload.name.trim()}
              onClick={() => {
                const local = state.systems.local.files[upload.local]
                update((s) => putFile(s, target, `${dir ? `${dir}/` : ''}${upload.name.trim()}`, local ? (local.content ?? '') : upload.content, { writing: upload.slow, ...(local && { size: local.size }) }))
                setUpload(null)
              }}
            >
              Upload
            </ABtn>
          }
        >
          <Row label="Browse for files">
            <Select value={upload.local} onChange={(v) => setUpload({ ...upload, local: v, name: v || upload.name })} placeholder="Write the content below" options={Object.keys(state.systems.local.files)} />
          </Row>
          <Row label="File name">
            <Input value={upload.name} onChange={(v) => setUpload({ ...upload, name: v })} />
          </Row>
          {!upload.local && (
            <Row label="Content">
              <textarea className="pc-input pc-mono" rows={4} value={upload.content} onChange={(e) => setUpload({ ...upload, content: e.target.value })} />
            </Row>
          )}
          <Check checked={upload.slow} onChange={(v) => setUpload({ ...upload, slow: v })}>
            Slow link: leave the upload running (lab)
          </Check>
        </Pane>
      )}
    </div>
  )
}

function AccessKeys({ acc, update }) {
  return (
    <>
      <Info>Access keys give full access to the account. Rotate one key at a time: move apps to key2, rotate key1, then move them back. A SAS signed with a key stops working when that key is rotated.</Info>
      <Row label="Storage account name" group>
        <code>{acc.account}</code>
      </Row>
      {['key1', 'key2'].map((k) => (
        <div key={k} className="sy-az-key">
          <div className="sy-az-keyhead">
            <b>{k}</b>
            <ABtn onClick={() => update((s) => regenerateKey(s, acc.account, k))}>Rotate key</ABtn>
            <span className="sy-az-dim">Last rotated: {acc.keysRotated[k] ? azTime(acc.keysRotated[k]) : 'never'}</span>
          </div>
          <Row label="Key" group>
            <Masked value={acc.keys[k]} />
          </Row>
          <Row label="Connection string" group>
            <Masked value={connectionString(acc, k)} />
          </Row>
        </div>
      ))}
    </>
  )
}

const EXPIRES = [['5', '5 minutes'], ['60', '1 hour'], ['1440', '1 day'], ['10080', '7 days'], ['43200', '30 days']]
function SasBlade({ state, update, acc }) {
  const [f, setF] = useState({ blob: true, file: false, perms: 'rl', minutes: '60', key: 'key1', scope: '' })
  const [made, setMade] = useState(null)
  const set = (p) => setF({ ...f, ...p })
  const flip = (p) => set({ perms: f.perms.includes(p) ? f.perms.replace(p, '') : f.perms + p })
  const scopes = [['', 'Whole account (account SAS)'], ...Object.keys(acc.containers).map((n) => [n, `Container ${n} (service SAS)`]), ...Object.keys(acc.shares).map((n) => [n, `File share ${n} (service SAS)`])]
  const generate = () => {
    const isShare = Boolean(acc.shares[f.scope])
    const r = createSas(state, acc.account, { services: f.scope ? (isShare ? 'f' : 'b') : `${f.blob ? 'b' : ''}${f.file ? 'f' : ''}`, box: f.scope || null, perms: f.perms, expires: state.clock + Number(f.minutes) * MIN, key: f.key })
    update(() => r.state)
    setMade(r.token)
  }
  return (
    <>
      <Info>A shared access signature (SAS) is a signed URL query that grants limited rights until it expires. Azure keeps no list of the SAS tokens you sign, so you cannot revoke one: rotate the key that signed it. The list below is a lab view.</Info>
      <div className="sy-az-form">
        <Row label="Allowed services" group>
          <Check checked={f.blob} onChange={(v) => set({ blob: v })} disabled={Boolean(f.scope)}>
            Blob
          </Check>
          <Check checked={f.file} onChange={(v) => set({ file: v })} disabled={Boolean(f.scope)}>
            File
          </Check>
        </Row>
        <Row label="Scope (lab)">
          <Select value={f.scope} onChange={(v) => set({ scope: v })} options={scopes} />
        </Row>
        <Row label="Allowed permissions" group>
          <div className="sy-az-checks">
            {[['r', 'Read'], ['w', 'Write'], ['d', 'Delete'], ['l', 'List'], ['a', 'Add'], ['c', 'Create']].map(([p, label]) => (
              <Check key={p} checked={f.perms.includes(p)} onChange={() => flip(p)}>
                {label}
              </Check>
            ))}
          </div>
        </Row>
        <Row label="Start and expiry">
          <span className="sy-az-dim">Start {azTime(state.clock)}. Expiry after</span>
          <Select value={f.minutes} onChange={(v) => set({ minutes: v })} options={EXPIRES} />
        </Row>
        <Row label="Allowed protocols" group>
          <span>HTTPS only</span>
        </Row>
        <Row label="Signing key">
          <Select value={f.key} onChange={(v) => set({ key: v })} options={['key1', 'key2']} />
        </Row>
        <div>
          <ABtn primary disabled={!f.perms || (!f.scope && !f.blob && !f.file)} onClick={generate}>
            Generate SAS and connection string
          </ABtn>
        </div>
      </div>
      {made && (
        <div className="sy-az-made">
          <Row label="SAS token" group>
            <span className="sy-az-masked">
              <code>?{made}</code>
              <Copy text={`?${made}`} />
            </span>
          </Row>
          <Row label="Blob service SAS URL" group>
            <code>
              https://{acc.account}.blob.core.windows.net/?{made}
            </code>
          </Row>
        </div>
      )}
      <h3 className="sy-az-h3">Signatures issued in the lab</h3>
      <Grid
        heads={['Name', 'Scope', 'Permissions', 'Expiry', 'Signed with', 'State', 'Token']}
        empty="No SAS yet."
        rows={acc.sas
          .slice()
          .reverse()
          .map((x) => {
            const st = sasState(state, acc.account, x)
            return (
              <tr key={x.id}>
                <td>{x.name ?? x.id}</td>
                <td>{x.box ?? `account (${x.services.replace('b', 'Blob ').replace('f', 'File').trim()})`}</td>
                <td className="pc-mono">{x.perms}</td>
                <td>{azTime(x.expires)}</td>
                <td>{x.key}</td>
                <td className={st === 'Active' ? 'sy-ok' : 'sy-bad'}>{st}</td>
                <td>
                  <Copy text={`?${x.token}`} />
                </td>
              </tr>
            )
          })}
      />
    </>
  )
}

export const BlobStorage = (props) => <StoragePortal {...props} start="Containers" />
export const FileShares = (props) => <StoragePortal {...props} start="File shares" />

// ---------- Key Vault ----------

const VAULT_MENU = ['Overview', 'Activity log', 'Access control (IAM)', { title: 'Objects' }, 'Secrets', { title: 'Settings' }, 'Access configuration', 'Access policies', 'Networking']

export function KeyVault({ state, update }) {
  const vaults = Object.values(state.systems?.vaults ?? {})
  const [name, setName] = useState(vaults.length === 1 ? vaults[0].name : null)
  const [blade, setBlade] = useState('Secrets')
  const [secret, setSecret] = useState(null)
  const v = state.systems?.vaults?.[name]
  useEffect(() => {
    if (v) update((s) => mark(s, `vault:${v.name}`))
  }, [v?.name, update]) // eslint-disable-line react-hooks/exhaustive-deps
  const home = () => { setName(null); setSecret(null) }
  if (!v)
    return (
      <Shell crumbs={[['Home', home], ['Key vaults']]}>
        <div className="sy-az-page">
          <h2 className="sy-az-h2">Key vaults</h2>
          <Grid
            heads={['Name', 'Type', 'Resource group', 'Location']}
            empty="No key vaults in this lab."
            rows={vaults.map((x) => (
              <tr key={x.name}>
                <td>
                  <button type="button" className="sy-az-link" onClick={() => setName(x.name)}>
                    {x.name}
                  </button>
                </td>
                <td>Key vault</td>
                <td>harbor-integration-rg</td>
                <td>{x.region}</td>
              </tr>
            ))}
          />
        </div>
      </Shell>
    )
  const pick = (b) => { setBlade(b); setSecret(null) }
  const crumbs = [['Home', home], ['Key vaults', home], [v.name, () => pick('Overview')], ...(secret ? [['Secrets', () => setSecret(null)], [secret]] : [[blade]])]
  return (
    <Shell crumbs={crumbs}>
      {secret ? (
        <SecretVersions key={secret} state={state} update={update} v={v} name={secret} back={() => setSecret(null)} />
      ) : (
        <Resource icon="🔑" name={v.name} kind="Key vault" menu={VAULT_MENU} blade={blade} onBlade={pick}>
          {blade === 'Overview' && <VaultOverview v={v} update={update} />}
          {blade === 'Activity log' && <ActivityLog log={v.log} />}
          {blade === 'Secrets' && <Secrets state={state} update={update} v={v} open={setSecret} />}
          {blade === 'Access policies' && <Policies state={state} update={update} v={v} />}
          {blade === 'Access control (IAM)' && <Iam state={state} update={update} v={v} />}
          {blade === 'Access configuration' && <AccessConfig key={v.model} v={v} update={update} />}
          {blade === 'Networking' && <Networking key={v.name} x={v} kind="vault" onSave={(n) => update((s) => setNetwork(s, 'vault', v.name, n))} />}
        </Resource>
      )}
    </Shell>
  )
}

function VaultOverview({ v, update }) {
  return (
    <>
      <Cmd>
        <CBtn icon={v.up ? '■' : '▶'} onClick={() => update((s) => setSystemUp(s, 'vault', v.name, !v.up))}>
          {v.up ? 'Make unavailable (lab)' : 'Make available (lab)'}
        </CBtn>
      </Cmd>
      <Essentials
        items={[
          ['Resource group', 'harbor-integration-rg'], ['Location', v.region], ['Subscription', 'Harbor Lab'], ['Vault URI', `https://${v.name}.vault.azure.net/`], ['Pricing tier', 'Standard'],
          ['Soft delete', `Enabled, ${v.softDelete} days`], ['Permission model', v.model], ['Status', v.up ? 'Available' : 'Unavailable (lab outage)'], ['Secrets', String(Object.keys(v.secrets).length)],
        ]}
      />
    </>
  )
}

const expiryOf = (ver) => (ver?.expires === undefined || ver?.expires === null ? '' : azTime(ver.expires))
function Secrets({ state, update, v, open }) {
  const [adding, setAdding] = useState(null)
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setAdding({ name: '', value: '', contentType: '', days: '', enabled: true })}>
          Generate/Import
        </CBtn>
      </Cmd>
      <Grid
        heads={['Name', 'Type', 'Status', 'Expiration date']}
        empty="There are no secrets available."
        rows={Object.entries(v.secrets).map(([n, sec]) => {
          const cur = latestVersion(sec)
          const expired = cur?.expires !== undefined && cur?.expires !== null && state.clock >= cur.expires
          return (
            <tr key={n}>
              <td>
                <button type="button" className="sy-az-link" onClick={() => open(n)}>
                  {n}
                </button>
              </td>
              <td>{cur?.contentType ?? ''}</td>
              <td className={cur?.enabled ? 'sy-ok' : 'sy-bad'}>{cur?.enabled ? '✓ Enabled' : 'Disabled'}</td>
              <td className={expired ? 'sy-bad' : ''}>
                {expiryOf(cur)}
                {expired && ' (expired)'}
              </td>
            </tr>
          )
        })}
      />
      {adding && <SecretForm state={state} update={update} v={v} form={adding} setForm={setAdding} />}
    </>
  )
}

// Used both to create a secret and to add a version: the same name makes a new current version
function SecretForm({ state, update, v, form, setForm, fixedName }) {
  const set = (p) => setForm({ ...form, ...p })
  const name = fixedName ?? form.name.trim()
  return (
    <Pane
      title={fixedName ? 'Create a secret version' : 'Create a secret'}
      sub={v.name}
      onClose={() => setForm(null)}
      foot={
        <ABtn
          primary
          disabled={!/^[0-9a-zA-Z-]{1,127}$/.test(name) || !form.value}
          onClick={() => {
            update((s) => addSecretVersion(s, v.name, name, form.value, { contentType: form.contentType || undefined, enabled: form.enabled, expires: form.days ? state.clock + Number(form.days) * DAY : undefined }))
            setForm(null)
          }}
        >
          Create
        </ABtn>
      }
    >
      {!fixedName && (
        <Row label="Name">
          <Input value={form.name} onChange={(val) => set({ name: val })} placeholder="letters, numbers and hyphens" />
        </Row>
      )}
      <Row label="Secret value">
        <Input type="password" value={form.value} onChange={(val) => set({ value: val })} autoComplete="off" />
      </Row>
      <Row label="Content type (optional)">
        <Input value={form.contentType} onChange={(val) => set({ contentType: val })} />
      </Row>
      <Row label="Set expiration date">
        <Select value={form.days} onChange={(val) => set({ days: val })} placeholder="No expiration" options={[['0', 'Now (already expired)'], ['1', 'In 1 day'], ['30', 'In 30 days'], ['90', 'In 90 days'], ['365', 'In 1 year']]} />
      </Row>
      <Row label="Enabled" group>
        <span className="sy-az-radios inline">
          <label>
            <input type="radio" name="secret-enabled" checked={form.enabled} onChange={() => set({ enabled: true })} /> Yes
          </label>
          <label>
            <input type="radio" name="secret-enabled" checked={!form.enabled} onChange={() => set({ enabled: false })} /> No
          </label>
        </span>
      </Row>
      {!fixedName && v.secrets[name] && <Info>A secret named {name} exists. Create adds a new version and makes it the current one.</Info>}
    </Pane>
  )
}

function SecretVersions({ state, update, v, name }) {
  const sec = v.secrets[name]
  const [adding, setAdding] = useState(null)
  const [open, setOpen] = useState(null)
  if (!sec) return <Info kind="warn">The secret {name} was deleted. With soft delete it stays recoverable for {v.softDelete} days.</Info>
  const versions = sec.versions.slice().reverse()
  const ver = sec.versions.find((x) => x.id === open)
  const row = (x) => (
    <tr key={x.id}>
      <td>
        <button type="button" className="sy-az-link pc-mono" onClick={() => setOpen(x.id)}>
          {x.id}
        </button>
      </td>
      <td className={x.enabled ? 'sy-ok' : 'sy-bad'}>{x.enabled ? '✓ Enabled' : 'Disabled'}</td>
      <td>{azTime(x.notBefore ?? x.created)}</td>
      <td>{expiryOf(x)}</td>
    </tr>
  )
  return (
    <div className="sy-az-res">
      <header className="sy-az-title">
        <span className="sy-az-icon" aria-hidden="true">
          🔑
        </span>
        <div>
          <h2>{name}</h2>
          <small>Versions</small>
        </div>
      </header>
      <div className="sy-az-page">
        <Cmd>
          <CBtn icon="+" onClick={() => setAdding({ name, value: '', contentType: latestVersion(sec)?.contentType ?? '', days: '', enabled: true })}>
            New Version
          </CBtn>
          <CBtn icon="🗑" onClick={() => update((s) => deleteSecret(s, v.name, name))}>
            Delete
          </CBtn>
        </Cmd>
        <Grid heads={['Version', 'Status', 'Activation date', 'Expiration date']} rows={[<tr key="c" className="sy-az-group"><td colSpan={4}>CURRENT VERSION</td></tr>, row(versions[0]), ...(versions.length > 1 ? [<tr key="o" className="sy-az-group"><td colSpan={4}>OLDER VERSIONS</td></tr>, ...versions.slice(1).map(row)] : [])]} />
        <Info>A read without a version gets the current version, the newest one. When the current version is disabled the read fails with 403 Forbidden, even if an older version is enabled. An expiration date is informational for secrets: Key Vault still returns an expired secret, so the app has to check it.</Info>
      </div>
      {adding && <SecretForm state={state} update={update} v={v} form={adding} setForm={setAdding} fixedName={name} />}
      {ver && <VersionPane key={ver.id} state={state} update={update} v={v} name={name} ver={ver} onClose={() => setOpen(null)} />}
    </div>
  )
}

function VersionPane({ state, update, v, name, ver, onClose }) {
  const [enabled, setEnabled] = useState(ver.enabled)
  return (
    <Pane
      title={ver.id}
      sub={name}
      onClose={onClose}
      foot={
        <ABtn primary disabled={enabled === ver.enabled} onClick={() => update((s) => setSecretVersion(s, v.name, name, ver.id, { enabled }))}>
          Apply
        </ABtn>
      }
    >
      <Row label="Secret Identifier" group>
        <code className="sy-az-wrap">{secretUri(v.name, name, ver.id)}</code>
      </Row>
      <Row label="Content type" group>
        <span>{ver.contentType ?? '(none)'}</span>
      </Row>
      <Row label="Created" group>
        <span>{azTime(ver.created)}</span>
      </Row>
      <Row label="Expiration date" group>
        <span className={ver.expires !== undefined && state.clock >= ver.expires ? 'sy-bad' : ''}>{expiryOf(ver) || 'Not set'}</span>
      </Row>
      <Row label="Enabled" group>
        <span className="sy-az-radios inline">
          <label>
            <input type="radio" name="version-enabled" checked={enabled} onChange={() => setEnabled(true)} /> Yes
          </label>
          <label>
            <input type="radio" name="version-enabled" checked={!enabled} onChange={() => setEnabled(false)} /> No
          </label>
        </span>
      </Row>
      <Row label="Secret value" group>
        <Masked value={ver.value} label="Show Secret Value" />
      </Row>
    </Pane>
  )
}

// the deployed apps, the app registrations a lab made before its app is deployed, and who already has access
const principals = (state, v) => [...new Set([...state.apps.map((a) => a.name), ...(state.systems?.principals ?? []), ...Object.keys(v.access), ...Object.keys(v.roles)])]
function Policies({ state, update, v }) {
  const [edit, setEdit] = useState(null) // { principal, perms, isNew }
  if (v.model !== ACCESS_MODELS[0])
    return <Info kind="warn">Access policies are not available because this vault uses the Azure role-based access control permission model. Change it in Access configuration, or grant roles in Access control (IAM).</Info>
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setEdit({ principal: '', perms: ['get', 'list'], isNew: true })}>
          Create
        </CBtn>
      </Cmd>
      <Grid
        heads={['Name', 'Category', 'Secret Permissions', '']}
        empty="No access policies."
        rows={Object.entries(v.access).map(([p, perms]) => (
          <tr key={p}>
            <td>{p}</td>
            <td>{state.apps.some((a) => a.name === p) || (state.systems?.principals ?? []).includes(p) ? 'Application' : 'Group'}</td>
            <td>{perms.map(cap).join(', ')}</td>
            <td className="sy-az-acts">
              <button type="button" className="sy-az-link" onClick={() => setEdit({ principal: p, perms })}>
                Edit
              </button>
              <button type="button" className="sy-az-link" onClick={() => update((s) => setVaultAccess(s, v.name, p, null))}>
                Delete
              </button>
            </td>
          </tr>
        ))}
      />
      <Info>The lab names each app's identity after the app. An app without get on secrets gets 403 Forbidden with the code ForbiddenByPolicy.</Info>
      {edit && (
        <Pane
          title={edit.isNew ? 'Create an access policy' : `Edit access policy: ${edit.principal}`}
          onClose={() => setEdit(null)}
          foot={
            <ABtn primary disabled={!edit.principal.trim()} onClick={() => { update((s) => setVaultAccess(s, v.name, edit.principal.trim(), edit.perms)); setEdit(null) }}>
              {edit.isNew ? 'Create' : 'Save'}
            </ABtn>
          }
        >
          {edit.isNew && (
            <Row label="Principal">
              <Select value={edit.principal} onChange={(p) => setEdit({ ...edit, principal: p })} placeholder="Select an app identity" options={principals(state, v)} />
            </Row>
          )}
          <Row label="Secret permissions" group>
            <div className="sy-az-checks">
              {VAULT_PERMS.map((p) => (
                <Check key={p} checked={edit.perms.includes(p)} onChange={(on) => setEdit({ ...edit, perms: on ? [...edit.perms, p] : edit.perms.filter((x) => x !== p) })}>
                  {cap(p)}
                </Check>
              ))}
            </div>
          </Row>
        </Pane>
      )}
    </>
  )
}

function Iam({ state, update, v }) {
  const [adding, setAdding] = useState(null)
  const rows = Object.entries(v.roles).flatMap(([p, roles]) => roles.map((r) => [p, r]))
  return (
    <>
      <Cmd>
        <CBtn icon="+" onClick={() => setAdding({ role: 'Key Vault Secrets User', principal: '' })}>
          Add role assignment
        </CBtn>
      </Cmd>
      {v.model !== ACCESS_MODELS[1] && <Info kind="warn">This vault uses vault access policies. Role assignments on secrets count only after you switch the permission model to Azure role-based access control in Access configuration.</Info>}
      <Grid
        heads={['Role', 'Name', 'Scope', 'Allows on secrets', '']}
        empty="No role assignments on this vault."
        rows={rows.map(([p, r]) => (
          <tr key={`${p}-${r}`}>
            <td>{r}</td>
            <td>{p}</td>
            <td>This resource</td>
            <td>{VAULT_ROLES[r].join(', ')}</td>
            <td>
              <button type="button" className="sy-az-link" onClick={() => update((s) => setVaultRoles(s, v.name, p, v.roles[p].filter((x) => x !== r)))}>
                Remove
              </button>
            </td>
          </tr>
        ))}
      />
      {adding && (
        <Pane
          title="Add role assignment"
          onClose={() => setAdding(null)}
          foot={
            <ABtn primary disabled={!adding.principal} onClick={() => { update((s) => setVaultRoles(s, v.name, adding.principal, [...new Set([...(v.roles[adding.principal] ?? []), adding.role])])); setAdding(null) }}>
              Review + assign
            </ABtn>
          }
        >
          <Row label="Role">
            <Select value={adding.role} onChange={(r) => setAdding({ ...adding, role: r })} options={Object.keys(VAULT_ROLES)} />
          </Row>
          <Row label="Members">
            <Select value={adding.principal} onChange={(p) => setAdding({ ...adding, principal: p })} placeholder="Select a managed identity" options={principals(state, v)} />
          </Row>
          <Info>Key Vault Secrets User reads secret values. Key Vault Reader sees only metadata, never the values.</Info>
        </Pane>
      )}
    </>
  )
}

function AccessConfig({ v, update }) {
  const [model, setModel] = useState(v.model)
  return (
    <>
      <h3 className="sy-az-h3">Permission model</h3>
      <div className="sy-az-radios" role="radiogroup">
        {ACCESS_MODELS.map((m) => (
          <label key={m}>
            <input type="radio" name="kv-model" checked={model === m} onChange={() => setModel(m)} /> {m}
            {m === ACCESS_MODELS[1] && ' (recommended)'}
          </label>
        ))}
      </div>
      <Info>Only one model is in force. With role-based access control the access policies are ignored, and the other way round.</Info>
      <ABtn primary disabled={model === v.model} onClick={() => update((s) => setVaultModel(s, v.name, model))}>
        Apply
      </ABtn>
    </>
  )
}
