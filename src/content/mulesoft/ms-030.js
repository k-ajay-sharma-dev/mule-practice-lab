export default {
  id: 'ms-030',
  category: 'mulesoft',
  title: 'Anypoint Exchange Assets and Semantic Versioning',
  level: 'BEGINNER',
  tags: ['exchange', 'semver', 'api-versioning', 'reuse'],
  estMinutes: 10,
  quiz: [
    {
      type: 'match',
      prompt: 'Starting from `customer-sapi` 1.2.3, match each change to the next asset version.',
      pairs: [
        ['Fix a typo in a description', '1.2.4'],
        ['Add an optional `loyaltyTier` response field', '1.3.0'],
        ['Rename `custId` to `customerId`', '2.0.0'],
      ],
      explain: 'Semver is MAJOR.MINOR.PATCH: a fix with no contract change is a **patch**, a backward-compatible addition is a **minor**, and anything that breaks existing clients (a rename) is a **major**.',
    },
    {
      type: 'single',
      prompt: 'You add a new **required** request field to an existing endpoint. Which version bump is correct?',
      options: [
        'Patch, because no endpoint was added or removed',
        'Minor, because it is an addition',
        'Major, because existing clients do not send the field and their requests would fail validation',
        'No new version is needed if the field has a description',
      ],
      answer: 2,
      explain: 'Not every addition is backward compatible. Existing clients would be rejected, so it is a **breaking** change and needs a major version — or make the field optional and ship it as a minor.',
    },
    {
      type: 'single',
      prompt: 'A consumer team says "you changed the spec under us", yet nobody edited 1.2.3. What is the root cause and fix?',
      options: [
        'Exchange silently overwrote 1.2.3; ask support to restore it',
        'They depended on "latest" instead of an exact version; they should pin an exact asset version and upgrade deliberately',
        'The API instance in API Manager was deleted',
        'Their groupId was wrong, so Maven picked another organization\'s asset',
      ],
      answer: 1,
      explain: 'A published version is not edited in place. Scaffolding against "latest" makes builds non-reproducible — pinning an exact version fixes it.',
    },
    {
      type: 'single',
      prompt: 'What is the relationship between the asset version (1.3.0) and the API version (`v1` in `/api/v1/customers`)?',
      options: [
        'They are the same thing and must always be equal',
        'The API version is what clients see and should change only on breaking changes, i.e. together with a new major asset version',
        'The API version changes on every minor asset release',
        'The asset version is only used by API Manager; Exchange uses the API version',
      ],
      answer: 1,
      explain: 'The asset version versions the **artifact**; the API version is the **contract** exposed to clients. Minor and patch asset updates keep `v1`.',
    },
    {
      type: 'multi',
      prompt: 'Which of these identify an Exchange asset?',
      options: ['groupId (the organization or business group ID)', 'assetId', 'version', 'The Runtime Manager environment name', 'The API Manager instance ID'],
      answer: [0, 1, 2],
      explain: 'Exchange uses Maven-style coordinates — **groupId, assetId, version** — the same ones you put in a POM dependency. Environments and API instances belong to Runtime/API Manager, not to the asset identity.',
    },
    {
      type: 'order',
      prompt: 'Put the steps for retiring an old asset version in order.',
      items: [
        'Mark the old version as deprecated in Exchange',
        'Communicate a migration window to consumers',
        'Run the old and new API versions side by side while consumers migrate',
        'Remove the old version once no consumer remains',
      ],
      explain: 'Deprecation hides the version from view without deleting it, and consumers then get time to move. Removal comes last, only when nobody depends on it.',
    },
  ],
  description: `
Your team publishes a \`customer-sapi\` RAML spec to Exchange as version **1.2.3**. Since then:

| Change | Example |
|---|---|
| A | Fix a typo in a description |
| B | Add an optional \`loyaltyTier\` field to the response |
| C | Rename \`custId\` to \`customerId\` |
| D | Add a new endpoint \`GET /customers/{id}/addresses\` |

A consumer team complains: "You changed the spec under us and our build broke", although nobody touched 1.2.3. It turns out they re-scaffolded their project against the "latest" version of the asset instead of a pinned one.

**Questions**
1. What kinds of assets live in Exchange, and how are they identified?
2. Using semantic versioning, what version would A, B, C and D each produce?
3. What is the difference between the **asset version** (1.2.3) and the **API version** (v1) that appears in the URL?
4. How should consumers pin versions, and how do you retire an old version?
`,
  answerTemplate: `## Asset types and identity

## Versions for A–D

## Asset version vs API version

## Pinning and retirement
`,
  keyPoints: [
    'Exchange holds API specs (RAML/OAS), fragments, connectors, templates, examples, policies, DataWeave libraries and custom assets.',
    'Each asset is identified by Maven-style coordinates: groupId (organization/business group ID), assetId and version.',
    'Semver MAJOR.MINOR.PATCH: breaking change = major, backward-compatible addition = minor, fix with no contract change = patch.',
    'The asset version tracks the artifact; the API version (v1) is the contract exposed to clients and changes only with breaking changes.',
    'Consumers should depend on an exact version; old versions are deprecated before removal so consumers get time to migrate.',
  ],
  solution: `
**Asset types:** REST API specs (RAML, OAS), API fragments (data types, traits, libraries), connectors/modules, templates, examples, custom policies, DataWeave libraries, and custom assets (docs, files). Every asset has **groupId** (the organization or business group ID), **assetId**, **version** — the same coordinates used in a POM dependency.

**Versions (from 1.2.3)**
| Change | New version | Why |
|---|---|---|
| A — typo | 1.2.4 | patch: no contract change |
| B — optional response field | 1.3.0 | minor: backward compatible addition |
| C — rename field | **2.0.0** | major: breaks existing clients |
| D — new endpoint | 1.3.0 (or 1.4.0) | minor: additive |

**Asset version vs API version:** the asset version (1.3.0) versions the *artifact*. The API version (\`v1\` in \`/api/v1/customers\`, the RAML \`version:\` / OAS \`info.version\` field) is what clients see; it should change only on breaking changes — i.e. together with a new major asset version. Minor/patch updates can normally be applied to the same API instance; check this in API Manager for your setup.

**Pinning and retirement**
- Consumers depend on an exact asset version and upgrade deliberately; scaffolding against "latest" makes builds non-reproducible.
- A published version is not edited in place — publish a new version instead.
- Retire old versions by **deprecating** them in Exchange (this hides the version from view; it is not deleted), communicate a migration window, then remove when no consumer remains. For the running API, keep v1 and v2 deployed side by side during the transition.
`,
  followUps: [
    {
      q: 'Why does Exchange use the organization ID as groupId?',
      a: 'It makes coordinates unique per organization or business group and lets Maven resolve assets from the Exchange repository with the right permissions.',
    },
    {
      q: 'Is adding a new required request field a minor change?',
      a: 'No. Existing clients do not send it, so their requests would fail validation — it is a breaking change and needs a major version (or make the field optional).',
    },
  ],
}
