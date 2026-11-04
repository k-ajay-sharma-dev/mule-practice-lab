export default {
  id: 'inc-098',
  category: 'incidents',
  title: 'Release Pipeline Fails With 409 Conflict After Someone Deleted a Five-Week-Old Exchange Version',
  level: 'INTERMEDIATE',
  tags: ['exchange', 'api-management', 'ci-cd', 'asset-lifecycle', 'semver', 'deployment'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '09:12:03 INFO  [jenkins] customer-sapi-spec #214 started by release-bot', relevant: false },
      { text: '09:12:40 INFO  [jenkins] Validate spec: OK', relevant: false },
      { text: '09:12:58 INFO  [jenkins] Publish customer-sapi 3.4.0 to Exchange', relevant: true, why: 'The pipeline publishes a fixed version number taken from the repository.' },
      { text: '09:13:01 ERROR [jenkins] Exchange returned 409 Conflict: There is a deleted asset with the same version number.', relevant: true, why: 'This message is documented: the GAV belongs to a soft-deleted version.' },
      { text: '09:13:01 ERROR [jenkins] Build #214 FAILED', relevant: false },
      { text: 'Audit: Tuesday 17:40 asset version customer-sapi 3.4.0 deleted by a.lee (published 5 weeks earlier, state stable)', relevant: true, why: 'A stable version deleted after its first seven days is a soft delete, so the GAV stays reserved.' },
      { text: 'Exchange settings: Asset Deletion Configuration, GAV reuse disabled', relevant: true, why: 'With reuse disabled, a deleted version number cannot be made available again.' },
      { text: '09:20:11 INFO  [customer-sapi] GET /api/customers/1044 200 (38 ms)', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why does the publish fail?',
        options: [
          'Version 3.4.0 was stable and deleted after its first seven days, so it was soft-deleted and its GAV stays reserved',
          'Stable assets can never be deleted',
          'release-bot lost its Exchange permission',
          'Exchange blocks publishing for seven days after any deletion',
        ],
        answer: 0,
        explain: 'Deleting a stable version after seven days is a soft delete, which prevents reuse of the name and GAV. The 409 message says so. The reservation is permanent and does not expire after a period.',
      },
      {
        type: 'single',
        prompt: 'The release is due today. What is the simplest safe way forward?',
        options: [
          'Publish the corrected spec with the next free version, such as 3.4.1',
          'Ask support to restore 3.4.0',
          'Publish 3.4.0 through the Maven facade to avoid the check',
          'Create a new asset with a different asset ID',
        ],
        answer: 0,
        explain: 'Exchange suggests a higher version, or the nextAvailableVersion endpoint. An asset cannot be restored. A new asset ID would break every reference to this asset.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Let the pipeline ask nextAvailableVersion, or increment the version, instead of republishing a fixed number',
          'Publish work in progress in the development state, which can be overwritten',
          'Use deprecated in place of delete for a version that should no longer be used',
          'Limit who can delete assets to Exchange or asset administrators',
          'Delete versions within seven days whenever possible, as normal practice',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Development versions can be overwritten and always hard-delete. Deprecation keeps the version and signals its status. Deletion should be rare, because nothing can be recovered.',
      },
      {
        type: 'order',
        prompt: 'Order the steps if the team must have the exact number 3.4.0 back.',
        items: [
          'Confirm that the GAV is reserved, with the softDeleted endpoint',
          'An Exchange administrator enables GAV reuse in Asset Deletion Configuration',
          'Hard-delete that version with the x-delete-type: hard-delete header',
          'Republish 3.4.0',
        ],
        explain: 'Enabling GAV reuse frees only the versions that you then hard-delete. It does not free the whole version history of an asset.',
      },
    ],
  },
  description: `
## Symptoms
- Thursday 09:13: the release pipeline for the \`customer-sapi\` spec fails at the Exchange publish step with **409 Conflict**.
- The running API is healthy. Only the release is blocked.

## Change / Context
- On Tuesday, a developer found a wrong example in version **3.4.0**, published five weeks ago as stable. He deleted the version so he could "publish it again with the fix".
- The pipeline takes its version number from a file in the repository, which still says 3.4.0.
- The developer has the Exchange Administrators permission, as do all 30 developers.
- No API instance or asset depended on 3.4.0, so Exchange showed no warning.

## Logs
\`\`\`
09:12:58 INFO  [jenkins] Publish customer-sapi 3.4.0 to Exchange
09:13:01 ERROR [jenkins] Exchange returned 409 Conflict:
         There is a deleted asset with the same version number.
\`\`\`

## Your tasks
1. What is the root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'A stable version cannot be overwritten, so deleting a five-week-old version to republish it could not give a clean result.',
    'Deleting a stable version in the first seven days is a hard delete. After that it is a soft delete, and the GAV stays reserved permanently.',
    'Republishing a soft-deleted version returns 409 Conflict with a documented message.',
    'Options: nextAvailableVersion, a higher version of your choice, or enabling GAV reuse and hard-deleting the version.',
    'An asset cannot be restored after any kind of delete.',
    'Enabling GAV reuse frees only the versions you hard-delete.',
    'Prevention: publish work in progress as development, deprecate in place of delete, and limit administrators.',
  ],
  solution: `
**Diagnosis.** The 409 message is the documented response for republishing a version number that belongs to a soft-deleted version. The audit shows that 3.4.0 was stable and five weeks old when it was deleted. After the first seven days, deleting a stable version is a soft delete. The version leaves the catalog, but its group ID, asset ID and version stay reserved.

**Immediate mitigation.** Publish the fix as **3.4.1**, or take the number from \`nextAvailableVersion\`, which skips reserved numbers. Consumers of 3.4.0 would need to move to the new version anyway, because the old one is gone. Do not ask support to restore it: an asset cannot be restored or undeleted.

If the exact number is needed, an administrator can enable GAV reuse, then hard-delete that version and republish.

**Root cause.** Two things combined. The developer treated delete as "undo", and the pipeline used a fixed number. A stable version cannot be overwritten, so the correct fix for a wrong example was a new patch version from the start.

**Permanent fix.**
- The pipeline asks \`nextAvailableVersion\` with \`versionOrder=PATCH\`, or fails early if the number is already taken.
- Pre-release specs are published as **development**, where the same GAV can be overwritten.
- A wrong version is marked **deprecated**, which keeps it and shows its status.

**Prevention.** Reduce the Exchange Administrators group. Use Exchange Contributors or Exchange Creator for developers. Document the rule "stable versions are never changed; publish the next patch."
`,
  followUps: [
    { q: 'Would this have happened if he had deleted it on the day it was published?', a: 'No. In the first seven days, deleting a stable version is a hard delete, and the name and GAV can be used again.' },
    { q: 'Can you list reserved versions?', a: 'Yes. The endpoint /api/v2/organizations/:organizationId/softDeleted lists deleted assets whose GAV is unavailable.' },
    { q: 'What if an API instance had used 3.4.0?', a: 'Exchange shows a warning for an API or policy asset version with dependent API instances. You should remove the dependency first, so the instance is moved to another asset version within the same major version.' },
  ],
}
