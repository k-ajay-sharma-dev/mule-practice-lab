export default {
  id: 'ms-110',
  category: 'mulesoft',
  title: 'Exchange Lifecycle States: Development, Stable, Deprecated and What Delete Really Does',
  level: 'INTERMEDIATE',
  tags: ['exchange', 'api-management', 'asset-lifecycle', 'semver', 'deprecation', 'ci-cd'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A developer publishes an Exchange asset version in the `development` lifecycle state, then tries to select it in API Manager. What happens?',
      options: [
        'API Manager offers it, and marks it as unfinished',
        'API Manager offers it, and locks it against overwrites',
        'Exchange promotes it to `stable` once it is selected',
        'API Manager does not offer it until it is `stable`',
      ],
      answer: 3,
      explain: 'Development versions are for iteration, so other platform products such as API Manager and Anypoint Studio do not consume them. Promote the version to `stable` first. A `development` version is also not shown on the public portal, and deleting it is always a hard delete. Republishing the same GAV overwrites files, dependencies and keywords, but not asset type, tags, categories, custom fields or documentation pages.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A team publishes 1.3.0 as `stable` and finds a mistake in a response example an hour later. It wants to republish 1.3.0 with the fix. What happens?',
      options: [
        'A stable version cannot be republished or overwritten, so it must publish a new version such as 1.3.1',
        'Exchange overwrites 1.3.0, because it is less than seven days old',
        'Exchange keeps both and shows the newest',
        'The team must set 1.3.0 back to development first',
      ],
      answer: 0,
      explain: 'A stable version is ready for use and cannot be overwritten. The allowed promotions are development to stable, stable to deprecated, and deprecated to stable, so there is no path back to development.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each deletion to its result, with default settings.',
      pairs: [
        ['Delete a development version', 'Always a hard delete, whatever its age'],
        ['Delete a stable version in its first seven days', 'A hard delete only because the version is still new'],
        ['Delete a stable version after seven days', 'A soft delete: the GAV stays reserved'],
      ],
      explain: 'A hard delete lets you reuse the name and GAV. A soft delete means the GAV stays reserved. In every case the asset cannot be recovered.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A pipeline republishes version 2.1.0, which was deleted a month ago, and Exchange returns `409 Conflict: There is a deleted asset with the same version number.` Which is a documented way forward?',
      options: [
        'Publish at the next free version, or enable GAV reuse and hard-delete that version before republishing',
        'Wait seven days for the reservation to end',
        'Restore the deleted version and overwrite it',
        'Publish with the Maven Facade API, which ignores the reservation',
      ],
      answer: 0,
      explain: 'A soft-deleted GAV stays reserved permanently. The options are nextAvailableVersion, a higher version of your choice, or enabling GAV reuse and hard-deleting that version. Deleted assets cannot be restored.',
    },
    {
      type: 'single',
      detail: true,
      prompt: '`orders-api` is in `development` and depends on `common-types`, also in `development`. The team tries to promote `orders-api` to `stable`. What happens?',
      options: [
        'Exchange does not allow it until the dependency is promoted to stable first',
        'Exchange promotes both',
        'It succeeds, and the dependency stays in development',
        'Exchange copies the dependency into orders-api',
      ],
      answer: 0,
      explain: 'A stable asset cannot have a development dependency. Promote the dependencies first. Also, when a development dependency changes, the dependent asset is not regenerated; its owner must republish it.',
    },
    {
      type: 'single',
      prompt: 'What is the practical difference between `stable` and `deprecated`?',
      options: [
        'Only the status property: a deprecated version shows that it is deprecated, and it behaves like a stable version',
        'A deprecated version cannot be downloaded',
        'A deprecated version is deleted after 90 days',
        'Deprecated versions stop working in API Manager at once',
      ],
      answer: 0,
      explain: 'The lifecycle page says the only difference is that the status property shows the version is deprecated. It can also go back to stable.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'Who can move a version to `deprecated`?',
      options: [
        'Administrators; contributors can only promote to development and stable',
        'Any user who can view the asset',
        'Only the root Organization Administrator',
        'Contributors and viewers',
      ],
      answer: 0,
      explain: 'The State Promotion section states this split, so a contributor account in a pipeline cannot deprecate a version.',
    },
  ],
  description: `
A bank's C4E team runs Exchange for 25 delivery teams. A review of the last quarter found these complaints:

- A developer published \`payments-api\` 1.2.0 with **Lifecycle state: Development** and then could not select it in API Manager.
- A team found a typo in 1.3.0 and tried to republish over it. The publish failed.
- A team removed an old version six weeks ago and now their pipeline gets **409 Conflict** when it publishes the same number.
- \`orders-api\` cannot be promoted to stable. Nobody knows why.
- A manager asks, "If we delete a wrong asset, can support bring it back?"
- Someone proposes a rule: "Publish everything as stable, because it is the default."

**Questions**
1. What are the three lifecycle states and what can you do in each?
2. Explain each complaint.
3. What is the difference between a hard delete and a soft delete? What does GAV reuse change?
4. What publishing rule would you recommend during development?
`,
  answerTemplate: `## Lifecycle states

## The complaints

## Hard delete, soft delete and GAV reuse

## Recommended publishing rule
`,
  keyPoints: [
    'An asset version moves through development, stable and deprecated. The allowed changes are development to stable, stable to deprecated, and deprecated to stable.',
    'Development: can be overwritten with the same GAV, is hidden from the public portal, and is not consumed by API Manager, Studio or other products.',
    'Stable is the default state and cannot be overwritten. Backend and API responses may call it published.',
    'Deprecated differs from stable only in the status property.',
    'Deleting a development version, or a stable version in its first seven days, is a hard delete. A stable version deleted later is a soft delete and its GAV stays reserved.',
    'Republishing a soft-deleted version gives 409 Conflict. Use the next available version, or enable GAV reuse and hard-delete it.',
    'No deleted asset can be recovered.',
    'A stable asset cannot depend on a development asset. Promote dependencies first. Changes to a dependency do not regenerate the dependent asset.',
  ],
  solution: `
**1. Lifecycle states.**
| State | Overwrite same GAV | Public portal | Used by Studio, API Manager | Delete |
|---|---|---|---|---|
| development | Yes (files, dependencies, keywords) | No | No | Always hard |
| stable (default) | No | Yes, if published to it | Yes | Hard in the first 7 days, then soft |
| deprecated | No | Same as stable | Same as stable | Same as stable |

Republishing a development version does not overwrite the asset type, tags, categories, custom fields or documentation pages.

**2. The complaints.**
- **Not selectable in API Manager.** Products other than Exchange do not consume development versions. Promote 1.2.0 to stable.
- **Typo in 1.3.0.** Stable versions cannot be overwritten. Publish 1.3.1. For text in the portal, a contributor can edit the asset portal without a new version, but files need a new version.
- **409 Conflict.** The version was stable and deleted after seven days, so it was soft-deleted and the GAV stays reserved.
- **Promotion blocked.** \`orders-api\` has a dependency still in development. Promote the dependency first.
- **Recovery.** No. An asset cannot be restored or undeleted, after a hard or a soft delete.

**3. Delete types.** A hard delete frees the GAV. A soft delete removes the version from the catalog and reserves its GAV permanently; \`nextAvailableVersion\` skips it. An administrator can turn on GAV reuse under **Settings > Asset Deletion & Connected Apps Management**. Asset owners then get an option to allow reuse when deleting. It frees only the versions that you hard-delete, and it does not matter how old the version is.

Exchange shows a warning if the version has dependent assets or API instances. You cannot delete a policy asset that is applied to an API instance.

**4. Recommended rule.** Publish as **development** while the contract is changing, and let consumers try it in Exchange. Promote to **stable** when others should use it, starting with its dependencies. After that, every change is a new version. In a pipeline, ask for the next version number and do not reuse one. The default of stable is fine for a pipeline's real releases, but it is wrong for work in progress, because each mistake then costs a version number.
`,
  followUps: [
    {
      q: 'What is a SNAPSHOT in Exchange?',
      a: 'With the Maven Facade API version 3, a SNAPSHOT version is permanently in development and cannot be promoted. Repeating mvn clean deploy overwrites it without errors.',
    },
    {
      q: 'How can a pipeline choose the version number?',
      a: 'The nextAvailableVersion endpoint in Exchange API v2 returns a free number. The versionOrder parameter chooses MAJOR, MINOR or PATCH, and reserved versions are skipped.',
    },
    {
      q: 'Is there a limit on versions?',
      a: 'Yes: 100,000 asset versions for a root organization, or 500 for trial accounts. Exchange warns at 80%. An asset can have up to 100 dependencies.',
    },
    {
      q: 'How do Version and API version relate when you add a new version?',
      a: 'They must agree. Minor or patch updates keep the API version. To set a new major Version, you must also increase the API version.',
    },
  ],
}
