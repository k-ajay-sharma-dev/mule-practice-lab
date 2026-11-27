// The end to end lab of SQL Server. See platform-labs.js for the shape of a lab.
// The whole life of the Customers System API: the request, the RAML in Design Center, Exchange, Studio, a login with
// least privilege, API Manager, the deployment, the Mule XML fixed for real in the Flow editor, one sign-up followed
// from the web shop to the table, a duplicate and an outage, an alert, and Production.
import {
  addApi, addMonAlert, apiStatus, applyPolicy, at, createClient, createProject, deployApp, deployXml, finishDeploys, importSpec, jarsOf, mark, mockCall, newPlatform, packageJar,
  promoteApi, publish, ramlErrors, requestAccess, saveProject, setStudio,
} from '../platform.js'
import { app, ask, call, called, creds, OPS } from '../platform-kit.js'
import { granted, loginsOf, newSqlServer, runSql, serverOf, tablesOf, usersOf } from '../platform-db.js'
import { outcomeOf, parseMule } from '../platform-xml.js'
import { APP, ASSET, DATABASE, DB, DB_PRD, FIXED_XML, HANDLER, HOST, HOST_PRD, PKG, POST_FLOW, PROTO_XML, SELECT_BOUND, selectOf, TABLE } from './e2e-sqlserver.pkg.js'

const LOGIN = 'mule_customers'
const PASSWORD = 'Cust-Sbx-2026' // made-up lab values
const PRD_PASSWORD = 'Cust-Prd-7731'
const TEAM = 'crm-integration@brightmart.example'
const SHOP = 'Brightmart Web Shop'
const SIGNUP = '{"email":"Maya.Lindqvist@example.com","firstName":"Maya","lastName":"Lindqvist","country":"se"}'
const SIGNUP2 = '{"email":"tomas.berg@example.com","firstName":"Tomas","lastName":"Berg","country":"NO"}'
const SIGNUP_PRD = '{"email":"ana.ruiz@example.com","firstName":"Ana","lastName":"Ruiz","country":"ES"}'

const RAML = `#%RAML 1.0
title: Customers System API
version: v1
mediaType: application/json
types:
  NewCustomer:
    properties:
      email: string
      firstName: string
      lastName: string
      country:
        type: string
        minLength: 2
        maxLength: 2
  Customer:
    properties:
      customerId: string
      email: string
      firstName: string
      lastName: string
      country: string
/customers:
  post:
    description: Create a customer account for a web shop sign-up
    body:
      type: NewCustomer
      example: |
        { "email": "maya.lindqvist@example.com", "firstName": "Maya", "lastName": "Lindqvist", "country": "SE" }
    responses:
      201:
        body:
          example: |
            { "customerId": "BC-10041" }
      409:
        body:
          example: |
            { "message": "A customer with this email exists", "customerId": "BC-10041" }
      503:
        body:
          example: |
            { "message": "The customer store is not available. Send the request again later." }
  /{customerId}:
    get:
      description: Read one customer
      responses:
        200:
          body:
            type: Customer
            example: |
              { "customerId": "BC-10041", "email": "maya.lindqvist@example.com", "firstName": "Maya", "lastName": "Lindqvist", "country": "SE" }
        404:
          body:
            example: |
              { "message": "Customer not found" }
`
const STUDIO_CODE = `<!-- Global element. Every value comes from the properties of the environment. -->
<db:config name="Customers_DB">
  <db:mssql-connection host="\${db.host}" port="\${db.port}" databaseName="\${db.database}"
                       user="\${db.user}" password="\${db.password}">
    <db:pooling-profile maxPoolSize="\${db.pool.max}" maxWait="10"/>
  </db:mssql-connection>
</db:config>

<!-- post:\\customers: Map to row, then the operation with named parameters -->
<db:insert config-ref="Customers_DB" queryTimeout="5">
  <db:sql>INSERT INTO dbo.shop_customers (customer_id, email, first_name, last_name, country)
          VALUES (:customerId, :email, :firstName, :lastName, :country)</db:sql>
  <db:input-parameters>#[payload]</db:input-parameters>
</db:insert>

%dw 2.0
output application/java
---
{
  customerId: vars.customerId,          // BC-nnnnn, made by the flow
  email: lower(trim(payload.email)),    // email     -> email
  firstName: trim(payload.firstName),   // firstName -> first_name
  lastName: trim(payload.lastName),     // lastName  -> last_name
  country: upper(payload.country)       // country   -> country (ISO code)
}`

const srv = (s, name = DB) => serverOf(s, name)
const loginOf = (s, name = DB) => (srv(s, name) ? loginsOf(srv(s, name)) : []).find((l) => l.name.toLowerCase() === LOGIN && l.type === 'SQL login')
const userOf = (s, name = DB) => (srv(s, name) ? usersOf(srv(s, name)) : []).find((u) => String(u.login).toLowerCase() === LOGIN)
const rowsOf = (s, name = DB) => (srv(s, name) ? tablesOf(srv(s, name))[TABLE]?.rows : null) ?? []
const a = (s) => app(s, APP)
const prd = (s) => s.apps.find((x) => x.name === APP && x.env === 'Production')
const running = (s) => a(s)?.status === 'Running'
const store = (s) => a(s)?.store ?? {}
const project = (s) => s.studio.find((p) => p.assetId === ASSET)
const apiOf = (s, env = 'Sandbox') => s.apis.find((x) => x.assetId === ASSET && x.env === env)
const num = (v) => (String(v ?? '').trim() === '' ? NaN : Number(v))
const modelOf = (x) => (x?.status === 'Running' && x.xml ? parseMule(x.xml) : null)
const model = (s) => modelOf(a(s))

// SELECT and INSERT on the one table, no role, nothing more
const leastOk = (s) => {
  const u = userOf(s)
  if (!u || !loginOf(s) || !['SELECT', 'INSERT'].every((v) => granted(u, TABLE, v))) return false
  const extra = Object.entries(u.grants ?? {}).some(([tk, ps]) => tk !== TABLE || ps.some((p) => !['SELECT', 'INSERT'].includes(p)))
  return !extra && u.roles.length === 0 && !loginOf(s).sysadmin
}
const deployedOk = (s) => {
  const x = a(s)
  const p = x?.props ?? {}
  const pool = num(p['db.pool.max'])
  return Boolean(x && project(s)?.jar && loginOf(s)) && x.jar === project(s).jar && Boolean(x.autodiscovery) && p['db.host'] === HOST && String(p['db.port']) === '1433' && p['db.database'] === DATABASE && p['db.user'] === LOGIN && pool >= 2 && pool <= 10 && x.secrets?.['db.password'] === loginOf(s).password && !('db.password' in p) && Boolean(x.secrets?.['anypoint.platform.client_secret'])
}
const boundOk = (s, x = a(s)) => Boolean(modelOf(x)?.ok) && selectOf(modelOf(x)).bound
const handlerOk = (s, x = a(s)) => {
  const m = modelOf(x)
  if (!m?.ok) return false
  const dup = outcomeOf(m, POST_FLOW, 'DB:QUERY_EXECUTION', { description: 'duplicate key' })
  const down = outcomeOf(m, POST_FLOW, 'DB:CONNECTIVITY', { description: 'Login failed' })
  return dup.kind === 'continue' && dup.status === 409 && down.kind === 'propagate' && down.status === 503
}
const firstCreated = (s) => (store(s).created ?? []).find((c) => c.env === 'Sandbox')

const lab = {
  id: 'p-e2e-sqlserver',
  group: 'End to end by system',
  title: 'End to end: customer accounts, web shop to SQL Server',
  minutes: 55,
  scenario: `The Brightmart web shop gets a new sign-up page. Each new account must land in the customer database ${DATABASE} on SQL Server, and the shop must read it back by id. You own the Customers System API, ${APP}, from the request to Production. A record takes this path: the shop sends POST /customers with its client ID, API Manager checks it, the flow maps the fields and inserts one row into ${TABLE}, and the shop reads it with GET /customers/{customerId}. A teammate wrote the first cut of the flows on your spec; you find two problems in its mule-config.xml once it runs. The Inbox has the request.`,
  start() {
    let s = newPlatform({
      clock: at(1, 9),
      // the Studio project made from the spec carries the flows of the teammate (lab: the Flow editor stands for Studio)
      studioPkgs: { [ASSET]: PKG },
      studioXml: { [ASSET]: PROTO_XML },
      databases: {
        created: at(1, 8),
        servers: {
          [DB]: newSqlServer(DB, { database: DATABASE, dbid: 11, tables: {}, users: [{ name: 'dbo', login: 'BRIGHTMART\\dba', schema: 'dbo', roles: ['db_owner'] }] }),
          [DB_PRD]: newSqlServer(DB_PRD, { host: HOST_PRD, database: DATABASE, dbid: 11, tables: {}, users: [{ name: 'dbo', login: 'BRIGHTMART\\dba', schema: 'dbo', roles: ['db_owner'] }] }),
        },
      },
      mail: [
        {
          t: at(1, 8, 30),
          to: OPS,
          subject: 'Customers System API for the new sign-up page',
          body: `Hello, the new sign-up page of the web shop goes live next week. We need a Customers System API in front of SQL Server.\n\nPOST /customers with email, firstName, lastName and country (two letters). It answers the new customerId. GET /customers/{customerId} reads one account.\nServer ${HOST}, port 1433, database ${DATABASE}, table ${TABLE}. Email is unique: a second sign-up with the same email must not make a second account. The shop then needs the existing customerId (409).\nLoad: about 3,000 sign-ups a day, 40 a minute at peak, and 300 reads a minute. Each statement takes a few milliseconds.\nThe shop times out after 3 seconds and sends the same sign-up again. If the database is down, answer 503 so the shop keeps the sign-up and tries again.\nThe caller is the client application ${SHOP}. Give the API its own login. It reads and inserts, nothing else.\nAlerts on errors to ${TEAM}.\nProduction: ${HOST_PRD}, login ${LOGIN}. The DBA ran the same grant script there (change CHG-4471). Practice password of Production: ${PRD_PASSWORD}.\n\nThanks, Brightmart web shop team`,
          source: 'Brightmart web shop team',
        },
      ],
    })
    // the DBA team made the table and its unique index on both servers (change CHG-4470)
    const ddl = `CREATE TABLE ${TABLE} (customer_id varchar(12) NOT NULL PRIMARY KEY, email varchar(120) NOT NULL, first_name nvarchar(60) NOT NULL, last_name nvarchar(60) NOT NULL, country char(2) NOT NULL, created_at datetime2 NOT NULL DEFAULT SYSDATETIME());\nCREATE UNIQUE INDEX UX_shop_customers_email ON ${TABLE} (email);`
    s = runSql(s, DB, ddl).state
    s = runSql(s, DB_PRD, ddl).state
    s = runSql(s, DB_PRD, `CREATE LOGIN ${LOGIN} WITH PASSWORD = '${PRD_PASSWORD}', DEFAULT_DATABASE = ${DATABASE};\nCREATE USER ${LOGIN} FOR LOGIN ${LOGIN} WITH DEFAULT_SCHEMA = dbo;\nGRANT SELECT, INSERT ON ${TABLE} TO ${LOGIN};`).state
    return s
  },
  steps: [
    { title: 'Read the request', how: 'Open the Inbox from the menu under Lab tools. Note the two operations, the fields, the unique email, the load, the retry of the shop, the caller, the login and the alert address.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Create the API specification', how: 'Design Center from the menu. Create new, New API Specification, name Customers System API.', done: (s) => s.projects.some((p) => /customers system api/i.test(p.name)) },
    {
      title: 'Write the RAML',
      how: 'In the editor write POST /customers and GET /customers/{customerId} with their types and examples, or paste this one. The 409 and 503 answers are part of the contract, so the shop team can build for them.',
      code: RAML,
      done: (s) => s.projects.some((p) => p.raml && ramlErrors(p.raml).length === 0 && mockCall(p.raml, 'POST', '/customers').status === 201 && mockCall(p.raml, 'GET', '/customers/BC-10041').status === 200),
    },
    {
      title: 'Try the mock, then publish to Exchange',
      how: `In the Documentation panel turn on the mocking service, choose POST /customers, Try it, Send. Then Publish: asset ID ${ASSET}, asset version 1.0.0, API version v1, LifeCycle State Stable.`,
      done: (s) => Boolean(s.seen.mock) && s.assets.some((x) => x.assetId === ASSET),
    },
    {
      title: 'Import the specification into Studio',
      how: 'Anypoint Studio from the menu, Import a published API, choose Customers System API. APIkit makes a flow per method. The team fills them: the Database global element with properties, the Insert with named parameters and the mapping of the request fields to the columns.',
      code: STUDIO_CODE,
      done: (s) => project(s)?.pkg === PKG,
    },
    {
      title: 'Add API Autodiscovery and export',
      how: `In Studio, Global Elements, Create, API Autodiscovery. API ID \${api.id}, Flow Name ${ASSET}-main. Then Export, which builds the deployable jar.`,
      done: (s) => Boolean(project(s)?.jar) && project(s).autodiscovery?.apiId === '${api.id}' && /-main$/.test(project(s).autodiscovery.flowRef ?? ''),
    },
    {
      title: 'Give the API its own login with least privilege',
      how: `Databases from the console menu, server ${DB}, New Query. Run\nCREATE LOGIN ${LOGIN} WITH PASSWORD = '${PASSWORD}', DEFAULT_DATABASE = ${DATABASE};\nCREATE USER ${LOGIN} FOR LOGIN ${LOGIN} WITH DEFAULT_SCHEMA = dbo;\nGRANT SELECT, INSERT ON ${TABLE} TO ${LOGIN};\nNo role such as db_datawriter or db_owner, no UPDATE or DELETE. The tab Logins and users shows the permissions. The old ETL login mule_etl is in db_ddladmin and could drop the table, so do not borrow it.`,
      done: leastOk,
    },
    {
      title: 'Create the API instance with Client ID Enforcement',
      how: 'API Manager, API Administration, Add API, Add new API. Mule Gateway, Connect to existing application (basic endpoint), select Customers System API from Exchange, Save & Deploy. Then Policies, Add policy, Client ID Enforcement. Back in API Administration open Environment information and copy the client ID and secret of Sandbox.',
      done: (s) => Boolean(apiOf(s)?.policies.some((p) => p.type === 'client-id')) && Boolean(s.seen['env:Sandbox']),
    },
    {
      title: 'Deploy the exported jar',
      how: `Runtime Manager, Deploy application. Name ${APP}, Application File the jar you exported. Properties: db.host=${HOST}, db.port=1433, db.database=${DATABASE}, db.user=${LOGIN}, db.pool.max=5, api.id=the API Instance ID, anypoint.platform.client_id. Add db.password and anypoint.platform.client_secret and choose Protect for both. Deploy Application. The API in API Manager turns Active.`,
      done: (s) => running(s) && deployedOk(s) && apiStatus(s, apiOf(s)) === 'Active',
    },
    {
      title: 'Bind the customer id in the Select',
      how: `Lab tools, Flow editor, ${APP}. In get-customer-flow the Select builds its SQL with #["... '$(attributes.uriParams.customerId)'"]. Replace it with a named parameter and db:input-parameters, as below, and press Deploy to Sandbox.`,
      code: SELECT_BOUND,
      done: boundOk,
    },
    {
      title: 'Map the database errors of the POST',
      how: `post-customer-flow has no error handler, so a duplicate email and a database outage both give 500. Add this error-handler at the end of the flow: on-error-continue for the duplicate key with httpStatus 409, and on-error-propagate for DB:CONNECTIVITY with httpStatus 503. Deploy to Sandbox. If the deploy fails, the Problems view and the deploy log name the line.`,
      code: HANDLER,
      done: handlerOk,
    },
    ask(
      'Why a bound parameter',
      'The first cut built the SQL text with the id from the URL. What changes with WHERE customer_id = :customerId and db:input-parameters?',
      [
        'Nothing, both send the same SQL to the server',
        "The driver sends the SQL and the value apart, so a value such as x' OR '1'='1 stays a value and cannot change the query. SQL Server can also reuse one plan for every id",
        'Only the speed: a parameter is faster to type',
        'A parameter works only with stored procedures',
      ],
      1,
      'With text built from the request, an id that has a quote ends the string and the rest runs as SQL: that is SQL injection, and with this login it could read every customer. A named parameter is sent as a typed value through a prepared statement. The same statement text also lets SQL Server reuse its plan instead of compiling a new one for each id.',
    ),
    {
      title: 'Let the web shop in',
      how: `Exchange, Customers System API, Request access. API instance: the Sandbox one. Create a new application named ${SHOP}. With no SLA tier the contract is approved at once. API Manager, the instance, Contracts shows it.`,
      done: (s) => Boolean(apiOf(s)?.contracts.some((c) => c.client === SHOP && c.status === 'approved')),
    },
    {
      title: 'Send one sign-up and read it back',
      how: `Lab tools, API client. Application ${APP}, client application ${SHOP}. POST /customers with the body ${SIGNUP}. It answers 201 with a customerId. Then GET /customers/ with that id: 200 with the mapped fields. Without the client application the gateway answers 401.`,
      done: (s) => Boolean(firstCreated(s)) && called(s, APP, 201, 'POST', /^\/customers$/) && called(s, APP, 200, 'GET', /^\/customers\/BC-/) && boundOk(s),
    },
    {
      title: 'Follow the record to the table',
      how: `Runtime Manager, ${APP}, Logs. Each line of the request starts with event: and its correlation ID, the same ID the response carries in X-Correlation-ID. Find the Customer ... inserted line. Then Databases, ${DB}, New Query: SELECT * FROM ${TABLE} WHERE email = 'maya.lindqvist@example.com'; The email is lower case and the country SE, as the mapping says, and created_at came from the default.`,
      done: (s) => {
        const c = firstCreated(s)
        return Boolean(c) && Boolean(s.seen[`logs:${APP}`]) && (s.seen[`db-select:${DB}:${TABLE}`] ?? -1) >= c.t && rowsOf(s).some((r) => r.customer_id === c.id && r.email === r.email.toLowerCase() && r.country === r.country.toUpperCase())
      },
    },
    {
      title: 'Send the same sign-up again',
      how: 'POST the same body again, as the shop does after a timeout. SQL Server refuses the second row with error 2601 on UX_shop_customers_email. Your handler answers 409 with the customerId stored the first time. The table still has one row for this email.',
      done: (s) => (store(s).dups ?? []).some((d) => d.status === 409 && d.env === 'Sandbox') && (store(s).dups ?? []).every((d) => rowsOf(s).filter((r) => r.email === d.email).length <= 1),
    },
    ask(
      'Safe to send twice',
      'The shop times out after 3 seconds and sends the sign-up again, maybe while the first insert still runs on another connection. What keeps one account per email?',
      [
        'A SELECT by email before the INSERT in the flow',
        'The unique index on email. The database checks and writes in one step, so the second insert fails with 2601 even when both run at the same moment, and the API answers 409 with the existing id, which the shop treats as done',
        'A longer timeout in the shop',
        'An until-successful scope around the Insert',
      ],
      1,
      'Check then insert is a race: two requests both find nothing and both insert. A unique constraint makes the write itself refuse the second one. Answering 409 with the stored id makes a repeated POST safe for the caller. An Idempotency-Key header kept in an object store is another way, for resources without a natural unique key.',
    ),
    {
      title: 'Survive an outage and send the sign-up again',
      how: `Play the night of the DBA maintenance. Databases, ${DB}, New Query: ALTER LOGIN ${LOGIN} DISABLE; Execute. API client: POST /customers with ${SIGNUP2}. It answers 503 with a message, and the log has DB:CONNECTIVITY, error 18470. The shop keeps the sign-up and tries again. Run ALTER LOGIN ${LOGIN} ENABLE; and POST the same body again: 201. Nothing was lost.`,
      done: (s) => {
        const down = (store(s).down ?? []).filter((d) => d.status === 503 && d.env === 'Sandbox')
        return !loginOf(s)?.disabled && down.some((d) => (store(s).created ?? []).some((c) => c.email === d.email && c.t > d.t))
      },
    },
    {
      title: 'Alert the CRM integration team',
      how: `Monitoring, Alerts, Create Alert. Resource type Application, ${APP}, metric Message Error Count, Above 0 for 1 minute, recipient ${TEAM}. A 409 is an answer of the contract; a 503 or 500 counts as an error.`,
      done: (s) => s.monAlerts.some((x) => x.resource === 'Application' && x.name_ === APP && x.metric === 'Message Error Count' && String(x.recipients ?? '').toLowerCase().includes(TEAM)),
    },
    ask(
      'Size the pool',
      'At peak 40 inserts and 300 reads a minute reach the API, each statement holds a connection for about 5 ms, and the app runs on 2 replicas. What maxPoolSize fits?',
      [
        '340, one connection per request of a minute',
        'About 5 per replica. Busy connections are the rate times the time held: 6 statements a second times 0.005 s is 0.03. A few spare connections cover bursts, and 2 replicas times 5 stays far below what the server allows',
        '1, because the load is low',
        '100, so the pool never runs out',
      ],
      1,
      "Little's law gives the connections in use: arrival rate times the time each is held. The pool is per replica, so the server sees pool size times replicas sessions. A small pool with maxWait set gives DB:CONNECTIVITY after the wait instead of hanging. The first cut had 20, which only holds idle sessions on the server.",
    ),
    {
      title: 'Promote the API and deploy to Production',
      how: `Switch to Production with the environment button. API Manager, Add API, Promote API from environment, Source Environment Sandbox, with policies. Runtime Manager in Production, Deploy application: name ${APP}, Application File the exported jar. Properties: db.host=${HOST_PRD}, db.port=1433, db.database=${DATABASE}, db.user=${LOGIN}, db.pool.max=5, api.id=the Production API Instance ID, anypoint.platform.client_id of Production. Protect db.password (the Production password from the mail) and anypoint.platform.client_secret of Production. The jar still holds the first cut of mule-config.xml, so open the Flow editor in Production and deploy the same two fixes. In a real project they are committed in Studio and the jar is exported again.`,
      done: (s) => {
        const x = prd(s)
        const api = apiOf(s, 'Production')
        return Boolean(x && api) && x.status === 'Running' && api.policies.some((p) => p.type === 'client-id') && x.props['db.host'] === HOST_PRD && x.props['db.user'] === LOGIN && x.secrets?.['db.password'] === PRD_PASSWORD && !('db.password' in x.props) && apiStatus(s, api) === 'Active' && boundOk(s, x) && handlerOk(s, x)
      },
    },
    {
      title: 'See one sign-up arrive in Production',
      how: `Exchange, Customers System API, Request access for the Production instance with ${SHOP}: a contract does not move with promotion. API client in Production: POST /customers as ${SHOP} with ${SIGNUP_PRD}, 201. Then Databases, ${DB_PRD}, New Query: SELECT * FROM ${TABLE}; shows the row.`,
      done: (s) => {
        const c = (prd(s)?.store?.created ?? []).find((x) => x.env === 'Production')
        return Boolean(c) && (s.lastCalls ?? []).some((x) => x.env === 'Production' && x.app === APP && x.status === 201 && x.method === 'POST') && rowsOf(s, DB_PRD).some((r) => r.customer_id === c.id) && (s.seen[`db-select:${DB_PRD}:${TABLE}`] ?? -1) >= c.t
      },
    },
  ],
  why: `I took the request from the web shop team: two operations, a unique email, the load, the retry of the shop and who gets the alerts. I wrote the RAML first with the 201, 409 and 503 answers, tried it in the mocking service so the shop could start, and published it to Exchange. In Studio I imported the spec, so APIkit gave me one flow per method, and I put every connection value in properties: host, database, user, a protected password and a pool sized from the load with Little's law. On SQL Server the API got its own login with SELECT and INSERT on one table only, never db_owner. In API Manager I made the instance with Client ID Enforcement and linked the app with API Autodiscovery and the environment credentials. I bound the id as a parameter, and I mapped the duplicate key error 2601 to 409 and DB:CONNECTIVITY to 503 so the caller knows what to do. Then I followed one sign-up by its correlation ID in the log to the row in the table, sent it again to see the 409, and took the login away to see the 503 and the retry work. An alert on Message Error Count goes to the CRM team. For Production I promoted the instance with its policy and deployed the same jar with the Production host, password, API ID and credentials, and the web shop asked for its own Production contract. The teammate's first cut built its SQL from the URL and had no error handler; in the lab the Flow editor stands for fixing that in the Studio project.`,
  docs: 'https://docs.mulesoft.com/db-connector/latest/database-connector-connect',
  solve(start) {
    let s = mark(start, 'inbox')
    s = createProject(s, 'Customers System API')
    const pid = s.projects.at(-1).id
    s = mark(saveProject(s, pid, RAML), 'mock')
    s = publish(s, pid, { assetId: ASSET, name: 'Customers System API', version: '1.0.0', apiVersion: 'v1', lifecycle: 'stable' }).state
    s = importSpec(s, ASSET)
    s = packageJar(setStudio(s, ASSET, { autodiscovery: { apiId: '${api.id}', flowRef: `${ASSET}-main` } }), ASSET)
    s = runSql(s, DB, `CREATE LOGIN ${LOGIN} WITH PASSWORD = '${PASSWORD}', DEFAULT_DATABASE = ${DATABASE};\nCREATE USER ${LOGIN} FOR LOGIN ${LOGIN} WITH DEFAULT_SCHEMA = dbo;\nGRANT SELECT, INSERT ON ${TABLE} TO ${LOGIN};`).state
    s = addApi(s, { assetId: ASSET, label: 'customers-sbx', upstream: '', consumer: '' })
    const id = s.lastApi
    s = mark(applyPolicy(s, id, 'client-id'), 'env:Sandbox')
    const p = project(s)
    const c = creds(s, 'Sandbox')
    const jar = jarsOf(s).find((j) => j.project === p.name)
    s = finishDeploys(deployApp(s, { name: APP, ...jar, replicas: 1, vCores: 0.1, props: { 'db.host': HOST, 'db.port': '1433', 'db.database': DATABASE, 'db.user': LOGIN, 'db.pool.max': '5', 'api.id': id, ...c.props }, secrets: { 'db.password': PASSWORD, ...c.secrets } }).state)
    s = deployXml(s, APP, FIXED_XML).state
    s = requestAccess(createClient(s, SHOP), id, SHOP)
    const shop = s.clients.find((x) => x.name === SHOP)
    s = call(s, APP, shop, '/customers', 'POST', SIGNUP).state
    const made = firstCreated(s).id
    s = call(s, APP, shop, `/customers/${made}`, 'GET').state
    s = mark(s, `logs:${APP}`)
    s = runSql(s, DB, `SELECT * FROM ${TABLE} WHERE email = 'maya.lindqvist@example.com';`).state
    s = call(s, APP, shop, '/customers', 'POST', SIGNUP).state
    s = runSql(s, DB, `ALTER LOGIN ${LOGIN} DISABLE;`).state
    s = call(s, APP, shop, '/customers', 'POST', SIGNUP2).state
    s = runSql(s, DB, `ALTER LOGIN ${LOGIN} ENABLE;`).state
    s = call(s, APP, shop, '/customers', 'POST', SIGNUP2).state
    s = addMonAlert(s, { title: 'Customers API errors', resource: 'Application', name_: APP, metric: 'Message Error Count', severity: 'High', operator: 'Above', threshold: 0, minutes: 1, recipients: TEAM })
    // Production
    s = { ...s, env: 'Production' }
    s = promoteApi(s, id, { policies: true, tiers: true, alerts: false })
    const pid2 = s.lastApi
    const pc = creds(s, 'Production')
    s = finishDeploys(deployApp(s, { name: APP, ...jar, replicas: 1, vCores: 0.1, props: { 'db.host': HOST_PRD, 'db.port': '1433', 'db.database': DATABASE, 'db.user': LOGIN, 'db.pool.max': '5', 'api.id': pid2, ...pc.props }, secrets: { 'db.password': PRD_PASSWORD, ...pc.secrets } }).state)
    s = deployXml(s, APP, FIXED_XML).state
    s = requestAccess(s, pid2, SHOP)
    s = call(s, APP, shop, '/customers', 'POST', SIGNUP_PRD).state
    return runSql(s, DB_PRD, `SELECT * FROM ${TABLE};`).state
  },
  answers: { 11: 1, 16: 1, 19: 1 },
}

export const LABS = [lab]
