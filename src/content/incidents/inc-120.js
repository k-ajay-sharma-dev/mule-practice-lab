export default {
  id: 'inc-120',
  category: 'incidents',
  title: 'Redeploy Wipes Runtime Manager Properties After One Line Was Added to the POM',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'deployment', 'maven', 'cloudhub-2', 'properties', 'mule-maven-plugin'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '10:02:11 INFO  [ci] Commit 4be9d1 "feat: wire autodiscovery, add api.id to deployment" (pom.xml, global.xml)', relevant: true, why: 'This commit added a properties element to the deployment configuration for the first time.' },
      { text: '10:03:40 INFO  [ci] Tests: 112 - Failed: 0 - Errors: 0 - Skipped: 0', relevant: false },
      { text: '10:04:02 INFO  [ci] Downloading from anypoint-exchange-v3: mule-plugin dependencies', relevant: false },
      { text: '10:05:18 INFO  [ci] mule-maven-plugin:deploy: deploying billing-papi 3.6.0 to Production (CloudHub 2.0), properties: api.id', relevant: true, why: 'The deployment sends one property. Every other property lived only in Runtime Manager.' },
      { text: '10:06:55 ERROR [app] billing-papi-7c9f: Couldn\'t find configuration property value for key $\{db.host}', relevant: true, why: 'A value that was set in Runtime Manager is no longer present when the app starts.' },
      { text: '10:06:55 ERROR [app] billing-papi-7c9f: Application failed to start', relevant: true, why: 'The failure is at start-up, from configuration. No request reached the new code.' },
      { text: '10:07:10 INFO  [app] billing-papi-58d2: GET /health 200 (previous replica still serving)', relevant: false },
      { text: '10:16:20 ERROR [ci] Deployment verification failed: billing-papi did not reach a running state', relevant: true, why: 'Verification did its job. The job failed instead of reporting a false success.' },
      { text: '10:17:02 INFO  [ci] Teams notification sent to #billing-integration', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'All tests passed and the code is sound. Why can the app not find `db.host`?',
        options: [
          'Once `properties` is present in the POM, CloudHub 2.0 deploys with only the POM values and removes those set in Runtime Manager, with no merge',
          'The `global.xml` change broke the configuration properties file',
          'The Connected App has no permission to read application properties',
          'Secure properties expire when a new version is deployed',
        ],
        answer: 0,
        explain: 'If neither `properties` nor `secureProperties` is configured, CloudHub 2.0 preserves existing values. If either one is present, it does not merge, and values not in the deployment configuration are removed.',
      },
      {
        type: 'single',
        prompt: 'The release manager suggests rolling back by running the same job with version 3.5.2. Will that restore the service?',
        options: [
          'Not on its own: if the POM still has `properties`, the redeploy still sends only `api.id`, so the full set of values must be restored',
          'Yes: an older version brings back the properties it was deployed with',
          'Yes: CloudHub 2.0 keeps a property snapshot for each version',
          'No: older versions cannot be redeployed',
        ],
        answer: 0,
        explain: 'The properties are not part of the JAR. This is about the deployment configuration, so a change of version alone does not put the removed values back.',
      },
      {
        type: 'multi',
        prompt: 'Which permanent fixes follow the documented behaviour?',
        options: [
          'Send the full set of properties and secure properties on every deployment',
          'Keep non-secret values in a `propertiesFile` for each environment, reviewed in Git',
          'Inject secrets into `secureProperties` from the CI secret store',
          'Omit both elements and pass `api.id` another way, if Runtime Manager is to stay the owner',
          'Add only the changed property to `properties` on each release',
        ],
        answer: [0, 1, 2, 3],
        explain: 'The docs offer two options: omit both elements, or send the full set. Sending only the changed property is what caused this incident.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Confirm that the old replicas are still serving and that only the new version failed',
          'Compare the expected property list with what the failed deployment sent',
          'Recover the missing values from their source, including secrets from the owners',
          'Redeploy with the complete set of properties and secure properties',
          'Choose one owner for properties and change the pipeline to match',
          'Audit other applications for a partial properties element',
        ],
        explain: 'Protect the live service, find exactly what is missing, restore it, then remove the split ownership that made this possible.',
      },
    ],
  },
  description: `
## Symptoms
- The Production deployment of \`billing-papi\` 3.6.0 on CloudHub 2.0 fails at 10:16. The new replica does not start.
- Runtime Manager now shows one application property, \`api.id\`. Yesterday it showed 14, including 5 secure ones.
- The Test deployment passed last week, but Test uses an embedded test database and needs no extra properties.

## Change / Context
- Until now, the pipeline sent no properties at all. Operations maintained them by hand in Runtime Manager, and each redeploy kept them.
- To enable API autodiscovery, a developer added this to the POM:

\`\`\`xml
<cloudhub2Deployment>
  ...
  <properties>
    <api.id>$\{api.id}</api.id>
  </properties>
</cloudhub2Deployment>
\`\`\`

## Logs
\`\`\`
10:05:18 INFO  [ci] deploying billing-papi 3.6.0 to Production, properties: api.id
10:06:55 ERROR [app] Couldn't find configuration property value for key $\{db.host}
10:06:55 ERROR [app] Application failed to start
10:16:20 ERROR [ci] Deployment verification failed
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
    'With neither properties nor secureProperties in the POM, CloudHub 2.0 preserves the existing values on redeploy.',
    'If either element is present, CloudHub 2.0 uses only the POM values. It does not merge, and anything not included is removed.',
    'This covers secure properties too: a properties element alone can remove them.',
    'Rolling back the JAR does not restore properties, because they are not in the JAR.',
    'To keep existing values, omit both elements, or send the full set on every redeploy.',
    'Pick one owner for properties. Mixing hand edits in Runtime Manager with pipeline values leads to this failure.',
    'runtime-mgr:application:modify behaves in a similar way: --property replaces all existing properties.',
  ],
  solution: `
**Diagnosis.** The tests passed, and the failure is a missing configuration value at start-up, not a code fault. The property list in Runtime Manager has shrunk to the one value in the new POM block, and that block is the only deployment change. So look at how the deployment treats properties. Test passed because it does not need those values.

**Immediate mitigation.**
- Confirm that the old version is still handling traffic, since \`updateStrategy\` defaults to \`rolling\`, and tell the billing team what is happening.
- Recover the 14 values. The non-secret ones may be in change records. Plan to get secure values from their owners or the secret store, because they were removed from the app.
- Redeploy with the complete set in \`properties\` and \`secureProperties\`. Changing only the version to 3.5.2 would not help, because the same block would be sent.

**Root cause.** This is documented behaviour. If neither element is configured, CloudHub 2.0 preserves the properties in the environment. If either element is present, it deploys with only the properties and secure properties in the POM, it does not merge with values configured in Runtime Manager, and any existing property not included is removed. Adding \`api.id\` moved the app from the first case to the second without anyone noticing.

**Permanent fix.** Make the pipeline the single owner:
\`\`\`xml
<cloudhub2Deployment>
  ...
  <propertiesFile>$\{deploy.propertiesFile}</propertiesFile>
  <secureProperties>
    <db.password>$\{db.password}</db.password>
    <mule.key>$\{mule.key}</mule.key>
  </secureProperties>
</cloudhub2Deployment>
\`\`\`
Non-secret values live in one Java properties file per environment, one \`key=value\` pair per line, and the pipeline adds \`api.id\`. Secrets come from the CI secret store. The replace note names only \`properties\` and \`secureProperties\`, so confirm in a sandbox how \`propertiesFile\` values are treated. The other documented option is to omit both elements and keep Runtime Manager as the owner, which means setting \`api.id\` there too.

**Prevention.**
- Write the rule down: an application is either pipeline-owned or Runtime Manager-owned for properties, never both.
- Add a pipeline check that compares the keys to be sent with a required list for the app, and fails before the deployment.
- Make Test need the same keys as Production, so that a missing key fails earlier.
- Audit other applications for \`properties\` blocks with only a few entries.
- Keep \`skipDeploymentVerification\` at its default of \`false\`: verification is why this failed visibly.
`,
  followUps: [
    { q: 'Does the same thing happen on Runtime Fabric?', a: 'The sentence about replacing properties is on the CloudHub 2.0 page. The Runtime Fabric page describes the same elements without that note, so test the behaviour in a sandbox before relying on it.' },
    { q: 'Is a hand edit in Runtime Manager safe once the pipeline owns the properties?', a: 'No. The next deployment sends only what the POM defines, so the edit disappears. Make the change in the source of the pipeline values.' },
    { q: 'What is the difference between properties and secureProperties?', a: 'secureProperties tells CloudHub 2.0 to encrypt the values before storing them. Both are subject to the same redeploy rule.' },
  ],
}
