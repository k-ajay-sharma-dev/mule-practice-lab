export default {
  id: 'dw-090',
  category: 'dataweave',
  title: 'Sign an Outbound Webhook: Timestamped HMAC-SHA256 over the Exact Body',
  level: 'INTERMEDIATE',
  tags: ['security', 'hmac', 'dw::Crypto', 'webhooks', 'signing', 'write'],
  estMinutes: 20,
  description: `
A carrier-tracking platform sends shipment events to 60 customer systems. Customers asked for a way to prove that a webhook really came from the platform and to reject old copies of a request. The agreed scheme:

**Rules**
1. \`body\` is the JSON text of \`payload\`, written with no indentation: \`write(payload, "application/json", {indent: false})\`. This exact string is what the HTTP Request will send.
2. The signed text is \`<timestamp>.<body>\`, where \`timestamp\` is \`vars.timestamp\` (Unix seconds).
3. The signature is **HMAC-SHA256** of the signed text with the key \`vars.signingKey\`, as **lower-case hex**. Encode both the key and the signed text as **UTF-8**.
4. Return an object with \`headers\` and \`body\`:
   - \`X-Webhook-Timestamp\`: the timestamp as a String.
   - \`X-Webhook-Signature\`: \`t=<timestamp>,v1=<signature>\`.

Later steps send \`body\` as it is, so the receiver can recompute the same value from the bytes it receives.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "eventId": "evt-20931",
  "eventType": "shipment.delivered",
  "data": { "shipmentId": "SH-4471", "carrier": "DHL", "pieces": 3 }
}`,
    },
    {
      name: 'vars',
      mime: 'application/json',
      content: '{ "timestamp": 1793786400, "signingKey": "whsec_7Yq2mLx9Pd4Ta1Vc" }',
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "headers": {
    "X-Webhook-Timestamp": "1793786400",
    "X-Webhook-Signature": "t=1793786400,v1=cd74ff59e565547c55a9cdd890cf29e2f1a678b5017013927ac7d6bf5305077e"
  },
  "body": "{\\"eventId\\": \\"evt-20931\\",\\"eventType\\": \\"shipment.delivered\\",\\"data\\": {\\"shipmentId\\": \\"SH-4471\\",\\"carrier\\": \\"DHL\\",\\"pieces\\": 3}}"
}`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    '`HMACWith(secret, content, algorithm)` from `dw::Crypto` takes two Binary values and returns lower-case hex. Pass `"HmacSHA256"`, because the default is HmacSHA1.',
    'Coerce with an explicit encoding: `text as Binary {encoding: "UTF-8"}`.',
    'Build the body once in a `var` and reuse it for both the signature and the output, so what you sign is exactly what you send.',
  ],
  solution: `%dw 2.0
import HMACWith from dw::Crypto
output application/json

var body = write(payload, "application/json", {indent: false})
var ts = vars.timestamp as String
var signature = HMACWith(
  vars.signingKey as Binary {encoding: "UTF-8"},
  (ts ++ "." ++ body) as Binary {encoding: "UTF-8"},
  "HmacSHA256")
---
{
  headers: {
    "X-Webhook-Timestamp": ts,
    "X-Webhook-Signature": "t=" ++ ts ++ ",v1=" ++ signature
  },
  body: body
}`,
  explanation: `
**Sign what you send.** An HMAC covers bytes, not meaning. \`{"a":1}\` and \`{ "a": 1 }\` are the same JSON and produce different signatures. That is why the body is written to a String once, signed, and sent unchanged. If the HTTP Request re-serialised the object, the receiver would compute a different value. On this runner \`{indent: false}\` still leaves a space after each colon, which is one more reason never to assume what the serialised text looks like.

**Why the timestamp is inside the signed text.** If it were only in a header, an attacker could replay an old request with a fresh timestamp. Signing it lets the receiver reject anything outside a short window.

**Function choice.** \`HMACWith\` returns lower-case hex. \`HMACBinary\` returns Binary, which you need when the scheme wants Base64 instead, as JWT does. The default algorithm of both is HmacSHA1, so always name the algorithm.

**Keep the key out of the code.** In a real flow the key comes from a secure property, not from a literal in the script.
`,
  tests: [
    {
      name: 'Non-ASCII text is signed as UTF-8',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "eventId": "evt-20932", "eventType": "shipment.exception", "data": { "shipmentId": "SH-4480", "city": "Zürich", "note": "Dock closed" } }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "timestamp": 1793786455, "signingKey": "whsec_7Yq2mLx9Pd4Ta1Vc" }' },
      ],
      expected: `{
  "headers": {
    "X-Webhook-Timestamp": "1793786455",
    "X-Webhook-Signature": "t=1793786455,v1=543f37cd616444267bf79fcb40b57f35bf4e50b73a46335ed1b805dc3523d949"
  },
  "body": "{\\"eventId\\": \\"evt-20932\\",\\"eventType\\": \\"shipment.exception\\",\\"data\\": {\\"shipmentId\\": \\"SH-4480\\",\\"city\\": \\"Zürich\\",\\"note\\": \\"Dock closed\\"}}"
}`,
    },
  ],
}
