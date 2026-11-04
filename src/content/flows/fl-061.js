import { design, flow, handler, route, router, source, step } from '../../flow/dsl.js'

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
    {
      label: 'Oracle connectivity problems map to 503 (DB:CONNECTIVITY)',
      rule: { type: 'exists', component: ['on-error-propagate', 'on-error-continue'], where: { type: 'DB:CONNECTIVITY' } },
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
              step('set-payload', { value: '#[{ error: "INSUFFICIENT_STOCK", sku: vars.req.sku, available: payload.availableQty }]' }),
            ]),
            route({ expression: '#[payload.status == "UNKNOWN_SKU"]' }, [
              step('set-variable', { variableName: 'httpStatus', value: '404' }),
              step('set-payload', { value: '#[{ error: "UNKNOWN_SKU", sku: vars.req.sku }]' }),
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
          step('set-payload', { value: '#[{ error: "Inventory service temporarily unavailable" }]' }),
        ]),
        handler('on-error-propagate', { type: 'DB:QUERY_EXECUTION' }, [
          step('logger', { level: 'ERROR', message: '#["RESERVE_STOCK failed: " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '500' }),
          step('set-payload', { value: '#[{ error: "Reservation failed" }]' }),
        ]),
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN, VALIDATION:BLANK_STRING' }, [
          step('set-variable', { variableName: 'httpStatus', value: '400' }),
          step('set-payload', { value: '#[{ error: error.description }]' }),
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
