import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

// The Choice route for this procedure status sets this HTTP status.
const routeStatus = (outcome, status) => {
  const place = { within: 'choice', routeWhere: { expression: outcome } }
  return {
    type: 'any',
    rules: [
      { type: 'inside', component: 'set-variable', where: { value: status }, ...place },
      { type: 'inside', component: 'transform', where: { variableName: 'status', script: status }, ...place },
    ],
  }
}

export default {
  id: 'fl-061',
  category: 'flows',
  title: 'Stock Reservation API Backed by an Oracle Stored Procedure (IN/OUT)',
  level: 'INTERMEDIATE',
  tags: ['supply-chain', 'retail', 'inventory', 'reservations', 'oracle', 'stored-procedure', 'api'],
  estMinutes: 30,
  flowChecks: [
    { label: 'Reservations are requested over HTTP (POST /reservations)', rule: { type: 'source', component: 'http-listener', where: { path: 'reservation' } } },
    { label: 'The request is validated before calling Oracle', rule: { type: 'before', first: 'validation', then: 'db-stored-procedure' } },
    {
      label: 'Check-and-reserve runs inside one Oracle stored procedure (single round trip, locking in PL/SQL)',
      rule: { type: 'exists', component: 'db-stored-procedure' },
    },
    { label: 'The OUT status parameter drives the response through a Choice', rule: { type: 'before', first: 'db-stored-procedure', then: 'choice' } },
    { label: 'Separate outcomes for reserved, insufficient stock and unknown SKU', rule: { type: 'routes', component: 'choice', min: 2 } },
    { label: 'A RESERVED status returns 201', rule: routeStatus('RESERVED', '201') },
    { label: 'An INSUFFICIENT status returns 409', rule: routeStatus('INSUFFICIENT', '409') },
    { label: 'An UNKNOWN_SKU status returns 404', rule: routeStatus('UNKNOWN_SKU', '404') },
    { label: 'Bad input (a failed validation) returns 400', rule: handlerStatus('VALIDATION', '400') },
    { label: 'Oracle connectivity problems (DB:CONNECTIVITY) map to 503', rule: handlerStatus('DB:CONNECTIVITY', '503') },
  ],
  simulation: {
    systems: {
      db: {
        tables: {
          STOCK_LEVEL: {
            columns: ['SKU', 'LOCATION_ID', 'AVAILABLE_QTY'],
            key: ['SKU', 'LOCATION_ID'],
            rows: [
              { SKU: 'CONSOLE-X2', LOCATION_ID: 'DC-01', AVAILABLE_QTY: 5 },
              { SKU: 'CTRL-X2-BLK', LOCATION_ID: 'DC-01', AVAILABLE_QTY: 1 },
            ],
          },
          STOCK_RESERVATION: { columns: ['RESERVATION_ID', 'ORDER_ID', 'SKU', 'LOCATION_ID', 'QTY'], key: 'RESERVATION_ID', rows: [] },
        },
        // INV_PKG.RESERVE_STOCK as the DBA team wrote it: lock, check, reserve, and report through the OUT parameters.
        procedures: {
          'INV_PKG.RESERVE_STOCK': (p, db) => {
            const row = db.tables.STOCK_LEVEL.rows.find((r) => r.SKU === p.sku && r.LOCATION_ID === p.locationId)
            if (!row) return { reservationId: null, status: 'UNKNOWN_SKU', availableQty: 0 }
            if (row.AVAILABLE_QTY < Number(p.qty)) return { reservationId: null, status: 'INSUFFICIENT', availableQty: row.AVAILABLE_QTY }
            row.AVAILABLE_QTY -= Number(p.qty)
            const id = `RSV-${String(db.tables.STOCK_RESERVATION.rows.length + 70001)}`
            db.tables.STOCK_RESERVATION.rows.push({ RESERVATION_ID: id, ORDER_ID: p.orderId, SKU: p.sku, LOCATION_ID: p.locationId, QTY: Number(p.qty) })
            return { reservationId: id, status: 'RESERVED', availableQty: row.AVAILABLE_QTY }
          },
        },
        latencyMs: 25,
      },
    },
    tests: [
      {
        name: 'Stock is reserved',
        about: 'Two consoles are free, so the reservation is made and checkout gets 201 with its id.',
        trigger: { http: { method: 'POST', path: '/api/reservations', body: { orderId: 'ORD-55120', sku: 'CONSOLE-X2', locationId: 'DC-01', qty: 2, ttlMinutes: 20 } } },
        expect: {
          status: 201,
          bodyHas: { reservationId: 'RSV-70001' },
          db: { STOCK_LEVEL: { has: [{ SKU: 'CONSOLE-X2', AVAILABLE_QTY: 3 }] }, STOCK_RESERVATION: { count: 1, has: [{ ORDER_ID: 'ORD-55120', QTY: 2 }] } },
          maxMs: 300,
        },
      },
      {
        name: 'Not enough stock',
        about: 'Only one controller is left, so checkout gets 409 and nothing is reserved.',
        trigger: { http: { method: 'POST', path: '/api/reservations', body: { orderId: 'ORD-55121', sku: 'CTRL-X2-BLK', locationId: 'DC-01', qty: 3, ttlMinutes: 20 } } },
        expect: { status: 409, db: { STOCK_LEVEL: { has: [{ SKU: 'CTRL-X2-BLK', AVAILABLE_QTY: 1 }] }, STOCK_RESERVATION: { count: 0 } } },
      },
      {
        name: 'The SKU is unknown',
        about: 'After one good reservation, a request for an SKU the procedure does not know gets 404 and reserves nothing.',
        triggers: [
          { http: { method: 'POST', path: '/api/reservations', body: { orderId: 'ORD-55125', sku: 'CONSOLE-X2', locationId: 'DC-01', qty: 1, ttlMinutes: 20 } } },
          { http: { method: 'POST', path: '/api/reservations', body: { orderId: 'ORD-55122', sku: 'CONSOLE-X9', locationId: 'DC-01', qty: 1, ttlMinutes: 20 } } },
        ],
        expect: { status: 404, db: { STOCK_RESERVATION: { count: 1, lacks: [{ ORDER_ID: 'ORD-55122' }] } } },
      },
      {
        name: 'The quantity is zero',
        about: 'Bad input gets 400 and Oracle is not called.',
        trigger: { http: { method: 'POST', path: '/api/reservations', body: { orderId: 'ORD-55123', sku: 'CONSOLE-X2', locationId: 'DC-01', qty: 0, ttlMinutes: 20 } } },
        expect: { status: 400, db: { STOCK_LEVEL: { has: [{ SKU: 'CONSOLE-X2', AVAILABLE_QTY: 5 }] }, STOCK_RESERVATION: { count: 0 } } },
      },
      {
        name: 'Oracle cannot be reached',
        about: 'The connection fails, so checkout gets 503 and can try again.',
        trigger: { http: { method: 'POST', path: '/api/reservations', body: { orderId: 'ORD-55124', sku: 'CONSOLE-X2', locationId: 'DC-01', qty: 1, ttlMinutes: 20 } } },
        overrides: { systems: { db: { fault: 'CONNECTIVITY' } } },
        expect: { status: 503 },
      },
    ],
  },
  optionalSteps: [
    {
      type: 'on-error-propagate',
      flow: 'post-reservation',
      why: 'A failed procedure call answers 500, which Mule does by default. This handler only adds a log line and a tidier body.',
    },
  ],
  referenceFlow: design(
    flow(
      'post-reservation',
      source('http-listener', { path: '/api/reservations', allowedMethods: 'POST' }),
      [
        step('validation', { check: 'is-not-blank-string', expression: '#[payload.sku]', message: 'sku is required' }),
        step('validation', { check: 'is-true', expression: '#[(payload.qty default 0) > 0]', message: 'qty must be positive' }),
        step('set-variable', { variableName: 'req', value: '#[payload]' }),
        // inputParameters: orderId, sku, locationId, qty, ttlMinutes
        // outputParameters: reservationId (VARCHAR), status (VARCHAR), availableQty (NUMERIC)
        step('db-stored-procedure', {
          sql: '{ call INV_PKG.RESERVE_STOCK(:orderId, :sku, :locationId, :qty, :ttlMinutes, :reservationId, :status, :availableQty) }',
        }),
        router(
          'choice',
          {},
          [
            route({ expression: '#[payload.status == "RESERVED"]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '201' }),
              step('transform', {
                script:
                  '%dw 2.0\noutput application/json\n---\n{\n  reservationId: payload.reservationId,\n  orderId: vars.req.orderId,\n  sku: vars.req.sku,\n  locationId: vars.req.locationId,\n  qty: vars.req.qty,\n  expiresAt: now() + (("PT" ++ ((vars.req.ttlMinutes default 20) as String) ++ "M") as Period)\n}',
              }),
            ]),
            route({ expression: '#[payload.status == "INSUFFICIENT"]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '409' }),
              step('set-payload', { value: '#[output application/json --- { error: "INSUFFICIENT_STOCK", sku: vars.req.sku, available: payload.availableQty }]' }),
            ]),
            route({ expression: '#[payload.status == "UNKNOWN_SKU"]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '404' }),
              step('set-payload', { value: '#[output application/json --- { error: "UNKNOWN_SKU", sku: vars.req.sku }]' }),
            ]),
          ],
          {
            otherwise: [step('raise-error', { type: 'APP:UNEXPECTED_STATUS', description: '#["Procedure returned " ++ (payload.status default "null")]' })],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '503' }),
          step('set-payload', { value: '#[output application/json --- { error: "Inventory service temporarily unavailable" }]' }),
        ]),
        handler('on-error-propagate', { type: 'DB:QUERY_EXECUTION' }, [
          step('logger', { level: 'ERROR', message: '#["RESERVE_STOCK failed: " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '500' }),
          step('set-payload', { value: '#[output application/json --- { error: "Reservation failed" }]' }),
        ]),
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN, VALIDATION:BLANK_STRING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('set-payload', { value: '#[output application/json --- { error: error.description }]' }),
        ]),
      ],
    ),
  ),
  description: `
An omnichannel retailer reserves stock from its **Oracle** inventory database when a customer reaches checkout. The DBA team already owns a PL/SQL package \`INV_PKG\` and insists that **all stock changes go through it**:

\`\`\`
PROCEDURE RESERVE_STOCK(
  p_order_id IN VARCHAR2, p_sku IN VARCHAR2, p_location_id IN VARCHAR2,
  p_qty IN NUMBER, p_ttl_minutes IN NUMBER,
  p_reservation_id OUT VARCHAR2, p_status OUT VARCHAR2,   -- RESERVED | INSUFFICIENT | UNKNOWN_SKU
  p_available_qty OUT NUMBER)
\`\`\`

The procedure locks the stock row (\`SELECT ... FOR UPDATE\`), inserts the reservation and commits.

Expose \`POST /api/reservations\` (\`{ orderId, sku, locationId, qty, ttlMinutes }\`) for the checkout Process API:
- **201** with reservation id, **409** with the quantity actually available, **404** for an unknown SKU, **400** for bad input, **503** when Oracle is unreachable.
- Flash sales reach **150 requests/s** on a handful of SKUs; p95 must stay under **300 ms**.

**Design the flow(s).**
`,
  answerTemplate: `## API contract

## Calling the procedure (IN / OUT parameters)

## Mapping OUT status to HTTP

## Errors

## Performance under a flash sale
`,
  keyPoints: [
    'Database Stored Procedure with inputParameters for IN and outputParameters (with JDBC types) for OUT; the OUT values come back in the payload map by name.',
    'Keeping check-and-reserve inside PL/SQL avoids a read-then-write race and does it in one round trip with the row lock held only inside the database.',
    'A Choice on payload.status maps business outcomes to 201 / 409 / 404; an unexpected status raises an error rather than silently returning 200.',
    'Error types: DB:CONNECTIVITY → 503 (retryable), DB:QUERY_EXECUTION (e.g. ORA-20xxx from raise_application_error) → 500/422, validation → 400.',
    'For hot SKUs size the connection pool and keep the lock short; orderId as an idempotency key in the procedure makes client retries safe.',
  ],
  solution: `
1. **HTTP Listener** \`POST /api/reservations\` (behind APIkit in a real project); status from \`vars.httpStatus\`.
2. **Validate** \`sku\` present and \`qty > 0\`.
3. **Database Stored Procedure**
   - SQL: \`{ call INV_PKG.RESERVE_STOCK(:orderId, :sku, :locationId, :qty, :ttlMinutes, :reservationId, :status, :availableQty) }\`
   - **inputParameters**: \`#[{ orderId: vars.req.orderId, sku: vars.req.sku, ... }]\`
   - **outputParameters**: \`reservationId\` VARCHAR, \`status\` VARCHAR, \`availableQty\` NUMERIC.
   - The result payload is a map: \`payload.status\`, \`payload.reservationId\`, \`payload.availableQty\`.
4. **Choice** on \`payload.status\`: RESERVED → 201 with body; INSUFFICIENT → 409 with \`available\`; UNKNOWN_SKU → 404; otherwise **Raise Error** (a new status from the DBA team should be noticed, not hidden).

**Errors:** \`DB:CONNECTIVITY\` → 503 so checkout can retry; \`DB:QUERY_EXECUTION\` (procedure raised ORA-20001 etc.) → 500 with a log; validation errors → 400.

**Flash sale:** the row lock serialises reservations of the same SKU/location, which is correct but is the bottleneck. Keep the procedure short, ensure \`(SKU, LOCATION_ID)\` is indexed, size the pool (e.g. 20–30 connections per replica), and make \`RESERVE_STOCK\` idempotent on \`orderId\` + \`sku\` so a retried request returns the existing reservation instead of reserving twice.
`,
  followUps: [
    {
      q: 'How would you return a list of alternative stores from the same procedure?',
      a: 'Add an OUT SYS_REFCURSOR parameter; declare it in outputParameters with JDBC type REF_CURSOR, and the connector returns it as an iterable of rows you can map with DataWeave.',
    },
    {
      q: 'Why not just run SELECT available, then UPDATE from Mule?',
      a: 'Between the two statements another request can take the same stock (lost update). You would need SELECT ... FOR UPDATE inside a Mule transaction, which holds the lock across network hops — slower than doing it in PL/SQL.',
    },
    {
      q: 'The procedure commits internally. What does that mean for a Mule transaction around it?',
      a: 'A COMMIT inside the procedure ends any transaction the connector started, so wrapping the call in a Try transaction gives no extra atomicity. Either let the procedure own the commit (as here) or remove the COMMIT and control it from Mule.',
    },
  ],
}
