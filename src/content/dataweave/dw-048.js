export default {
  id: 'dw-048',
  category: 'dataweave',
  title: 'Compute Idempotency Keys for Outbound Payments',
  level: 'ADVANCED',
  tags: ['dw::Crypto', 'SHA1', 'idempotency', 'canonicalization', 'duplicates'],
  estMinutes: 25,
  description: `
Your Mule app forwards payment instructions to a bank API. Network timeouts cause retries.

The bank only protects against double payments if every request carries an \`Idempotency-Key\` header. That header must be **identical for the same business payment**, even when the upstream system sends it twice with different formatting and a different \`paymentId\`.

**Canonical string**: join these six parts with \`|\` (in this order):

1. \`debtorIban\`: spaces removed, upper-case
2. \`creditorIban\`: spaces removed, upper-case
3. \`amount\`: formatted with exactly two decimals (\`1250.5\` → \`1250.50\`, \`99\` → \`99.00\`)
4. \`currency\`: upper-case
5. \`executionDate\`: as received
6. \`reference\`: trimmed; \`null\` becomes the empty string

**Key**: the **SHA-1** hash of the canonical string's UTF-8 bytes, as a **lower-case hex** string (40 characters).

**Output**: one object per payment, in input order:
- \`paymentId\`
- \`canonical\`
- \`idempotencyKey\`
- \`duplicateOf\`: the \`paymentId\` of the **first earlier** payment in the batch with the same key, or \`null\`
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `[
  { "paymentId": "PAY-1", "debtorIban": "NL91 ABNA 0417 1643 00", "creditorIban": "DE89370400440532013000", "amount": 1250.5, "currency": "eur", "executionDate": "2026-11-05", "reference": " INV-2026-001 " },
  { "paymentId": "PAY-2", "debtorIban": "NL91ABNA0417164300", "creditorIban": "BE71 0961 2345 6769", "amount": 99, "currency": "EUR", "executionDate": "2026-11-05", "reference": null },
  { "paymentId": "PAY-3", "debtorIban": "nl91abna0417164300", "creditorIban": "DE89 3704 0044 0532 0130 00", "amount": 1250.50, "currency": "EUR", "executionDate": "2026-11-05", "reference": "INV-2026-001" },
  { "paymentId": "PAY-4", "debtorIban": "NL91ABNA0417164300", "creditorIban": "DE89370400440532013000", "amount": 1250.5, "currency": "EUR", "executionDate": "2026-11-06", "reference": "INV-2026-001" }
]`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `[
  {
    "paymentId": "PAY-1",
    "canonical": "NL91ABNA0417164300|DE89370400440532013000|1250.50|EUR|2026-11-05|INV-2026-001",
    "idempotencyKey": "2d51eaa992d7c1ded4eb0349a4c02e09f9fb2505",
    "duplicateOf": null
  },
  {
    "paymentId": "PAY-2",
    "canonical": "NL91ABNA0417164300|BE71096123456769|99.00|EUR|2026-11-05|",
    "idempotencyKey": "6dd29f5e24e57ca32b84c52009eaa7bd951ebcec",
    "duplicateOf": null
  },
  {
    "paymentId": "PAY-3",
    "canonical": "NL91ABNA0417164300|DE89370400440532013000|1250.50|EUR|2026-11-05|INV-2026-001",
    "idempotencyKey": "2d51eaa992d7c1ded4eb0349a4c02e09f9fb2505",
    "duplicateOf": "PAY-1"
  },
  {
    "paymentId": "PAY-4",
    "canonical": "NL91ABNA0417164300|DE89370400440532013000|1250.50|EUR|2026-11-06|INV-2026-001",
    "idempotencyKey": "65b0342644832b55a7279a96b0a7937ea06edad4",
    "duplicateOf": null
  }
]`,
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Build the canonical string first and output only that until it matches. `amount as String {format: "#0.00"}` gives two decimals; `trim(p.reference default "")` handles the reference.',
    '`import SHA1 from dw::Crypto`. It takes a **Binary**: `SHA1(canonical as Binary {encoding: "UTF-8"})` returns the lower-case hex digest as a String.',
    'For `duplicateOf`, first compute all keys, then `map ((k, i) -> ...)` and look for an entry with a smaller index and the same key: `keyed filter ((x, j) -> j < i and x.key == k.key)`.',
  ],
  solution: `%dw 2.0
import SHA1 from dw::Crypto
output application/json

fun iban(s: String): String = upper(s replace /\\s/ with "")

fun canonical(p) = [
    iban(p.debtorIban),
    iban(p.creditorIban),
    p.amount as String {format: "#0.00"},
    upper(p.currency),
    p.executionDate,
    trim(p.reference default "")
  ] joinBy "|"

var keyed = payload map (p) -> do {
  var c = canonical(p)
  ---
  { id: p.paymentId, canonical: c, key: SHA1(c as Binary {encoding: "UTF-8"}) }
}
---
keyed map (k, i) -> {
  paymentId: k.id,
  canonical: k.canonical,
  idempotencyKey: k.key,
  duplicateOf: (keyed filter ((x, j) -> j < i and x.key == k.key))[0].id
}`,
  explanation: `
An idempotency key is only as good as its **canonicalization**: two requests that mean the same payment must produce byte-for-byte the same input to the hash. That is why every part is normalized (spaces, case, number format, null) before hashing — \`1250.5\` and \`1250.50\` are the same JSON number but would format differently without an explicit pattern.

- \`dw::Crypto\` provides \`MD5\`, \`SHA1\` and \`hashWith\`. \`MD5\`/\`SHA1\` return the **hex string** directly; they accept Binary, so coerce the String with an explicit encoding — otherwise non-ASCII references (\`Zürich\`) can hash differently on another runtime.
- The separator matters: without \`|\`, the parts \`"AB" + "C"\` and \`"A" + "BC"\` would collide.
- \`map\` passes the index, and \`filter\` can use one too, so "first earlier match" is \`filter (j < i and same key)\` then \`[0]\`; an empty result gives \`null\` for free.

Common traps:
- Hashing the raw input (or \`write(p, "application/json")\`): whitespace, key order and \`1250.5\` vs \`1250.50\` all change the key, so retries are not recognized.
- Slicing \`keyed[0 to i - 1]\` for "earlier" items: for \`i = 0\` that is \`[0 to -1]\`, which is the **whole** array — the first payment would be its own duplicate.
- \`hashWith(..., "SHA-1")\` returns **Binary**, not hex; you would need \`dw::core::Binaries::toHex\` and \`lower\`. \`SHA1\` already gives the hex string.
`,
  tests: [
    {
      name: 'Triplicate with a non-ASCII reference',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '[ { "paymentId": "A", "debtorIban": "GB29 NWBK 6016 1331 9268 19", "creditorIban": "NL91ABNA0417164300", "amount": 0.1, "currency": "gbp", "executionDate": "2026-12-01", "reference": "Zürich €" }, { "paymentId": "B", "debtorIban": "GB29NWBK60161331926819", "creditorIban": "nl91 abna 0417 1643 00", "amount": 0.10, "currency": "GBP", "executionDate": "2026-12-01", "reference": "Zürich € " }, { "paymentId": "C", "debtorIban": "gb29nwbk60161331926819", "creditorIban": "NL91ABNA0417164300", "amount": 0.1, "currency": "GBP", "executionDate": "2026-12-01", "reference": "  Zürich €" } ]',
        },
      ],
      expected:
        '[ { "paymentId": "A", "canonical": "GB29NWBK60161331926819|NL91ABNA0417164300|0.10|GBP|2026-12-01|Zürich €", "idempotencyKey": "7e03c050c7546beacb13aeb25c922bbb8231ab89", "duplicateOf": null }, { "paymentId": "B", "canonical": "GB29NWBK60161331926819|NL91ABNA0417164300|0.10|GBP|2026-12-01|Zürich €", "idempotencyKey": "7e03c050c7546beacb13aeb25c922bbb8231ab89", "duplicateOf": "A" }, { "paymentId": "C", "canonical": "GB29NWBK60161331926819|NL91ABNA0417164300|0.10|GBP|2026-12-01|Zürich €", "idempotencyKey": "7e03c050c7546beacb13aeb25c922bbb8231ab89", "duplicateOf": "A" } ]',
    },
  ],
  followUps: [
    {
      q: 'How does Mule itself protect a flow against duplicate messages?',
      a: 'The Idempotent Message Validator: it computes an id per message (a DataWeave expression such as this key) and stores it in an Object Store; a repeated id raises `MULE:DUPLICATE_MESSAGE`. Use a persistent or shared Object Store in a cluster, with a TTL.',
    },
    {
      q: 'Why SHA-1 or SHA-256 rather than just sending the canonical string as the key?',
      a: 'A hash has a fixed length that fits header limits, and it does not leak IBANs and references into proxy logs. Collisions are irrelevant for this purpose; SHA-256 (`hashWith` + `toHex`) is preferred if security policy forbids SHA-1.',
    },
    {
      q: 'Why not use a UUID generated per request as the key?',
      a: 'A random UUID is different on every retry that starts from the source message again, so the bank cannot recognize the duplicate. The key must be derived deterministically from the business content (or from a stable source id).',
    },
  ],
}
