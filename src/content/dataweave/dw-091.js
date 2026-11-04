export default {
  id: 'dw-091',
  category: 'dataweave',
  title: 'Verify an HS256 JWT by Hand: Base64URL, Signature, Algorithm, Expiry and Audience',
  level: 'ADVANCED',
  tags: ['security', 'jwt', 'hmac', 'dw::Crypto', 'base64', 'binaries'],
  estMinutes: 35,
  description: `
A batch Mule app receives partner requests over a message queue, so no API gateway sits in front of it and the JWT Validation policy cannot help. Each message carries an **HS256** JWT, and the app must check it before processing.

\`payload\` holds \`token\`, the expected \`audience\` and \`now\` (Unix seconds). \`vars.secret\` holds the shared key.

**Run the checks in this order and stop at the first failure.** Return \`{ valid: false, reason: "<CODE>", subject: null }\`.

| Check | Reason code |
|---|---|
| The token has exactly two dots, so three segments (the third may be empty) | \`MALFORMED\` |
| \`alg\` in the header is exactly \`HS256\` (reject \`none\` and anything else) | \`ALG_NOT_ALLOWED\` |
| The signature matches | \`BAD_SIGNATURE\` |
| \`exp\` is present and later than \`now\` | \`EXPIRED\` |
| \`aud\`, a String or an Array, contains \`audience\` | \`BAD_AUDIENCE\` |

If everything passes, return \`{ valid: true, reason: null, subject: <sub claim> }\`.

**Signature:** HMAC-SHA256 of \`<segment 1>.<segment 2>\`, exactly as received, using the UTF-8 bytes of the secret. Then Base64URL-encode it: Base64 with \`+\` replaced by \`-\`, \`/\` replaced by \`_\`, and the \`=\` padding removed.
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwYXJ0bmVyLTExOCIsImF1ZCI6Im9yZGVycy1hcGkiLCJpc3MiOiJodHRwczovL2lkLmV4YW1wbGUuY29tIiwiZXhwIjoxNzkzNzkwMDAwLCJzY29wZSI6Im9yZGVyczpyZWFkIn0.ZmdKqErhNvw-IIABEPl3ZWLmMBtBIEZ8_iDcvzyh9og",
  "audience": "orders-api",
  "now": 1793786400
}`,
    },
    { name: 'vars', mime: 'application/json', content: '{ "secret": "partner-signing-key-32-bytes-min!" }' },
  ],
  expected: {
    mime: 'application/json',
    content: '{ "valid": true, "reason": null, "subject": "partner-118" }',
  },
  starterCode: `%dw 2.0
output application/json
---
payload
`,
  hints: [
    'Count the dots with `sizeOf(payload.token find ".")`. Do not rely on `splitBy` alone: an unsigned token such as `header.claims.` loses its empty last segment.',
    'To decode a segment, turn Base64URL back into Base64 with `replace`, call `fromBase64` from `dw::core::Binaries`, then `read(... as String, "application/json")`.',
    'Use `HMACBinary` from `dw::Crypto`, not `HMACWith`: JWT needs the raw bytes in Base64URL, not hex.',
    '`input` is a reserved word in DataWeave, so do not use it as a parameter name.',
  ],
  solution: `%dw 2.0
import HMACBinary from dw::Crypto
import toBase64, fromBase64 from dw::core::Binaries
output application/json

var parts = payload.token splitBy "."

fun toUrl(b64: String): String = ((b64 replace "+" with "-") replace "/" with "_") replace /=+$/ with ""
fun fromUrl(segment: String): Binary = fromBase64((segment replace "-" with "+") replace "_" with "/")
fun decode(segment: String) = read(fromUrl(segment) as String {encoding: "UTF-8"}, "application/json")
fun sign(text: String): String =
  toUrl(toBase64(HMACBinary(vars.secret as Binary {encoding: "UTF-8"}, text as Binary {encoding: "UTF-8"}, "HmacSHA256")))
fun fail(reason: String) = { valid: false, reason: reason, subject: null }
---
if (sizeOf(payload.token find ".") != 2) fail("MALFORMED")
else do {
  var header = decode(parts[0])
  var claims = decode(parts[1])
  var audiences = claims.aud match {
    case a is Array -> a
    else -> [claims.aud]
  }
  ---
  if (header.alg != "HS256") fail("ALG_NOT_ALLOWED")
  else if (sign(parts[0] ++ "." ++ parts[1]) != (parts[2] default "")) fail("BAD_SIGNATURE")
  else if ((claims.exp default 0) <= payload.now) fail("EXPIRED")
  else if (!(audiences contains payload.audience)) fail("BAD_AUDIENCE")
  else { valid: true, reason: null, subject: claims.sub }
}`,
  explanation: `
**A JWT is not encrypted.** The first two segments are only Base64URL-encoded JSON, so anyone can read them. All the security is in the third segment. Decoding proves nothing until the signature matches.

**Check the algorithm against your own expectation.** The header is written by the sender. If code uses \`alg\` from the token to decide how to verify, a forged token with \`"alg": "none"\` passes. The allowed algorithm must be fixed in your code. The JWT Validation policy does the same when you set a JWT Signing Method, and its docs warn that with no algorithm configured it matches every signed and unsigned token.

**Sign the segments as received.** Never rebuild them from the parsed claims, because a re-serialised object is different text.

**\`aud\` has two shapes.** The JWT specification allows a String or an Array, so normalise it before \`contains\`.

**In production.**
- Behind an API gateway, use the JWT Validation policy instead of this script.
- \`dw::util::jwt::HMAC\` (documented since DataWeave 2.6.0) has a \`JWT\` function that creates signed tokens. It only creates them, it does not verify them, and the runner on this site cannot load that module, so this exercise uses \`dw::Crypto\`.
- A plain \`!=\` is not a constant-time comparison. Note that in an interview, and prefer a gateway or a vetted library where that risk matters.
`,
  tests: [
    {
      name: 'aud given as an Array',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwYXJ0bmVyLTIwNCIsImF1ZCI6WyJiaWxsaW5nLWFwaSIsIm9yZGVycy1hcGkiXSwiaXNzIjoiaHR0cHM6Ly9pZC5leGFtcGxlLmNvbSIsImV4cCI6MTc5Mzc5MDAwMCwic2NvcGUiOiJvcmRlcnM6cmVhZCJ9.rgEd5iwq8B5sCpbqfoX_356s266ihWxoYphTLVtchuM", "audience": "orders-api", "now": 1793786400 }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "secret": "partner-signing-key-32-bytes-min!" }' },
      ],
      expected: '{ "valid": true, "reason": null, "subject": "partner-204" }',
    },
    {
      name: 'Claims changed after signing',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwYXJ0bmVyLTk5OSIsImF1ZCI6Im9yZGVycy1hcGkiLCJpc3MiOiJodHRwczovL2lkLmV4YW1wbGUuY29tIiwiZXhwIjoxNzkzNzkwMDAwLCJzY29wZSI6Im9yZGVyczpyZWFkIn0.ZmdKqErhNvw-IIABEPl3ZWLmMBtBIEZ8_iDcvzyh9og", "audience": "orders-api", "now": 1793786400 }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "secret": "partner-signing-key-32-bytes-min!" }' },
      ],
      expected: '{ "valid": false, "reason": "BAD_SIGNATURE", "subject": null }',
    },
    {
      name: 'Unsigned token with alg none',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "token": "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJwYXJ0bmVyLTExOCIsImF1ZCI6Im9yZGVycy1hcGkiLCJpc3MiOiJodHRwczovL2lkLmV4YW1wbGUuY29tIiwiZXhwIjoxNzkzNzkwMDAwLCJzY29wZSI6Im9yZGVyczpyZWFkIn0.", "audience": "orders-api", "now": 1793786400 }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "secret": "partner-signing-key-32-bytes-min!" }' },
      ],
      expected: '{ "valid": false, "reason": "ALG_NOT_ALLOWED", "subject": null }',
    },
    {
      name: 'Expired token',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwYXJ0bmVyLTExOCIsImF1ZCI6Im9yZGVycy1hcGkiLCJpc3MiOiJodHRwczovL2lkLmV4YW1wbGUuY29tIiwiZXhwIjoxNzkzNzg2MDAwLCJzY29wZSI6Im9yZGVyczpyZWFkIn0.9xm1MvrlTScAVgC_4lzFcc2SVbXe5sXuSPA44yNQO7I", "audience": "orders-api", "now": 1793786400 }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "secret": "partner-signing-key-32-bytes-min!" }' },
      ],
      expected: '{ "valid": false, "reason": "EXPIRED", "subject": null }',
    },
    {
      name: 'Token issued for another API',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content:
            '{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwYXJ0bmVyLTExOCIsImF1ZCI6ImJpbGxpbmctYXBpIiwiaXNzIjoiaHR0cHM6Ly9pZC5leGFtcGxlLmNvbSIsImV4cCI6MTc5Mzc5MDAwMCwic2NvcGUiOiJvcmRlcnM6cmVhZCJ9.MVTm1hpknN63rZtHIONifQiD9CLaTe0xxfVAxdvKsE4", "audience": "orders-api", "now": 1793786400 }',
        },
        { name: 'vars', mime: 'application/json', content: '{ "secret": "partner-signing-key-32-bytes-min!" }' },
      ],
      expected: '{ "valid": false, "reason": "BAD_AUDIENCE", "subject": null }',
    },
    {
      name: 'Only two segments',
      inputs: [
        { name: 'payload', mime: 'application/json', content: '{ "token": "abc.def", "audience": "orders-api", "now": 1793786400 }' },
        { name: 'vars', mime: 'application/json', content: '{ "secret": "partner-signing-key-32-bytes-min!" }' },
      ],
      expected: '{ "valid": false, "reason": "MALFORMED", "subject": null }',
    },
  ],
}
