import { design, flow, handler, source, step } from '../../flow/dsl.js'
import { handlerStatus } from '../../flow/rules.js'

export default {
  id: 'fl-093',
  category: 'flows',
  title: 'Signed Partner Callbacks: Timestamp Window, Replay Protection and Key Rotation with No Downtime',
  level: 'ADVANCED',
  tags: ['security', 'hmac', 'webhooks', 'secure-properties', 'idempotency', 'http', 'anypoint-mq'],
  estMinutes: 35,
  flowChecks: [
    { label: 'Callbacks are received through an HTTP Listener', rule: { type: 'source', component: 'http-listener', where: { path: 'callbacks' } } },
    { label: 'The signing keys come from secure properties', rule: { type: 'exists', component: 'set-variable', where: { value: 'secure::' }, min: 2 } },
    { label: 'Both the timestamp and the signature are validated', rule: { type: 'exists', component: 'validation', where: { check: 'is-true' }, min: 2 } },
    {
      label: 'Both checks run before the replay check, so forged requests do not fill the store',
      rule: { type: 'before', first: 'validation', then: 'idempotent', every: true },
    },
    { label: 'A replayed request is stopped before anything is published', rule: { type: 'before', first: 'idempotent', then: 'mq-publish' } },
    { label: 'Valid events go to the shipment.callbacks queue', rule: { type: 'exists', component: 'mq-publish', where: { destination: 'shipment.callbacks' } } },
    { label: 'A failed check returns 401 (VALIDATION:INVALID_BOOLEAN handled)', rule: { type: 'handler', component: 'on-error-propagate', errorType: 'VALIDATION:INVALID_BOOLEAN' } },
    { label: 'A duplicate is answered as a success (MULE:DUPLICATE_MESSAGE handled)', rule: { type: 'handler', component: 'on-error-continue', errorType: 'MULE:DUPLICATE_MESSAGE' } },
    { label: 'The VALIDATION:INVALID_BOOLEAN handler sets the status to 401', rule: handlerStatus('VALIDATION:INVALID_BOOLEAN', '401') },
    { label: 'The MULE:DUPLICATE_MESSAGE handler sets the status to 200', rule: handlerStatus('MULE:DUPLICATE_MESSAGE', '200') },
    {
      // An error handler overrides the status, so the main path may set it at any point.
      label: 'A valid event is answered with 202, set on the main path and not in an error handler',
      rule: { type: 'before', first: 'http-listener', then: 'set-variable', thenWhere: { value: '202' }, outside: true },
    },
  ],
  optionalSteps: [
    {
      type: 'on-error-propagate',
      why: 'The 401 handler is checked on its own. The catch-all only sets 500 and a generic body, and Mule already answers 500 by default.',
    },
  ],
  referenceFlow: design(
    flow(
      'partner-callback-intake',
      source('http-listener', { path: '/callbacks/shipments', allowedMethods: 'POST' }),
      [
        step('set-variable', { variableName: 'keyCurrent', value: '${secure::partner.callback.key.current}' }),
        step('set-variable', { variableName: 'keyPrevious', value: '${secure::partner.callback.key.previous}' }),
        // Format: t=<unix seconds>,v1=<hex>. A missing or broken header gives nulls, which fail the checks below.
        step('set-variable', {
          variableName: 'sig',
          value:
            '#[do { var kv = ((attributes.headers."x-partner-signature" default "") splitBy ",") map ((part) -> part splitBy "=") --- { t: (kv filter ($[0] == "t"))[0][1], v1: (kv filter ($[0] == "v1"))[0][1] } }]',
        }),
        step('validation', {
          check: 'is-true',
          expression: '#[((vars.sig.t default "") matches /^\\d{10}$/) and (abs((now() as Number {unit: "seconds"}) - (vars.sig.t as Number)) <= 300)]',
          message: 'Signature timestamp missing or outside the 5 minute window',
        }),
        // Over the raw bytes, with either key, so the partner can switch key at its own moment.
        step('validation', {
          check: 'is-true',
          expression:
            '#[do { var text = (vars.sig.t ++ "." ++ (payload.^raw as String {encoding: "UTF-8"})) as Binary {encoding: "UTF-8"} var sent = vars.sig.v1 default "" --- dw::Crypto::HMACWith(vars.keyCurrent as Binary {encoding: "UTF-8"}, text, "HmacSHA256") == sent or dw::Crypto::HMACWith(vars.keyPrevious as Binary {encoding: "UTF-8"}, text, "HmacSHA256") == sent }]',
          message: 'Invalid callback signature',
        }),
        // The default store is not persistent, and its 5 minute TTL leaves no margin, so use a named persistent store.
        step('idempotent', { idExpression: '#[vars.sig.v1]', objectStore: 'callback-replay-store' }),
        // The validators and Set Variable leave the payload untouched, so this is still the partner's JSON.
        step('mq-publish', { destination: 'shipment.callbacks' }),
        step('set-variable', { variableName: 'httpStatus', value: '#[202]' }),
        step('transform', {
          script: '%dw 2.0\noutput application/json\n---\n{ status: "ACCEPTED", correlationId: correlationId }',
        }),
      ],
      [
        handler('on-error-continue', { type: 'MULE:DUPLICATE_MESSAGE' }, [
          step('logger', { level: 'WARN', message: '#["Replayed callback ignored, correlationId " ++ correlationId]' }),
          step('set-variable', { variableName: 'httpStatus', value: '#[200]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ status: "ALREADY_RECEIVED" }' }),
        ]),
        handler('on-error-propagate', { type: 'VALIDATION:INVALID_BOOLEAN' }, [
          step('logger', { level: 'WARN', message: '#["Callback rejected: " ++ error.description]' }),
          step('set-variable', { variableName: 'httpStatus', value: '#[401]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "UNAUTHORIZED", correlationId: correlationId }' }),
        ]),
        handler('on-error-propagate', { type: 'ANY' }, [
          step('set-variable', { variableName: 'httpStatus', value: '#[500]' }),
          step('logger', { level: 'ERROR', message: '#[error.errorType.namespace ++ ":" ++ error.errorType.identifier ++ " " ++ error.description]' }),
          step('transform', { script: '%dw 2.0\noutput application/json\n---\n{ code: "INTERNAL_ERROR", correlationId: correlationId }' }),
        ]),
      ],
    ),
  ),
  description: `
A freight marketplace pushes shipment updates to your **Shipment Callbacks API** (\`POST /callbacks/shipments\`, about 90,000 calls a day). It cannot use mutual TLS or OAuth, so it signs each request.

**The scheme**
- Header: \`X-Partner-Signature: t=1793786400,v1=5f3a...\`
- \`v1\` is the lower-case hex **HMAC-SHA256** of \`<t>.<raw request body>\`, with a shared key.

**Requirements**
- Reject a request whose timestamp is more than **5 minutes** from your clock, or whose signature does not match, with **401**. Do not explain which check failed.
- A captured request must not be processed twice. If the same signed request comes again, answer **200** without processing it, as the partner also retries on network errors.
- The key is rotated every 90 days. The partner switches on a day of its choosing, so during the change **both the old and the new key must work**.
- Keys must not appear in the project in clear text.
- Hand valid events to the queue \`shipment.callbacks\` and answer **202** at once.

**Design the flow.** Say what you sign, why, and how a rotation runs from start to finish.
`,
  answerTemplate: `## Reading the signature

## Timestamp check

## Signature check

## Replay protection

## Key rotation

## Error mapping
`,
  keyPoints: [
    'The signature covers raw bytes: payload.^raw, not a re-serialised payload. On the runner, the same JSON gave a different HMAC after write().',
    'The timestamp is inside the signed text, so it cannot be changed without breaking the signature.',
    'Check the timestamp first: it is cheap, and it guarantees a value exists before it is used in the signature check.',
    'Accept the current and previous key during rotation, and remove the old key after the overlap.',
    'Keys are read with ${secure::...} from Secure Configuration Properties.',
    'The Idempotent Message Validator stops replays and raises MULE:DUPLICATE_MESSAGE. Its default store is not persistent, with a 5 minute TTL, so use a persistent store that outlives the window.',
    'Validators and Set Variable do not change the payload, so the queue receives the original JSON.',
    'The is-true validator raises VALIDATION:INVALID_BOOLEAN, which is mapped to 401 with a generic body.',
  ],
  solution: `
1. **HTTP Listener** \`POST /callbacks/shipments\`.
2. **Set Variable** \`keyCurrent\` and \`keyPrevious\` from \`\${secure::partner.callback.key.current}\` and \`...previous\`. Do not log these variables.
3. **Set Variable** \`sig\`: split the header into \`t\` and \`v1\`. A missing or malformed header gives nulls.
4. **Validate** (is-true) the timestamp: exactly 10 digits, and within 300 seconds of \`now()\` in either direction, which also allows for clock differences.
5. **Validate** (is-true) the signature. Build \`<t>.<raw body>\` from \`payload.^raw\`, compute \`dw::Crypto::HMACWith(key, text, "HmacSHA256")\` with each key, and compare with \`v1\`. Name the algorithm, because the default is HmacSHA1.
6. **Idempotent Message Validator** on \`vars.sig.v1\` with a persistent store \`callback-replay-store\`. Its entry TTL must outlive the whole window. Because \`t\` can be up to 5 minutes ahead of your clock, one request can stay acceptable for 10 minutes, so use more than that, for example 15 minutes. After the window has passed, the timestamp check rejects the request anyway, so the store stays small.
7. **MQ Publish** to \`shipment.callbacks\`. The payload is still the partner's JSON.
8. Set \`httpStatus\` to 202 and answer with the correlation ID.

**Why this order.** The timestamp check needs no crypto, and it guarantees \`t\` exists. The signature check runs before the replay check, so forged requests cannot fill the store.

**Errors.**
- \`MULE:DUPLICATE_MESSAGE\` → On Error Continue, 200 \`ALREADY_RECEIVED\`.
- \`VALIDATION:INVALID_BOOLEAN\` → 401 with a generic body. The reason goes only to the log.
- Anything else → 500, so that the partner retries. The validator ran before the publish, and the docs do not say an entry is removed after a later failure. So assume a retry after a publish failure would be treated as a duplicate. Either accept this, or publish first and deduplicate in the consumer. Say which you choose.

**Rotation.**
1. Generate the new key and encrypt it into the secure properties file.
2. Deploy with \`key.current\` as the new key and \`key.previous\` as the old one.
3. Tell the partner, who switches when ready. Both keys work.
4. When the logs show no use of the old key, or the agreed date passes, replace \`key.previous\` with a new random value and deploy.

Never leave \`key.previous\` blank: a known empty key would be a security hole.
`,
  followUps: [
    {
      q: 'Why not use Mule Gateway policies for this?',
      a: 'No included Mule Gateway policy checks a custom HMAC signature scheme. It could be written as a custom policy if several APIs need it. For one partner, a flow or a shared sub-flow is simpler.',
    },
    {
      q: 'Is comparing the strings with == acceptable?',
      a: 'It works, but it is not a constant-time comparison, so in theory timing reveals information. Combined with the time window and rate limiting the risk is low. Mention it in an interview, and use a vetted component if the risk matters.',
    },
    {
      q: 'What does the HMAC not give you?',
      a: 'Confidentiality. It proves who sent the message and that it was not changed. The content still needs HTTPS.',
    },
  ],
}
