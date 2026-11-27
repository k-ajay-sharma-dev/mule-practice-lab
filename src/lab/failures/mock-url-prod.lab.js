// The guided lab mock-url-prod. See platform-labs.js for the shape of a lab.
import { advance, apiById, appNamed, at, createClient, endpointOf, mark, MINUTE, newApi, newApp, newPlatform, requestAccess, setContract } from '../platform.js'
import { ask, asset, call, creds, policy } from '../platform-kit.js'
import { CREATED, EXAMPLE_ID } from './mock-url-prod.pkg.js'

const NAME = 'partner-orders-api'
const API_ID = '19600411'
const PROJECT = 'Partner Orders API'
const MOCK = 'https://mocks.lab.example/partner-orders-api'
const ENV = 'Production'
const STORE = { name: 'Store App', clientId: 'sto-3a11', clientSecret: 'sto-secret-62' }
const DOCS = 'https://docs.mulesoft.com/design-center/design-mocking-service'

const RAML = `#%RAML 1.0
title: Partner Orders API
version: v1
mediaType: application/json
description: Partners of Brightmart create and read their orders.
types:
  Order:
    properties:
      partnerRef: string
      items: number
/orders:
  post:
    description: Create an order
    body:
      type: Order
    responses:
      201:
        body:
          example: |
            { "orderId": "${EXAMPLE_ID}", "status": "RECEIVED" }
  /{orderId}:
    get:
      description: Get one order
      responses:
        200:
          body:
            example: |
              { "orderId": "${EXAMPLE_ID}", "status": "RECEIVED" }
`

const api = (s) => apiById(s, API_ID)
const real = (s) => appNamed(s, NAME, ENV)
const partners = (s) => (api(s)?.contracts ?? []).filter((c) => c.client !== STORE.name)
const approvedPartner = (s) => partners(s).map((c) => c.status === 'approved' && s.clients.find((x) => x.name === c.client)).find(Boolean)
// A call from the partner application that the real implementation answered with an order of its own
const realOrder = (s) => {
  const c = approvedPartner(s)
  if (!c) return false
  const logged = (real(s)?.logs ?? []).some((l) => l.text.includes(CREATED) && l.text.includes(`for client ${c.clientId}`))
  const seen = s.events.some((e) => e.k === 'in' && e.app === NAME && e.env === ENV && e.m === 'POST' && e.s === 201 && e.c === c.name)
  return logged && seen
}

const mail = (t, subject, body, source) => ({ t, to: 'integration@brightmart.example', subject, body, source })

const lab = {
  id: 'p-fail-mock-url-prod',
  group: 'More production failures',
  title: 'A partner went live on the mocking service',
  minutes: 15,
  scenario: `It is Friday 09:00. Three weeks ago, while ${PROJECT} was still in design, a partner of Brightmart, Bayside Grocers, got a URL to start building early. They went live on Tuesday. Their system says every order was created with 201. Sales says not one Bayside order has arrived since Tuesday.`,
  start() {
    const c = creds({ creds: newPlatform().creds }, ENV)
    let s = newPlatform({
      clock: at(4, 8),
      env: ENV,
      nextId: 60,
      clients: [{ ...STORE }],
      projects: [{ id: 'p1', name: PROJECT, raml: RAML, updated: at(0, 11), published: '1.0.0' }],
      assets: [{ ...asset('partner-orders-api', PROJECT, RAML), t: at(0, 12) }],
      apps: [
        newApp(NAME, {
          pkg: NAME,
          env: ENV,
          props: { 'db.host': 'orders-db.brightmart.lab', 'api.id': API_ID, ...c.props },
          secrets: c.secrets,
          autodiscovery: { apiId: '${api.id}', flowRef: `${NAME}-main` },
        }),
      ],
      traffic: [{ app: NAME, env: ENV, client: STORE.name, method: 'POST', path: '/orders', body: '{"partnerRef":"S-1","items":2}', perMinute: 3 }],
    })
    const consumer = `${endpointOf(s.apps[0])}/api`
    s.apis = [
      newApi(API_ID, {
        name: PROJECT, assetId: 'partner-orders-api', env: ENV, label: 'partner-orders-prd', consumer, upstream: '', seen: true,
        policies: [policy('rate-limit-sla')],
        tiers: [{ name: 'Internal', requests: 200, periodMs: 60000, autoApprove: true }, { name: 'Partner', requests: 60, periodMs: 60000, autoApprove: false }],
        contracts: [{ client: STORE.name, tier: 'Internal', status: 'approved', t: 0 }],
        t: at(0, 13),
      }),
    ]
    s.mail = [
      mail(at(4, 7, 55), 'No Bayside Grocers orders since Tuesday', 'Bayside Grocers say they send us about 40 orders a day since Tuesday. Not one is in the order database. Their system shows each order as created. Can you look?', 'Sales operations'),
      mail(at(4, 8, 20), 'RE: Our orders are created fine', `Hello Brightmart team. Our side is fine: every POST /orders answers 201 Created. Our settings are base URL ${MOCK}, no client ID, no secret, as we got them during your design phase. Each answer has orderId ${EXAMPLE_ID}, which we store as your reference. Regards, Bayside Grocers integration team.`, 'Bayside Grocers'),
    ]
    return advance(s, 60 * MINUTE)
  },
  steps: [
    { title: 'Read the mails', how: 'Open the Inbox from the menu. Note the base URL Bayside Grocers uses, and the orderId they get back each time.', done: (s) => Boolean(s.seen.inbox) },
    {
      title: 'Look for the partner in the real API',
      how: `API Manager in ${ENV}, open ${PROJECT}. Read the Consumer endpoint, the Key Metrics and the Contracts. Only Store App calls it, and no contract belongs to Bayside Grocers.`,
      done: (s) => Boolean(s.seen[`api:${API_ID}`]),
    },
    {
      title: 'Try the URL the partner uses',
      how: `Design Center, open ${PROJECT}. In the Documentation panel turn on the mocking service and compare its URL with the one in the mail. Choose POST /orders, Try it, Send a few times. The answer is always ${EXAMPLE_ID}.`,
      done: (s) => Boolean(s.seen.mock),
    },
    ask(
      'Find where the orders went',
      'Why does the partner get 201 while the order database has nothing?',
      ['The implementation fails after it answers', `Their base URL is the mocking service of the design project, which answers from the example in the specification and never reaches ${NAME}`, 'The rate limiting policy drops their calls', 'The orders are waiting in a queue'],
      1,
      `The mocking service simulates the specification. It returns the status code and the example of the first 2xx response, so every POST /orders gets 201 and ${EXAMPLE_ID}. No implementation runs behind it, so nothing reaches the order database. The real instance has a different endpoint and needs a client ID and secret.`,
    ),
    ask(
      'Know what the mocking service is for',
      'What is the mocking service meant for?',
      ['A cheap runtime for low traffic APIs', 'Trying the design of a specification before any implementation exists, so consumers can give feedback early', 'A failover endpoint for when the application is down', 'A cache in front of the implementation'],
      1,
      'The mocking service lets designers and early consumers try the calls of a specification and give feedback. It knows only the specification. A consumer that goes live needs the API instance, through a contract.',
    ),
    ask(
      'Close the public mock link',
      'Bayside got a public mock URL. What do the API Designer docs say about it?',
      ['It expires by itself after 24 hours', 'It can never be made private again', 'It stays valid until you turn Make Public off or until an optional expiration date you set. Turning it off invalidates the URL, and turning it on again gives a different URL', 'It forwards to the implementation once an API instance exists'],
      2,
      'In API Designer, the Mocking Service Configuration of the root file has a Make Public slider and an optional expiration date for the public link. Disabling it invalidates the URL. In this lab the mocking service switch of Design Center is not saved, so the lab cannot check it; in your organization turn Make Public off once the real endpoint is in use.',
    ),
    {
      title: 'Request access for the partner',
      how: `Exchange, ${PROJECT}, Request access. Choose the ${ENV} instance, create a new application for the partner, such as Bayside Grocers, and choose the Partner tier. That tier has manual approval, so the request waits. In real life the partner requests it with their own Exchange account and you approve it.`,
      done: (s) => partners(s).some((c) => c.tier === 'Partner'),
    },
    {
      title: 'Approve the contract',
      how: `API Manager in ${ENV}, ${PROJECT}, Contracts, Approve. Then send the partner the consumer endpoint of the instance and point them to their client ID and secret in Exchange, My applications.`,
      done: (s) => Boolean(approvedPartner(s)),
    },
    {
      title: 'Prove a partner order reaches the implementation',
      how: `The lab cannot change the partner system, so you send their first call. API client, application ${NAME}, Send as the partner application, POST /orders with a body such as {"partnerRef":"B-77","items":3}. You get 201 with an order ID other than ${EXAMPLE_ID}, and the logs of ${NAME} say the order was ${CREATED}.`,
      done: realOrder,
    },
  ],
  why: `A mocking service URL answers like the API but runs nothing behind it, so a consumer that goes live on it fails quietly with a perfect 201. Give consumers the instance endpoint through a contract, so you see them in Contracts and in the metrics, and close the public mock link once the real API is in use. Here the mock URL and its switch are simplified; in API Designer the public link comes from Make Public in the Mocking Service Configuration. The orders Bayside sent since Tuesday still need to be sent again by the partner.`,
  docs: DOCS,
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), `api:${API_ID}`), 'mock')
    s = requestAccess(createClient(s, 'Bayside Grocers'), API_ID, 'Bayside Grocers', 'Partner')
    s = setContract(s, API_ID, 'Bayside Grocers', { status: 'approved' })
    const partner = s.clients.find((c) => c.name === 'Bayside Grocers')
    return call(s, NAME, partner, '/orders', 'POST', '{"partnerRef":"B-77","items":3}').state
  },
  answers: { 3: 1, 4: 1, 5: 2 },
}

export const LABS = [lab]
