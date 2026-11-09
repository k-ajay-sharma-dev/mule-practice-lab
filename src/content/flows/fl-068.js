import { design, flow, handler, route, router, scope, source, step } from '../../flow/dsl.js'

export default {
  id: 'fl-068',
  category: 'flows',
  title: 'Cold-Chain Temperature Excursions: Oracle Record, TMS Alert with Retries',
  level: 'ADVANCED',
  tags: ['supply-chain', 'cold-chain', 'iot', 'tms', 'activemq', 'jms', 'oracle', 'until-successful'],
  estMinutes: 40,
  flowChecks: [
    {
      label: 'Telemetry readings are consumed from the cold-chain ActiveMQ queue',
      rule: { type: 'source', component: 'jms-listener', where: { destination: 'COLDCHAIN' } },
    },
    {
      label: 'Allowed temperature ranges come from Oracle through a Cache scope',
      rule: { type: 'inside', component: 'db-select', within: 'cache' },
    },
    { label: 'Only out-of-range readings raise an alert (Choice)', rule: { type: 'inside', component: 'until-successful', within: 'choice' } },
    {
      label: 'The excursion is recorded in Oracle (deduplicated per load) before calling the TMS',
      rule: { type: 'before', first: ['db-stored-procedure', 'db-insert', 'db-update'], then: 'until-successful' },
    },
    {
      label: 'One alert per excursion: the alert is sent only when recording the reading says so',
      rule: {
        type: 'any',
        rules: [
          { type: 'before', first: ['db-stored-procedure', 'db-insert', 'db-update'], then: 'choice' },
          { type: 'exists', component: 'idempotent' },
        ],
      },
    },
    { label: 'The TMS alert call is retried with Until Successful', rule: { type: 'inside', component: 'http-request', within: 'until-successful' } },
    {
      label: 'Retries cover a short TMS outage and still leave time to tell QA within 2 minutes',
      rule: { type: 'exists', component: 'until-successful', where: { maxRetries: { gte: 2, lte: 6 }, millisBetweenRetries: { gte: 5000, lte: 20000 } } },
    },
    {
      label: 'Exhausted retries (MULE:RETRY_EXHAUSTED) are handled in a Try around the retry scope',
      rule: { type: 'inside', component: 'on-error-continue', within: 'try', where: { type: 'RETRY_EXHAUSTED' } },
    },
    {
      label: 'When the TMS stays down the alert is escalated to QA, not lost',
      rule: {
        type: 'inside',
        component: ['jms-publish', 'email-send'],
        within: 'on-error-continue',
        withinWhere: { type: { oneOf: ['RETRY_EXHAUSTED', 'ANY'] } },
      },
    },
  ],
  referenceFlow: design(
    flow(
      'coldchain-telemetry',
      // Artemis anycast queue fed by the IoT gateway; several consumers, ackMode AUTO.
      source('jms-listener', { destination: 'COLDCHAIN.TELEMETRY', ackMode: 'AUTO', transactionalAction: 'NONE' }),
      [
        step('set-variable', { variableName: 'reading', value: '#[payload]' }),
        scope('cache', { cachingStrategy: 'temp-range-cache' }, [
          // Cache key = loadId; entries expire after 30 min.
          step('db-select', {
            sql: 'SELECT l.LOAD_ID, l.TMS_LOAD_REF, pc.MIN_TEMP_C, pc.MAX_TEMP_C, pc.MAX_EXCURSION_MIN\nFROM SHIPMENT_LOAD l\nJOIN PRODUCT_CLASS pc ON pc.CLASS_CODE = l.PRODUCT_CLASS\nWHERE l.LOAD_ID = :loadId',
          }),
        ]),
        step('set-variable', { variableName: 'range', value: '#[payload[0]]' }),
        router(
          'choice',
          {},
          [
            route(
              {
                expression:
                  '#[vars.range != null and (vars.reading.tempC < vars.range.MIN_TEMP_C or vars.reading.tempC > vars.range.MAX_TEMP_C)]',
              },
              [
                // Opens an excursion or extends the open one; OUT p_alert_needed = 'Y' only when first opened
                // or when it has lasted longer than MAX_EXCURSION_MIN.
                step('db-stored-procedure', {
                  sql: '{ call COLDCHAIN_PKG.RECORD_EXCURSION(:loadId, :deviceId, :tempC, :readAt, :excursionId, :alertNeeded) }',
                }),
                router(
                  'choice',
                  {},
                  [
                    route({ expression: '#[payload.alertNeeded == "Y"]' }, [
                      step('set-variable', { variableName: 'excursionId', value: '#[payload.excursionId]' }),
                      step('transform', {
                        script:
                          '%dw 2.0\noutput application/json\n---\n{\n  loadReference: vars.range.TMS_LOAD_REF,\n  alertType: "TEMPERATURE_EXCURSION",\n  excursionId: vars.excursionId,\n  deviceId: vars.reading.deviceId,\n  temperatureC: vars.reading.tempC,\n  allowedRange: { min: vars.range.MIN_TEMP_C, max: vars.range.MAX_TEMP_C },\n  observedAt: vars.reading.readAt,\n  location: { lat: vars.reading.lat, lon: vars.reading.lon }\n}',
                      }),
                      scope(
                        'try',
                        { transactionalAction: 'INDIFFERENT' },
                        [
                          scope('until-successful', { maxRetries: 4, millisBetweenRetries: 15000 }, [
                            step('http-request', { method: 'POST', path: '/tms/v1/loads/alerts', responseTimeout: 5000 }),
                          ]),
                          step('db-update', {
                            sql: "UPDATE EXCURSION SET TMS_ALERT_STATUS = 'SENT', TMS_ALERT_AT = SYSTIMESTAMP WHERE EXCURSION_ID = :excursionId",
                          }),
                        ],
                        {
                          errorHandlers: [
                            handler('on-error-continue', { type: 'MULE:RETRY_EXHAUSTED' }, [
                              step('jms-publish', { destination: 'COLDCHAIN.ALERTS.ESCALATION' }),
                              step('email-send', { toAddresses: 'qa-coldchain@example.com', subject: 'TMS unreachable - temperature excursion' }),
                            ]),
                          ],
                        },
                      ),
                    ]),
                  ],
                  { otherwise: [step('logger', { level: 'DEBUG', message: '#["Excursion " ++ (payload.excursionId default "") ++ " already alerted"]' })] },
                ),
              ],
            ),
            route({ expression: '#[vars.range == null]' }, [
              step('logger', { level: 'WARN', message: '#["Reading for unknown load " ++ (vars.reading.loadId default "?")]' }),
            ]),
          ],
          {
            otherwise: [
              // In range: close any open excursion for the load.
              step('db-update', {
                sql: "UPDATE EXCURSION SET STATUS = 'CLOSED', CLOSED_AT = :readAt WHERE LOAD_ID = :loadId AND STATUS = 'OPEN'",
              }),
            ],
          },
        ),
      ],
      [
        handler('on-error-propagate', { type: 'DB:CONNECTIVITY' }, [
          step('logger', { level: 'ERROR', message: '#["Oracle unavailable, reading will be redelivered: " ++ error.description]' }),
        ]),
      ],
    ),
  ),
  description: `
A pharma and fresh-food distributor runs **1,200 refrigerated trailers**. Each trailer's IoT gateway sends a reading every 60 s (load ID, device ID, temperature, GPS, timestamp) to the **ActiveMQ Artemis** queue \`COLDCHAIN.TELEMETRY\` — about **20 readings/s**, more when trailers reconnect and flush buffered readings.

- Allowed ranges depend on the **product class** of the load (e.g. 2–8 °C for vaccines, −25 to −18 °C for frozen), stored in **Oracle** (\`SHIPMENT_LOAD\`, \`PRODUCT_CLASS\`).
- An out-of-range reading opens an **excursion** in Oracle; further out-of-range readings extend it; an in-range reading closes it.
- The **TMS** (transport management system) must get **one alert per excursion** (plus a reminder if it lasts longer than the class limit), so dispatch can call the driver. The TMS API is flaky: timeouts and 503s several times a day, for up to a minute.
- If the TMS cannot be reached, **QA must still be told** within 2 minutes.

**Design the flow(s).**
`,
  answerTemplate: `## Consuming telemetry

## Range lookup

## Excursion detection and de-duplication

## Alerting the TMS with retries

## When the TMS is down
`,
  keyPoints: [
    'JMS listener on the telemetry queue; readings are small and frequent, so per-reading work must be cheap.',
    'Cache scope around the Oracle range lookup (keyed by load) avoids a database query for every reading.',
    'Choice: out of range → record the excursion; unknown load → log; in range → close any open excursion.',
    'A stored procedure records/extends the excursion and returns whether an alert is needed, so one excursion produces one TMS alert, not one per reading.',
    'Until Successful (e.g. 4 retries, 15 s apart) covers short TMS outages; a Try around it catches MULE:RETRY_EXHAUSTED.',
    'On exhaustion, escalate via a JMS escalation queue and email so QA is told even though the TMS is down.',
  ],
  solution: `
1. **JMS On New Message** \`COLDCHAIN.TELEMETRY\` (AUTO ack, several consumers), with **Inbound Content-Type** \`application/json\` if the IoT gateway does not state the message type (the config default is \`*/*\`).
2. **Cache** scope (key: \`loadId\`, TTL 30 min) → **Database Select** load + product-class range.
3. **Choice**
   - **Out of range** → **Stored Procedure** \`COLDCHAIN_PKG.RECORD_EXCURSION\` (IN: load, device, temp, time; OUT: excursionId, alertNeeded). Doing open-or-extend in PL/SQL with a unique "one open excursion per load" constraint makes it safe with several concurrent consumers and with duplicate readings.
     - **Choice** \`alertNeeded == "Y"\` → Transform alert JSON → **Try** { **Until Successful** (4 × 15 s) → **HTTP Request** POST TMS alert → **Database Update** \`TMS_ALERT_STATUS = 'SENT'\` }.
     - Try's **On Error Continue** \`MULE:RETRY_EXHAUSTED\` → **JMS Publish** to \`COLDCHAIN.ALERTS.ESCALATION\` (a retry flow keeps trying the TMS later) and **Email** QA.
   - **Unknown load** → log (or park).
   - **Otherwise** (in range) → close the open excursion.
4. \`DB:CONNECTIVITY\` → propagate so the reading is redelivered by the broker.

**Why not retry by redelivering the reading?** The excursion is already recorded; redelivery would re-run the whole flow and block the consumer. Retrying just the HTTP call is cheaper, and the escalation queue keeps the alert durable.

**Timing:** 4 waits × 15 s + 5 attempts × 5 s timeout ≈ 85 s worst case, inside the 2-minute QA requirement. Until Successful blocks that consumer thread while waiting, so allow enough consumers for bursts.
`,
  followUps: [
    {
      q: 'Readings can arrive out of order when a trailer flushes its buffer. What breaks?',
      a: 'An old in-range reading could close an excursion opened by a newer one. The procedure should compare the reading timestamp with the excursion’s last reading and ignore older ones.',
    },
    {
      q: 'Why use a Try around Until Successful rather than an error handler on the flow?',
      a: 'The flow-level handler would end the whole flow; the Try scopes the fallback to the TMS call only and lets the flow complete normally, so the message is acknowledged.',
    },
    {
      q: 'How would you avoid flooding Oracle with 20 inserts/s for in-range readings?',
      a: 'No reading is inserted: in-range readings only run an indexed close UPDATE that usually matches nothing (or skip it by caching which loads have an open excursion). Raw readings go to a time-series store or data lake via a separate consumer, not the transactional database.',
    },
  ],
}
