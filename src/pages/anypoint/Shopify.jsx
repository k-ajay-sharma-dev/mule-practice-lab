// Shopify: an admin screen of the Harbor web store harbor-goods.myshopify.com. Orders (with a lab-made Create test order),
// Products and their inventory per location, Apps (Develop apps: custom apps with Admin API access scopes, API
// credentials, webhook subscriptions with their deliveries, and a lab-made log of the Admin API calls with their cost),
// and Settings, Notifications with the webhooks made by hand. The store is a lab tool: one staff account does everything.
import { Fragment, useEffect, useState } from 'react'
import { endpointOf, mark, stamp, timeText } from '../../lab/platform.js'
import {
  API_VERSION, API_VERSIONS, appOf, createApp, createSubscription, createTestOrder, deleteSubscription, fulfillOrder, GQL, headersOf, installApp, isFilled, levelOf, REST, revealToken, saveScopes, SCOPES, sendTestNotification, setAvailable,
  subsOf, throttleOf, TOPICS, totalOrders, uninstallApp, upgradeShopify, variants,
} from '../../lab/platform-shopify.js'
import { Btn, Check, Field, Input, Note, Select, Table, Tabs } from './parts.jsx'

const NAV = [
  ['orders', 'Orders'],
  ['products', 'Products'],
  ['apps', 'Apps'],
  ['notifications', 'Settings, Notifications'],
]
const eur = (n) => `€${Number(n).toFixed(2)}`
const codeText = (r) => (r ? (r.code ? `${r.code}` : r.text.split(':')[0]) : '')
const ok = (r) => r && r.code >= 200 && r.code < 300

export default function Shopify({ state, update, place }) {
  const y = state.shopify
  const [page, setPage] = useState(NAV.some(([k]) => k === place?.page) ? place.page : 'orders')
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (y && !isFilled(y)) update((s) => upgradeShopify(s))
  }, [y, update])
  useEffect(() => {
    if (isFilled(y) && (page === 'orders' || page === 'products')) update((s) => mark(s, `shopify:${page}`))
  }, [page, Boolean(isFilled(y))]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!y)
    return (
      <main className="pc-main">
        <h2>Shopify</h2>
        <p className="pc-empty pc-boxed">This lab has no Shopify store.</p>
      </main>
    )
  if (!isFilled(y)) return <main className="pc-main">Opening the store...</main>

  // runs an action on the current state, saves its state and gives back its result
  const act = (fn) => {
    const r = fn(state)
    update(() => r.state)
    if (r.result?.text) setMsg({ ok: r.result.ok !== false, text: r.result.text })
    return r.result
  }
  const props = { y, state, update, act, place }
  return (
    <main className="pc-main shp-app">
      <div className="shp-top">
        <b className="shp-logo">shopify</b>
        <span>{y.name}</span>
        <span className="shp-dim">{y.shop}</span>
        <span className="shp-clock">{timeText(state.clock)}</span>
      </div>
      <div className="shp-shell">
        <nav className="shp-nav" aria-label="Shopify admin">
          {NAV.map(([k, label]) => (
            <button key={k} type="button" className={page === k ? 'on' : ''} aria-current={page === k ? 'page' : undefined} onClick={() => (setPage(k), setMsg(null))}>
              {label}
            </button>
          ))}
        </nav>
        <section className="shp-page">
          {msg && (
            <p className={`shp-toast ${msg.ok ? 'good' : 'bad'}`} role="status">
              {msg.text}
            </p>
          )}
          {page === 'orders' && <Orders {...props} />}
          {page === 'products' && <Products {...props} />}
          {page === 'apps' && <Apps {...props} />}
          {page === 'notifications' && <Notifications {...props} />}
        </section>
      </div>
    </main>
  )
}

// ---------- Orders ----------

function Orders({ y, act }) {
  const [form, setForm] = useState({ sku: 'H-1250', qty: '1', email: '' })
  const [open, setOpen] = useState(null)
  const list = [...y.orders].reverse()
  const o = open && y.orders.find((x) => x.name === open)
  return (
    <>
      <h2>Orders</h2>
      <form className="shp-card shp-row" onSubmit={(e) => (e.preventDefault(), act((s) => createTestOrder(s, { sku: form.sku, qty: Number(form.qty) || 1, email: form.email })))}>
        <h3>Create test order</h3>
        <Field label="Product">
          <Select value={form.sku} onChange={(sku) => setForm({ ...form, sku })} options={variants(y).map((v) => [v.sku, `${v.sku} ${v.product.title}`])} />
        </Field>
        <Field label="Quantity">
          <input className="pc-input" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} inputMode="numeric" />
        </Field>
        <Field label="Customer email (optional)">
          <Input value={form.email} onChange={(email) => setForm({ ...form, email })} placeholder="test.buyer@mail.example" />
        </Field>
        <Btn kind="primary" type="submit">
          Create test order
        </Btn>
        <small className="shp-dim">Lab-made: the order is placed and paid at once, and fires orders/create and inventory_levels/update.</small>
      </form>
      {y.archived?.count > 0 && <Note>{y.archived.count} older orders are in the store as well. They are not listed here, the Admin API returns them.</Note>}
      <Table
        heads={['Order', 'Date', 'Customer', 'Total', 'Payment status', 'Fulfillment status', 'Items']}
        empty="No orders yet."
        rows={list.slice(0, 60).map((x) => (
          <tr key={x.name}>
            <td>
              <button type="button" className="pc-link" onClick={() => setOpen(x.name === open ? null : x.name)}>
                {x.name}
              </button>
              {x.test && <span className="shp-badge">Test</span>}
            </td>
            <td>{stamp(x.t)}</td>
            <td>{x.email}</td>
            <td>{eur(x.total)}</td>
            <td>
              <span className="shp-badge">{x.financial === 'paid' ? 'Paid' : x.financial}</span>
            </td>
            <td>
              <span className={`shp-badge ${x.fulfillment ? '' : 'warn'}`}>{x.fulfillment ? 'Fulfilled' : 'Unfulfilled'}</span>
            </td>
            <td>{x.lines.reduce((n, l) => n + l.qty, 0)}</td>
          </tr>
        ))}
      />
      {o && (
        <div className="shp-card">
          <h3>
            Order {o.name} <small className="shp-dim">id {o.id}</small>
          </h3>
          <Table heads={['SKU', 'Product', 'Quantity', 'Price']} rows={o.lines.map((l) => <tr key={l.id}><td>{l.sku}</td><td>{l.title}</td><td>{l.qty}</td><td>{eur(l.price)}</td></tr>)} />
          <p className="shp-dim">
            Created {stamp(o.t)}, updated {stamp(o.updatedAt)}. {o.fulfillments.length} fulfillment{o.fulfillments.length === 1 ? '' : 's'}.
          </p>
          <Btn disabled={o.fulfillment === 'fulfilled'} onClick={() => act((s) => fulfillOrder(s, o.name))}>
            Fulfill items
          </Btn>
        </div>
      )}
    </>
  )
}

// ---------- Products and inventory ----------

function Products({ y, act }) {
  const [edit, setEdit] = useState({})
  return (
    <>
      <h2>Products</h2>
      <p className="shp-dim">Inventory is tracked for each variant at each location. Selling is stopped when a variant is out of stock at Harbor Warehouse.</p>
      <Table
        heads={['Product', 'SKU', 'Status', 'Price', ...y.locations.map((l) => `${l.name}: available`), 'Inventory item']}
        rows={variants(y).map((v) => (
          <tr key={v.id}>
            <td>{v.product.title}</td>
            <td className="pc-mono">{v.sku}</td>
            <td>
              <span className="shp-badge good">Active</span>
            </td>
            <td>{eur(v.price)}</td>
            {y.locations.map((l) => {
              const lv = levelOf(y, v.itemId, l.id)
              const key = `${v.itemId}:${l.id}`
              return (
                <td key={l.id}>
                  <span className="shp-qty">
                    <input className="pc-input" aria-label={`Available of ${v.sku} at ${l.name}`} value={edit[key] ?? String(lv?.available ?? 0)} onChange={(e) => setEdit({ ...edit, [key]: e.target.value })} inputMode="numeric" />
                    {edit[key] !== undefined && (
                      <Btn
                        onClick={() => {
                          act((s) => setAvailable(s, v.itemId, l.id, edit[key]))
                          setEdit(({ [key]: _gone, ...rest }) => rest)
                        }}
                      >
                        Save
                      </Btn>
                    )}
                  </span>
                  <small className="shp-dim">updated {lv ? timeText(lv.updatedAt) : ''}</small>
                </td>
              )
            })}
            <td className="pc-mono">{v.itemId}</td>
          </tr>
        ))}
      />
    </>
  )
}

// ---------- Apps ----------

function Apps({ y, state, act, place }) {
  // place.app and place.tab open an app and one of its tabs, for a link from a lab
  const [open, setOpen] = useState(place?.app ?? null)
  const [form, setForm] = useState(null)
  const a = open && appOf(y, open)
  if (a) return <AppPage a={a} y={y} state={state} act={act} first={place?.tab} back={() => setOpen(null)} />
  return (
    <>
      <h2>Apps and sales channels, Develop apps</h2>
      <p className="shp-dim">Custom apps are made for this store only. Each one gets its own Admin API access token, access scopes and API secret key.</p>
      <div className="shp-row">
        <Btn kind="primary" onClick={() => setForm({ name: '', developer: '' })}>
          Create an app
        </Btn>
      </div>
      {form && (
        <form className="shp-card shp-row" onSubmit={(e) => {
          e.preventDefault()
          const r = act((s) => createApp(s, form))
          if (r.ok) {
            setForm(null)
            setOpen(r.id)
          }
        }}>
          <h3>Create an app</h3>
          <Field label="App name" required>
            <Input value={form.name} onChange={(name) => setForm({ ...form, name })} />
          </Field>
          <Field label="App developer" hint="Shopify mails this address about failing webhooks.">
            <Input value={form.developer} onChange={(developer) => setForm({ ...form, developer })} placeholder="ops@harbor.example" />
          </Field>
          <Btn kind="primary" type="submit">
            Create app
          </Btn>
          <Btn onClick={() => setForm(null)}>Cancel</Btn>
        </form>
      )}
      <Table
        heads={['App', 'Status', 'Access scopes', 'Created', 'Webhook subscriptions']}
        empty="No custom apps yet."
        rows={y.apps.map((x) => (
          <tr key={x.id}>
            <td>
              <button type="button" className="pc-link" onClick={() => setOpen(x.id)}>
                {x.name}
              </button>
            </td>
            <td>
              <span className={`shp-badge ${x.installed ? 'good' : 'warn'}`}>{x.installed ? 'Installed' : 'Not installed'}</span>
            </td>
            <td className="pc-mono">{x.granted.join(', ') || 'None'}</td>
            <td>{stamp(x.created)}</td>
            <td>{subsOf(y, x.id).length}</td>
          </tr>
        ))}
      />
    </>
  )
}

const APP_TABS = ['Overview', 'Configuration', 'API credentials', 'Webhooks', 'API calls']
function AppPage({ a, y, state, act, first, back }) {
  const [tab, setTab] = useState(APP_TABS.includes(first) ? first : 'Overview')
  useEffect(() => {
    if (tab === 'Webhooks' || tab === 'API calls') act((s) => ({ state: mark(s, `shopify:${tab === 'Webhooks' ? 'webhooks' : 'calls'}:${a.id}`), result: null }))
  }, [tab, a.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <button type="button" className="pc-link" onClick={back}>
        ← Develop apps
      </button>
      <h2>
        {a.name} <span className={`shp-badge ${a.installed ? 'good' : 'warn'}`}>{a.installed ? 'Installed' : 'Not installed'}</span>
      </h2>
      <Tabs tabs={APP_TABS} value={tab} onChange={setTab} />
      {tab === 'Overview' && (
        <div className="shp-card">
          <dl className="shp-dl">
            <dt>App developer</dt>
            <dd>{a.developer}</dd>
            <dt>Created</dt>
            <dd>{stamp(a.created)}</dd>
            <dt>Installed</dt>
            <dd>{a.installed !== null ? stamp(a.installed) : 'Not installed'}</dd>
            <dt>Granted scopes</dt>
            <dd className="pc-mono">{a.granted.join(', ') || 'None'}</dd>
            <dt>Webhook API version</dt>
            <dd>{y.apiVersion}</dd>
          </dl>
        </div>
      )}
      {tab === 'Configuration' && <Scopes a={a} act={act} />}
      {tab === 'API credentials' && <Credentials a={a} act={act} />}
      {tab === 'Webhooks' && <Webhooks owner={a.id} y={y} state={state} act={act} />}
      {tab === 'API calls' && <Calls a={a} y={y} state={state} />}
    </>
  )
}

function Scopes({ a, act }) {
  const [pick, setPick] = useState(a.scopes)
  const changed = pick.length !== a.scopes.length || pick.some((x) => !a.scopes.includes(x))
  return (
    <div className="shp-card">
      <h3>Admin API integration</h3>
      <h4>Admin API access scopes</h4>
      <p className="shp-dim">Select the data the app may read and change. A write scope includes the read scope of the same data.</p>
      <div className="shp-scopes">
        {SCOPES.map((x) => (
          <Check key={x} checked={pick.includes(x)} onChange={(on) => setPick(on ? [...pick, x] : pick.filter((z) => z !== x))}>
            <span className="pc-mono">{x}</span>
          </Check>
        ))}
      </div>
      <div className="shp-row">
        <Btn kind="primary" disabled={!changed} onClick={() => act((s) => saveScopes(s, a.id, pick))}>
          Save
        </Btn>
        {a.installed && a.scopes.join() !== a.granted.join() && <span className="shp-dim">Saved scopes differ from the granted ones. Install the app again under API credentials.</span>}
      </div>
    </div>
  )
}

function Credentials({ a, act }) {
  const [token, setToken] = useState(null)
  const [show, setShow] = useState(false)
  const pending = a.installed && a.scopes.join() !== a.granted.join()
  return (
    <>
      <div className="shp-card">
        <h3>Admin API access token</h3>
        {!a.installed ? (
          <>
            <p className="shp-dim">Install the app to get the Admin API access token. The store grants the scopes from Configuration.</p>
            <Btn kind="primary" onClick={() => act((s) => installApp(s, a.id))}>
              Install app
            </Btn>
          </>
        ) : (
          <>
            {token ? (
              <p>
                <code className="shp-secret">{token}</code> <small className="shp-dim">Copy it now. It is not shown again.</small>
              </p>
            ) : a.tokenShown ? (
              <p className="shp-dim">The token was revealed before and cannot be shown again. Uninstall and install the app to get a new one, which ends the old token.</p>
            ) : (
              <Btn kind="primary" onClick={() => setToken(act((s) => revealToken(s, a.id)))}>
                Reveal token once
              </Btn>
            )}
            <p className="shp-dim">
              Granted: <span className="pc-mono">{a.granted.join(', ')}</span>
            </p>
            <div className="shp-row">
              {pending && (
                <Btn kind="primary" onClick={() => act((s) => installApp(s, a.id))}>
                  Install app
                </Btn>
              )}
              <Btn onClick={() => (setToken(null), act((s) => uninstallApp(s, a.id)))}>Uninstall app</Btn>
            </div>
          </>
        )}
      </div>
      <div className="shp-card">
        <h3>API key and secret key</h3>
        <dl className="shp-dl">
          <dt>API key</dt>
          <dd className="pc-mono">{a.apiKey}</dd>
          <dt>API secret key</dt>
          <dd>
            <code className="shp-secret">{show ? a.secret : '•'.repeat(24)}</code>{' '}
            <Btn onClick={() => setShow(!show)}>{show ? 'Hide' : 'Reveal'}</Btn>
          </dd>
        </dl>
        <p className="shp-dim">Webhook subscriptions of this app are signed with the API secret key: X-Shopify-Hmac-Sha256 is the base64 HMAC-SHA256 of the raw body.</p>
      </div>
    </>
  )
}

// the public endpoints of the apps in the environment, to build a webhook URL
const endpoints = (state) => state.apps.filter((x) => x.env === state.env && x.publicEndpoint).map((x) => `${endpointOf(x)}/api`)

function Webhooks({ owner, y, state, act }) {
  const [form, setForm] = useState({ topic: 'orders/create', format: 'json', address: '', apiVersion: API_VERSION })
  const [open, setOpen] = useState(null)
  const subs = subsOf(y, owner)
  const ids = new Set(subs.map((w) => w.id))
  const removed = (y.removed ?? []).filter((r) => r.app === owner)
  const deliveries = [...y.deliveries].filter((d) => d.app === owner || ids.has(d.sub)).reverse()
  const d = open && y.deliveries.find((x) => x.id === open)
  return (
    <>
      <div className="shp-card">
        <h3>Webhook subscriptions</h3>
        <Table
          heads={['Topic', 'URL', 'Format', 'API version', 'Created', 'Failed deliveries in a row', '']}
          empty="No webhook subscriptions."
          rows={subs.map((w) => (
            <tr key={w.id}>
              <td className="pc-mono">{w.topic}</td>
              <td className="pc-mono shp-wrap">{w.address}</td>
              <td>JSON</td>
              <td>{w.apiVersion}</td>
              <td>{stamp(w.created)}</td>
              <td>{w.fails ? `${w.fails}, since ${stamp(w.failingSince)}` : 0}</td>
              <td>
                <Btn onClick={() => act((s) => deleteSubscription(s, w.id))}>Delete</Btn>
                {owner === 'admin' && <Btn onClick={() => act((s) => sendTestNotification(s, w.id))}>Send test notification</Btn>}
              </td>
            </tr>
          ))}
        />
        {removed.length > 0 && (
          <>
            <h4>Removed subscriptions</h4>
            <ul className="shp-list">
              {removed.map((r) => (
                <li key={r.id}>
                  {r.topic} to <span className="pc-mono shp-wrap">{r.address}</span>: removed by Shopify at {stamp(r.t)} after {r.fails} failed deliveries in a row over 4 hours.
                </li>
              ))}
            </ul>
          </>
        )}
        <form className="shp-row shp-sub" onSubmit={(e) => (e.preventDefault(), act((s) => createSubscription(s, owner, form)))}>
          <h4>{owner === 'admin' ? 'Create webhook' : 'Create subscription'}</h4>
          <Field label={owner === 'admin' ? 'Event' : 'Topic'}>
            <Select value={form.topic} onChange={(topic) => setForm({ ...form, topic })} options={Object.keys(TOPICS)} />
          </Field>
          <Field label="Format">
            <Select value={form.format} onChange={(format) => setForm({ ...form, format })} options={[['json', 'JSON']]} />
          </Field>
          <Field label="URL" wide hint="HTTPS only.">
            <input className="pc-input" list="shp-endpoints" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="https://..." />
            <datalist id="shp-endpoints">
              {endpoints(state).map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </Field>
          <Field label={owner === 'admin' ? 'Webhook API version' : 'API version'}>
            <Select value={form.apiVersion} onChange={(apiVersion) => setForm({ ...form, apiVersion })} options={API_VERSIONS} />
          </Field>
          <Btn kind="primary" type="submit">
            {owner === 'admin' ? 'Save' : 'Create'}
          </Btn>
          {owner !== 'admin' && <small className="shp-dim">Lab-made form: in a store you call webhookSubscriptionCreate with the token of the app. It does the same.</small>}
        </form>
      </div>
      <div className="shp-card">
        <h3>Deliveries</h3>
        <p className="shp-dim">Shopify waits 5 seconds for a 2xx answer. A failed delivery is retried 8 times over 4 hours with the same webhook ID. After 8 failures in a row the subscription is removed.</p>
        <Table
          heads={['Webhook ID', 'Topic', 'Triggered at', 'Attempts', 'Last response', 'Status', 'Next retry']}
          empty="No deliveries yet."
          rows={deliveries.slice(0, 40).map((x) => {
            const last = x.results.at(-1)
            return (
              <tr key={x.id} className={open === x.id ? 'on' : ''}>
                <td>
                  <button type="button" className="pc-link pc-mono" onClick={() => setOpen(open === x.id ? null : x.id)}>
                    {x.id.slice(0, 8)}
                  </button>
                </td>
                <td className="pc-mono">{x.topic}</td>
                <td>{timeText(x.at)}</td>
                <td>{x.attempts}</td>
                <td>{last ? `${last.text} at ${timeText(last.t)}` : ''}</td>
                <td>
                  <span className={`shp-badge ${x.status === 'delivered' ? 'good' : x.status === 'pending' && !last ? '' : 'bad'}`}>{x.status === 'delivered' ? 'Delivered' : x.status === 'removed' ? 'Dropped' : last ? 'Failing' : 'Queued'}</span>
                </td>
                <td>{x.status === 'pending' && last ? stamp(x.due) : ''}</td>
              </tr>
            )
          })}
        />
        {d && (
          <div className="shp-detail">
            <h4>Delivery {d.id}</h4>
            <pre className="shp-pre">{headersOf(y, d).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>
            <h4>Raw body</h4>
            <pre className="shp-pre">{d.body}</pre>
            <h4>Attempts</h4>
            <ul className="shp-list">
              {d.results.map((r, i) => (
                <li key={i} className={ok(r) ? '' : 'bad'}>
                  {stamp(r.t)}: {r.text || codeText(r)}, {r.ms} ms
                </li>
              ))}
              {d.results.length === 0 && <li>Not delivered yet.</li>}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}

function Calls({ a, y, state }) {
  const st = throttleOf(y, a.id, state.clock)
  const rest = y.buckets?.[a.id]?.rest
  const used = rest ? Math.max(0, rest[0] - ((state.clock - rest[1]) / 1000) * REST.leak) : 0
  const calls = y.calls.filter((c) => c.app === a.name).reverse()
  return (
    <div className="shp-card">
      <h3>API calls</h3>
      <p className="shp-dim">Lab-made view of the Admin API calls of this app and its limits. In a store you read the same numbers in extensions.cost of each GraphQL answer and in the header X-Shopify-Shop-Api-Call-Limit.</p>
      <dl className="shp-dl">
        <dt>GraphQL throttleStatus</dt>
        <dd className="pc-mono">
          maximumAvailable {st.maximumAvailable}, currentlyAvailable {st.currentlyAvailable}, restoreRate {st.restoreRate} a second. A single query may cost at most {GQL.single}.
        </dd>
        <dt>REST bucket</dt>
        <dd className="pc-mono">
          {Math.ceil(used)}/{REST.size}, leaks {REST.leak} a second
        </dd>
        <dt>Orders in the store</dt>
        <dd>{totalOrders(y)}</dd>
      </dl>
      <Table
        heads={['Time', 'API', 'Call', 'Status', 'Cost']}
        empty="No calls yet."
        rows={calls.map((c, i) => (
          <Fragment key={i}>
            <tr className={c.status >= 400 || /THROTTLED|DENIED|EXCEEDED/.test(c.text) ? 'bad' : ''}>
              <td>{timeText(c.t)}</td>
              <td>{c.kind}</td>
              <td className="pc-mono shp-wrap">{c.text}</td>
              <td>{c.status}</td>
              <td>{c.cost ?? ''}</td>
            </tr>
          </Fragment>
        ))}
      />
    </div>
  )
}

// ---------- Settings, Notifications ----------

function Notifications({ y, state, act }) {
  return (
    <>
      <h2>Settings, Notifications, Webhooks</h2>
      <p className="shp-dim">
        Webhooks made here belong to the store, not to an app. Your webhooks will be signed with <code className="shp-secret">{y.notifyKey}</code>
      </p>
      <Webhooks owner="admin" y={y} state={state} act={act} />
    </>
  )
}
