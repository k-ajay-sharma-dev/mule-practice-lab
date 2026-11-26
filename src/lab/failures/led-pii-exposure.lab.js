// The guided lab led-pii-exposure. See platform-labs.js for the shape of a lab.
import { at, mark } from '../platform.js'
import { app, ask, call, called, change, CLIENTS, OPS, until } from '../platform-kit.js'
import { jarOf, LED, ledProject, patchApp } from '../platform-project.js'
import { listOf, pathsOf, processCustomer, SAMPLE_ANSWER, shapePartner } from './led-pii-exposure.pkg.js'

const [MOBILE_APP, PARTNER_PORTAL] = CLIENTS
const { mobile, partner, process: proc } = LED
const ALLOW = 'orderId,status,customer.id,customer.name,stock'
const AGREED = ['customer.id', 'customer.name', 'orderId', 'status', 'stock']
const CUSTOMER_FIELDS = ['id', 'name']
const RELEASES = { customers: 'customers-sapi-1.3', process: 'order-fulfilment-papi-1.2', partner: 'partner-orders-eapi-1.2' }
const VERSION = { customers: '1.3.0', process: '1.2.0', partner: '1.2.0' }

const running = (s, d) => app(s, d.app)?.status === 'Running'
const props = (s, d) => ({ ...app(s, d.app)?.props, ...app(s, d.app)?.secrets })
const same = (a, b) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])
// the partner answer when the Process API passes the whole customer on: only the allow list can make it right
const partnerShaped = (s) => running(s, partner) && same(pathsOf(shapePartner(props(s, partner), SAMPLE_ANSWER)), AGREED)
const processGuarded = (s) => running(s, proc) && same(listOf(props(s, proc)['customer.fields']), CUSTOMER_FIELDS)
// what partners get right now, with both layers as they are configured
const partnerNow = (s) => shapePartner(props(s, partner), { ...SAMPLE_ANSWER, customer: processCustomer(props(s, proc), SAMPLE_ANSWER.customer) })
const after = (s, d, status) => (s.lastCalls ?? []).some((c) => c.app === d.app && c.status === status && c.t > Math.max(app(s, partner.app).updated, app(s, proc.app).updated))

const lab = {
  id: 'p-fail-led-pii-exposure',
  group: 'API-led failures',
  title: 'The partner API leaks customer data',
  minutes: 15,
  scenario:
    'Last week customers-sapi 1.3.0 went live. It returns every column of the customer table, now with phone, date of birth, loyalty card number and the internal credit limit. This morning a security review found those fields in a sample answer of the Partner Orders Experience API. Partners have no right to see them. Find the layer that passes them through and fix it without breaking the mobile app.',
  start() {
    const s = ledProject({
      mail: [
        {
          t: at(1, 8, 45),
          to: OPS,
          subject: 'Security review: personal data in the partner API',
          body: 'A sample answer of GET /partner-orders/O-1001 holds customer.phone, customer.dateOfBirth, customer.loyaltyCard and customer.creditLimit. The contract in Exchange lists none of them. After the review last month someone added response.exclude=customer.phone to partner-orders-eapi, but more fields came since. Please fix it today.',
          source: 'Harbor Foods security team',
        },
      ],
    })
    for (const key of Object.keys(RELEASES)) {
      const jar = { pkg: RELEASES[key], autodiscovery: jarOf(key).autodiscovery, jar: `${LED[key].app}-${VERSION[key]}-mule-application.jar` }
      s.jars.push(jar)
      patchApp(s, key, { pkg: jar.pkg, jar: jar.jar })
    }
    patchApp(s, 'partner', { props: { 'response.exclude': 'customer.phone' } })
    return until(s, at(1, 9))
  },
  steps: [
    { title: 'Read the security review', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Call the partner API', how: 'API client, partner-orders-eapi as Partner Portal, GET /partner-orders/O-1001. Look at the customer in the body: dateOfBirth, loyaltyCard and creditLimit are there. Only phone is missing.', done: (s) => called(s, partner.app, 200) },
    { title: 'Call the mobile API', how: 'API client, mobile-orders-eapi as Mobile App, GET /my-orders/O-1001. It gets the same Process API answer and sends three fields.', done: (s) => called(s, mobile.app, 200) },
    { title: 'Read the logs of order-fulfilment-papi', how: `Runtime Manager, Applications, ${proc.app}, Logs. A line lists the fields of the order status it answered. Compare it with the line in the logs of ${partner.app}.`, done: (s) => Boolean(s.seen[`logs:${proc.app}`]) },
    ask(
      'Which layer leaks',
      'customers-sapi returns the fields, order-fulfilment-papi joins them, partner-orders-eapi sends them out. Which layer failed in its job?',
      ['customers-sapi, it should never read those columns', 'order-fulfilment-papi, it is the only one that joins data', 'partner-orders-eapi, it passes the Process API answer through to the partner', 'The gateway, it should have blocked the answer'],
      2,
      'The mobile API gets the same answer and sends three fields, so the data below is not the problem for it. The partner API maps nothing. It sends whatever the layer below gives it.',
    ),
    ask(
      'Why the Experience layer',
      'Why is the shape of the partner answer the job of the Experience API?',
      ['Experience APIs are the only ones with DataWeave', 'Each Experience API serves one consumer and gives it the data in the form that consumer is allowed and needs. It never passes System data through', 'The Process API cannot change its answer', 'Partners can only call Experience APIs'],
      1,
      'An Experience API adapts the output of the Process API for one consumer. It is the last application that knows who is calling, so it decides what leaves.',
    ),
    { title: 'Read the agreed fields', how: 'Exchange, Partner Orders Experience API. The example answer has orderId, status, customer with id and name, and stock. That is the contract.', done: (s) => Boolean(s.seen['asset:partner-orders-experience-api']) },
    ask(
      'Why the deny list failed',
      'Last month someone set response.exclude=customer.phone. Why did it not stop the new fields?',
      ['A deny list names what to remove, so every field that a lower layer adds later goes out until someone notices it', 'response.exclude only works on POST', 'A deny list is slower than an allow list', 'The phone is still sent'],
      0,
      'An allow list names what may go out, so a new field below changes nothing at the edge. In DataWeave that is a mapping that names each field, and not payload minus some keys.',
    ),
    {
      title: 'Map only the agreed fields',
      how: `Runtime Manager, ${partner.app}, Settings, Properties. Set response.fields to ${ALLOW}. Remove response.exclude, it is no longer needed. Apply Changes.`,
      done: partnerShaped,
    },
    {
      title: 'Add a second guard in the Process API',
      how: `Runtime Manager, ${proc.app}, Properties. Set customer.fields to id,name, the only customer fields a consumer of the Process API uses. Apply Changes.`,
      done: processGuarded,
    },
    ask(
      'And the System API',
      'Should customers-sapi stop returning creditLimit?',
      ['Yes, a System API must return only what partners may see', 'Not because of this leak. It serves its system to trusted callers inside, behind a contract and a private endpoint. Each layer above takes only what its consumers need', 'Yes, and the Process API should read SQL Server instead'],
      1,
      'A credit check process may need creditLimit. The System API stays general, and the layers above choose. That is why both guards sit above it.',
    ),
    {
      title: 'Prove it',
      how: 'Call GET /partner-orders/O-1001 as Partner Portal and GET /my-orders/O-1001 as Mobile App again. The partner body has only the agreed fields, and the mobile API still answers 200.',
      done: (s) => partnerShaped(s) && processGuarded(s) && same(pathsOf(partnerNow(s)), AGREED) && after(s, partner, 200) && after(s, mobile, 200),
    },
  ],
  why: 'Each Experience API maps the fields its consumer may see, by name. An allow list stays right when a lower layer adds a field, a deny list does not. A second guard in the Process API keeps fields no consumer needs from travelling at all. In the lab the mapping is set by a property. In a real application it is the DataWeave of the flow, and changing it is a new release. The policies of this lab decide who may call, not which fields leave.',
  docs: 'https://trailhead.salesforce.com/content/learn/modules/application-networks-and-api-led-connectivity-in-mulesoft/explore-api-led-connectivity',
  solve(start) {
    let s = mark(start, 'inbox')
    s = call(s, partner.app, PARTNER_PORTAL, '/partner-orders/O-1001').state
    s = call(s, mobile.app, MOBILE_APP, '/my-orders/O-1001').state
    s = mark(mark(s, `logs:${proc.app}`), 'asset:partner-orders-experience-api')
    const { 'response.exclude': _gone, ...partnerProps } = app(s, partner.app).props
    s = change(s, partner.app, { props: { ...partnerProps, 'response.fields': ALLOW } })
    s = change(s, proc.app, { props: { ...app(s, proc.app).props, 'customer.fields': 'id,name' } })
    s = call(s, partner.app, PARTNER_PORTAL, '/partner-orders/O-1001').state
    return call(s, mobile.app, MOBILE_APP, '/my-orders/O-1001').state
  },
  answers: { 4: 2, 5: 1, 7: 0, 10: 1 },
}
export const LABS = [lab]
