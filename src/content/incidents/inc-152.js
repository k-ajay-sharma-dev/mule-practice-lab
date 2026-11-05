export default {
  id: 'inc-152',
  category: 'incidents',
  title: 'Passes Test, Rejected by Production: One Patch Number in minMuleVersion Blocks a Release',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'hybrid', 'versions', 'dependencies', 'release'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '18:02:15 INFO  [ci] Commit a91c3d "bump sftp connector, regenerate project in Studio" (pom.xml, mule-artifact.json)', relevant: true, why: 'The change touched both the dependency and the descriptor, so both are suspects.' },
      { text: '18:03:40 INFO  [ci] Tests: 212 - Failed: 0 - Errors: 0 - Skipped: 0', relevant: false },
      { text: '18:09:12 INFO  [ci] Test: shipment-eapi 2.8.0 deployed to serverGroup test-grp (Mule 4.12.2), status Started', relevant: true, why: 'Test passed because its runtime is at the same patch or later.' },
      { text: '20:00:04 INFO  [ci] Production: deploying shipment-eapi 2.8.0 to cluster prod-a (Mule 4.12.1)', relevant: true, why: 'Production runs one patch behind Test.' },
      { text: '20:01:27 ERROR [mule] Artifact shipment-eapi requires a newest runtime version. Artifact required version is 4.12.2 and Mule Runtime version is 4.12.1', relevant: true, why: 'The runtime reports the exact versions that it compared.' },
      { text: '20:01:28 INFO  [agent] Heartbeat OK: prod-a-02', relevant: false },
      { text: '20:11:03 ERROR [ci] Deployment verification failed: shipment-eapi did not reach a running state', relevant: true, why: 'Verification did its job: the job failed instead of reporting a false success.' },
      { text: '20:12:10 INFO  [ops] mule-artifact.json in 2.8.0: "minMuleVersion": "4.12.2"; in 2.7.4: "minMuleVersion": "4.9.0"', relevant: true, why: 'The required version in the error is the value in the descriptor, so the connector is not the cause.' },
      { text: '20:14:00 INFO  [ops] Ticket CHG-4471 on hold pending engineering review', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'What is the cause of the rejection?',
        options: [
          'The artifact declares `minMuleVersion` 4.12.2. The comparison uses the full major.minor.patch, so a 4.12.1 runtime refuses it',
          'The SFTP connector is not compatible with clusters',
          'The plugin `muleVersion` must equal `minMuleVersion`',
          'The two runtimes differ, so Production needs a new license',
        ],
        answer: 0,
        explain: 'The docs give this very case: an app with `minMuleVersion=4.12.2` does not deploy on a `4.12.1` runtime, even though they differ only in patch. The check is patch-sensitive by design.',
      },
      {
        type: 'single',
        prompt: 'A colleague blames the connector upgrade, because a connector can raise the required version. How do you settle it?',
        options: [
          'Compare the version in the error with `minMuleVersion` in the descriptor. A dependency that needs a later runtime is reported in the error message too',
          'Roll back the connector and see what happens in Production',
          'Run `mvn clean` and retry',
          'Read the MUnit report, which lists the required runtime',
        ],
        answer: 0,
        explain: 'The docs note that the required version can be later than the one you set if a connector or other dependency needs it. Here the message shows 4.12.2, the same as the descriptor. If a dependency were the cause, you would upgrade the runtime or use a compatible dependency version.',
      },
      {
        type: 'single',
        prompt: 'Which value do the docs advise for `minMuleVersion`?',
        options: [
          'The earliest Mule version whose feature set the app needs, keeping the patch at `.0` unless you need a backported fix',
          'The exact patch of the runtime you built or scaffolded with',
          'The latest Mule version released',
          'The version of the Mule Maven plugin',
        ],
        answer: 0,
        explain: 'Declaring a later version than necessary is called over-declaring, and it can prevent an otherwise compatible runtime or tool from accepting the app.',
      },
      {
        type: 'multi',
        prompt: 'The team considers lowering the value. Which statements are correct?',
        options: [
          'The value is in the artifact, so a change means a new build and a new version number',
          'Lowering it disables any feature or bug fix enabled by default between the new value and the previous one',
          'Tests must be repeated, because MUnit runs against the version from `minMuleVersion` by default',
          'A Runtime Manager property can override `minMuleVersion` at deploy time',
        ],
        answer: [0, 1, 2],
        explain: '`minMuleVersion` is part of `mule-artifact.json` inside the JAR. Application properties do not change it.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm that Production still runs 2.7.4, and that nothing is half-deployed',
          'Compare the version in the error with the descriptor',
          'Decide the right value of `minMuleVersion` for what the app needs',
          'Build a new version with the corrected descriptor, and run the tests',
          'Deploy through Test to Production',
          'Add a pipeline check of `minMuleVersion` against each target runtime',
        ],
        explain: 'Protect the service, prove the cause, then release a properly tested version rather than hand-editing the JAR.',
      },
    ],
  },
  description: `
## Symptoms
- The release of \`shipment-eapi\` 2.8.0 to Production fails with a fatal error from the runtime.
- The same artifact deployed to Test two hours earlier and passed all checks.
- The release window closes at 22:00.

## Change / Context
- The change upgraded the SFTP Connector. While doing so, a developer regenerated the project in Studio, and \`minMuleVersion\` in \`mule-artifact.json\` moved from \`4.9.0\` to \`4.12.2\`.
- The Test server group was patched to Mule 4.12.2 last week. The Production cluster is at 4.12.1 and is patched next month.
- The pipeline deploys with \`armDeployment\`, and it uses the right \`muleVersion\` for each target.

## Logs
\`\`\`
18:09:12 INFO  [ci] Test: shipment-eapi 2.8.0 deployed to serverGroup test-grp (Mule 4.12.2)
20:00:04 INFO  [ci] Production: deploying shipment-eapi 2.8.0 to cluster prod-a (Mule 4.12.1)
20:01:27 ERROR [mule] Artifact shipment-eapi requires a newest runtime version.
                      Artifact required version is 4.12.2 and Mule Runtime version is 4.12.1
20:11:03 ERROR [ci] Deployment verification failed
\`\`\`

## Your tasks
1. What is the most likely root cause?
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
    'minMuleVersion declares the minimum runtime feature set that the app requires.',
    'The runtime compares the full major.minor.patch, and it rejects an artifact whose value is later than the target.',
    '4.12.2 does not deploy on 4.12.1, even though only the patch differs.',
    'Choose the earliest version whose feature set the app needs. Keep the patch at .0 unless you need a backported fix.',
    'A connector can raise the required version, and the error then reports the version the dependency needs.',
    'Lowering the value disables features and fixes enabled by default after that version, so test again.',
    'MUnit runs on the version from minMuleVersion by default, so a change affects tests.',
    'Exchange applies the same comparison when it extracts metadata as you publish.',
  ],
  solution: `
**Diagnosis.** The two environments differ by one patch, and the error names both numbers. The descriptor in the failing JAR says \`4.12.2\`. In the previous release, it said \`4.9.0\`. The connector is a fair suspect, because the docs say a dependency can require a later runtime. But the error then reports the version required by the dependency, and here the number is the one in the descriptor.

**Immediate mitigation.**
- Check that Production still runs 2.7.4 on all nodes.
- Do not edit the JAR by hand, and do not patch the Production cluster in a hurry to rescue one release. A runtime upgrade is a bigger change than this release.
- Decide whether the window can be met. A new build is short, but it needs testing. If it cannot, and 2.7.4 is still healthy, move the release.

**Root cause.** \`minMuleVersion\` is compared against the target using the full \`major.minor.patch\`, and if the artifact's value is later than the target, it is rejected. The docs use nearly this example: an application with \`minMuleVersion=4.12.2\` does not deploy on a \`4.12.1\` runtime, even though the two only differ in patch. The comparison is patch-sensitive by design, because raising the patch is how an application opts into a backported fix.

Be careful with one docs page. The prose on the Package a Mule Application page says the app can't be deployed to a runtime *later* than \`minMuleVersion\`, which is the wrong way round for a minimum. That page's own sample error and its two fixes say the opposite, and so does the Feature Flagging page, which states the rule directly: an artifact is rejected if its \`minMuleVersion\` is later than the target. The error in this incident fits that rule.

The value got there by accident. Studio and Anypoint Code Builder use this field when scaffolding, and the docs warn: do not set it to the exact patch of the runtime you built or scaffolded with. Test passed only because it had been patched first.

**Permanent fix.** Set \`minMuleVersion\` to the earliest version whose feature set the app needs. Here that is most likely the old \`4.9.0\`, because nothing in the change needed a later feature, unless the new connector requires later.

Understand what the value also does. It selects feature flags. So moving from \`4.9.0\` to \`4.12.2\` had also changed which fixes and behaviours were enabled by default, and the Test run validated that combination. Going back disables what was enabled between the two values, which is the reason for building 2.8.1 and testing it, rather than treating this as a text edit. MUnit also runs on the version from \`minMuleVersion\` by default, unless you set \`munit.runtimeversion\`.

**Prevention.**
- Treat \`mule-artifact.json\` as reviewed code, and flag any change to \`minMuleVersion\` in pull requests. A regenerated project should not change it silently.
- Add a pipeline step that reads the value from the built JAR and compares it with the runtime of every target on the path to Production, before the first deployment.
- Keep environments on the same patch, or patch Production first for a fix you depend on. The hybrid page asks for identical or compatible runtime versions across environments for promotion.
- Keep a list of each target's runtime. On a server managed by Runtime Manager you can read it from the instance details, and on a standalone server with \`./mule -version\` or the start-up log.
`,
  followUps: [
    { q: 'When would you raise the patch on purpose?', a: 'Rarely. The Feature Flags Reference lists fixes that became available at a patch release, and they are disabled by default. On an on-premises instance, the docs recommend opting in with a system property instead. They say to set a patch-level value only when the app depends on a specific backported fix, the target does not support a system-property override, and MuleSoft Support has directed you to. Every target must then have that patch.' },
    { q: 'Does this check apply only at deployment?', a: 'No. Tools that read an artifact without deploying it apply the same comparison, including Exchange when it extracts metadata as you publish. So over-declaring can cause rejection without any deployment.' },
    { q: 'What if the connector really does require 4.12.2?', a: 'Then either upgrade the target runtime or use a dependency version that is compatible with it. Check the required version in the error message.' },
    { q: 'Why not always deploy to a runtime later than Test?', a: 'A later runtime passes this check, but you are then running something you did not test. Keep the same patch across environments where you can.' },
  ],
}
