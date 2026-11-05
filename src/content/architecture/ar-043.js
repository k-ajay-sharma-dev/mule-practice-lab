export default {
  id: 'ar-043',
  category: 'architecture',
  title: 'Protecting PII End to End',
  level: 'ADVANCED',
  tags: ['pii', 'encryption', 'tokenization', 'masking', 'gdpr', 'security'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each protection technique to what it does.',
      pairs: [
        ['Field-level encryption', 'Reversible with a key; for data the receiver must read but intermediaries must not'],
        ['Tokenization', 'Replaces the value with a token; only an authorised detokenization service can reverse it'],
        ['Masking', 'Irreversible partial display for UIs and logs, e.g. last 4 digits'],
        ['TLS / mTLS', 'Protects data in transit on every hop'],
      ],
      explain: 'Encryption protects data someone still needs; tokenization removes the real value from systems that only need a reference; masking is for display only.',
    },
    {
      type: 'single',
      prompt: 'The print vendor receives full member records but needs only name and address. What is the fix?',
      options: [
        'Encrypt the file with PGP',
        'Change the mapping so the vendor feed contains only name and address (data minimisation)',
        'Ask the vendor to delete unused fields',
        'Tokenize the whole record',
      ],
      answer: 1,
      explain: 'Encryption protects the transfer, but the vendor would still hold data it does not need. Minimisation removes the risk at the source.',
    },
    {
      type: 'single',
      prompt: 'Analytics must join member records across systems without ever seeing real national IDs. Which technique fits?',
      options: [
        'Masking the national ID to its last 4 digits',
        'Deterministic tokenization — the same national ID always produces the same token',
        'Base64-encoding the national ID',
        'Removing the national ID entirely',
      ],
      answer: 1,
      explain: 'Deterministic tokens keep joins working while the real value stays in the vault. Masked values collide and Base64 is just encoding, not protection.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which actions address the audit findings?',
      options: [
        'Enable TLS on the internal System APIs that still use plain HTTP',
        'A shared logging component that masks known sensitive fields, with payload logging disabled in production',
        'Field-level encryption for diagnosis codes with keys from a KMS/vault',
        'Synthetic or masked datasets for test environments instead of production copies',
        'Keep plain HTTP inside the private network because it is not reachable from the internet',
        'Allow production copies in test if only senior developers have access',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Network isolation is not enough under zero trust, and copying production PII into test is exactly what regulation forbids regardless of who has access.',
    },
    {
      type: 'single',
      prompt: 'How do you support a member erasure request across all the systems that received the data?',
      options: [
        'Delete the member from the Policy database only',
        'Keep a data inventory/lineage of which systems hold which fields and run an erasure workflow (event or orchestrated calls) with confirmation tracking',
        'Wait for data to expire from each system',
        'Ask each system owner by email',
      ],
      answer: 1,
      explain: 'You can only erase what you know about. Tokenization helps further: deleting the token mapping makes downstream tokens meaningless.',
    },
    {
      type: 'single',
      prompt: 'What should a MemberChanged event carry?',
      options: [
        'The full member record including national ID and diagnosis codes',
        'Ids/tokens and the changed field names; consumers needing details call an authorised API',
        'Nothing but a timestamp',
        'The full record, encrypted with one shared key for all consumers',
      ],
      answer: 1,
      explain: 'Broadcasting full records spreads PII to every subscriber. Thin events plus authorised lookups keep minimisation enforceable.',
    },
  ],
  description: `
A health insurer integrates member data across systems with Mule:

\`\`\`
Member portal → Member Experience API → Member Process API
   → Policy System API (on-prem DB)
   → Claims SaaS
   → publishes MemberChanged to a broker → analytics, CRM, print vendor (SFTP)
\`\`\`

PII involved: name, date of birth, national ID, address, bank account (IBAN), diagnosis codes (special category data).

Audit findings:
- National IDs and diagnosis codes appear in plain text in application logs and in the analytics data lake.
- The print vendor receives full member records but needs only name and address.
- Some System APIs use plain HTTP inside the private network.
- Developers copy production data into test environments to reproduce issues.

Regulation requires data minimisation, protection in transit and at rest, and the ability to erase a member's data on request.

**Questions:**
- Classify the data and define handling rules per class.
- Where do you apply encryption, tokenization and masking in this landscape — and what is the difference between them?
- How do you fix logging and test-data practices?
- How do you support erasure requests across systems that received the data?
`,
  answerTemplate: `## Data classification and rules

## Encryption, tokenization, masking — where and why

## Logging and non-production data

## Minimisation and erasure
`,
  keyPoints: [
    'Classify data (e.g. public, internal, confidential PII, special-category/sensitive) and attach handling rules per class to API specs and event schemas.',
    'Encryption in transit (TLS everywhere, mTLS between services) and at rest (storage, queues, files), plus field-level encryption for the most sensitive fields that pass through intermediaries.',
    'Tokenization replaces a value (national ID, IBAN) with a token so downstream systems and analytics never hold the real value; only an authorised detokenization service can reverse it.',
    'Masking is for display and logs (e.g. last 4 digits) and is irreversible; logs must never contain sensitive PII, enforced by a shared logging component.',
    'Data minimisation: each consumer (print vendor, analytics) receives only the fields it needs, enforced in Experience/System API mappings and event design.',
    'Production PII is not copied to test environments; use synthetic or masked data, and keep a record of which systems receive which data to support erasure.',
  ],
  solution: `
**Classification.**

| Class | Examples | Rules |
|---|---|---|
| Public/Internal | product codes | normal handling |
| Confidential PII | name, address, DOB, email | TLS, access control, minimisation, masked in logs |
| Sensitive identifiers | national ID, IBAN | tokenize or field-encrypt, never logged |
| Special category | diagnosis codes | strict need-to-know, field-level encryption, audit access |

Document the class of each field in RAML/OAS and event schemas (e.g. annotations or a naming convention) so reviews and governance can check it.

**Encryption.**
- **In transit:** TLS on every hop, including internal System APIs (fix plain HTTP); mTLS between apps where feasible; SFTP/PGP to the print vendor.
- **At rest:** encrypted databases and buckets; broker messages encrypted at rest (managed services typically provide this — verify the configuration); secure properties for credentials.
- **Field-level:** encrypt national ID/diagnosis inside the payload (e.g. Mule **Crypto module** with JCE/PGP, keys from a KMS/vault) so intermediaries, queues and logs only see ciphertext.

**Tokenization.**
- Replace national ID and IBAN with tokens at the earliest point (System API or Process API). Analytics, CRM and events carry the token; joins still work because the same input produces the same token (deterministic tokenization) where needed.
- Only a small number of authorised services call a detokenization endpoint. Options: an enterprise tokenization/vault service, or Anypoint Security tokenization where available (it runs on Runtime Fabric) — choose what fits your deployment model.

**Masking.**
- For UI and logs: \`NL**********1234\`. Irreversible.
- A shared **logging library** with a DataWeave masking function applied to known sensitive field names; payload logging disabled in production; log scanning for patterns (IBAN, national ID) to catch leaks.

**Minimisation.**
- Print vendor feed: mapping produces only name + address.
- Events: MemberChanged carries IDs/tokens and changed field names, not the full record; consumers needing details call an authorised API.
- Analytics: pseudonymised (tokens), no diagnosis codes unless an approved use case.

**Non-production data.** Ban production copies; provide synthetic datasets and a masking pipeline for exceptional cases; access to prod data for debugging only via audited break-glass procedures.

**Erasure.** Maintain a **data inventory/lineage** (which systems receive which fields — the API/event catalogue helps). Implement an erasure workflow: a MemberErasureRequested event or orchestrated API calls to each holding system, with confirmation tracking. Tokenization helps: deleting the token mapping makes downstream tokens meaningless (crypto-shredding with per-subject keys is a similar idea).
`,
  followUps: [
    { q: 'Encryption vs tokenization — when do you choose which?', a: 'Encryption protects data that the receiver needs to read (with the key); tokenization removes the real value from systems that only need a reference or join key, which also reduces compliance scope for those systems.' },
    { q: 'Is HTTPS enough inside a private VPC?', a: 'Network isolation helps but is not sufficient under a zero-trust view: an attacker inside the network or a misconfigured route could read traffic, so encrypt in transit everywhere and authenticate services.' },
  ],
}
