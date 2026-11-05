export default {
  id: 'inc-150',
  category: 'incidents',
  title: 'First Pipeline Redeploy to a Hybrid Server Clears the Properties, and the App Starts Happily Against QA',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'mule-maven-plugin', 'hybrid', 'properties', 'runtime-manager'],
  estMinutes: 30,
  investigation: {
    logs: [
      { text: '21:04:11 INFO  [ci] mule-maven-plugin 4.9.1 armDeployment: redeploying warehouse-sapi 2.7.0 to serverGroup prod-wh, environment Production', relevant: true, why: 'This is a redeploy through armDeployment, with a plugin earlier than the release that carries the fix.' },
      { text: '21:04:12 INFO  [ci] pom.xml: armDeployment has no properties element', relevant: true, why: 'The POM sends nothing, so this is not the CloudHub 2.0 rule about a partial properties element.' },
      { text: '21:05:02 INFO  [ci] Deployment verification: warehouse-sapi started', relevant: true, why: 'Verification proves only that the app started. It says nothing about which configuration it started with.' },
      { text: '21:05:03 INFO  [ci] Pipeline finished: SUCCESS', relevant: false },
      { text: '21:05:40 INFO  [app] warehouse-sapi: loading configuration-properties file qa.yaml', relevant: true, why: 'env is the Runtime Manager property that selected prod.yaml. Without it, the global-property default of qa applies.' },
      { text: '21:06:15 INFO  [app] warehouse-sapi: POST /pick-confirmations 201 (42 ms)', relevant: false },
      { text: '21:07:02 INFO  [ops] Runtime Manager: Settings > Properties for warehouse-sapi shows 0 properties (9 yesterday)', relevant: true, why: 'Direct evidence that the values held in Runtime Manager have gone.' },
      { text: '21:07:30 INFO  [agent] Server prod-wh-02 heartbeat OK', relevant: false },
      { text: '22:41:18 WARN  [wms] Pick confirmations for shift B missing from the warehouse database', relevant: true, why: 'The business symptom, 96 minutes later. Writes went to the QA schema, not to Production.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'The POM has no `properties` element. Why did the values in Runtime Manager disappear?',
        options: [
          'A plugin issue: redeploying to on-premises servers with `armDeployment` cleared properties configured in Runtime Manager. The fix makes the plugin send properties only when they are defined in the plugin configuration',
          'The CloudHub 2.0 rule applies: any `properties` element replaces all values',
          'The Connected App lacks permission to read properties',
          'A server group resets properties when an app is redeployed from the Console only',
        ],
        answer: 0,
        explain: 'This is issue W-24207441 in the release notes of plugin 4.10.2 and 4.10.3. The CloudHub 2.0 rule needs an element to be present, and here there is none.',
      },
      {
        type: 'single',
        prompt: 'Which plugin version should the team move to?',
        options: [
          '4.10.3 or later, because 4.10.2 has the same fix but is marked as deprecated in the release notes',
          '4.10.2, because it is the first release with the fix',
          '4.9.1, because it is the current version',
          '3.8.3, because it is the last 3.x release',
        ],
        answer: 0,
        explain: 'The fix is listed in both 4.10.2 and 4.10.3, and the 4.10.2 notes carry the title "(Deprecated)". 3.8.3 is on the list of deprecated plugin versions.',
      },
      {
        type: 'single',
        prompt: 'Why did the job stay green and the app keep serving requests?',
        options: [
          'Verification checks that the app is running. With `env` gone, the `global-property` default applied, so the app started normally with the QA file',
          'Verification was skipped by `skipDeploymentVerification`',
          'Runtime Manager restored the properties after the start',
          'The agent cached the old properties for the application',
        ],
        answer: 0,
        explain: 'Properties in Runtime Manager override application and global properties. Take them away, and the next value down the hierarchy is used, so a default that points to a real system becomes dangerous.',
      },
      {
        type: 'multi',
        prompt: 'Which actions belong in the permanent fix?',
        options: [
          'Upgrade the plugin in the parent POM to 4.10.3 or later',
          'Make the pipeline the single owner of properties, with `propertiesFile` and secrets from a secret store',
          'Remove any default that points to a real environment, so that a missing `env` fails at start-up',
          'Add a smoke test that proves which environment the app connects to',
          'Set `skipDeploymentVerification` to `true`, because verification gave false comfort',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Verification is still useful, and it is only incomplete. The fix is to add checks, not to take one away.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Stop further writes: stop the app, or route the traffic away',
          'Freeze the pipeline for all `armDeployment` apps',
          'Recover the 9 property values, including secrets from their owners',
          'Restore the values in Runtime Manager and restart the application',
          'Confirm that it loads `prod.yaml` and writes to Production',
          'Reconcile the records written to QA with the business',
          'Upgrade the plugin, and audit the other hybrid apps',
        ],
        explain: 'Stop the damage first, then stop it spreading to the next app. After changing properties on a hybrid app, you must restart it and any server group or cluster that hosts it.',
      },
    ],
  },
  description: `
## Symptoms
- 96 minutes after a routine release, the warehouse reports that pick confirmations for shift B are missing.
- \`warehouse-sapi\` is healthy: the job was green, requests return \`201\`, and no errors are logged.
- Runtime Manager shows no properties for the app. Yesterday it showed 9, including \`env\` and \`db.password\`.

## Change / Context
- The app runs on the server group \`prod-wh\`, on-premises and managed by Runtime Manager.
- Operations have always kept the properties in Runtime Manager.
- This was the first release through the new pipeline, which replaces manual deploys. It uses Mule Maven plugin 4.9.1 with \`armDeployment\`, and the POM has no \`properties\` element, so that the Runtime Manager values stay in charge.
- The app selects its configuration in this way:

\`\`\`xml
<global-property name="env" value="qa"/>
<configuration-properties file="$\{env}.yaml"/>
\`\`\`

- \`qa.yaml\` is bundled in the JAR, and QA and Production share a network zone.

## Logs
\`\`\`
21:04:11 INFO  [ci] armDeployment: redeploying warehouse-sapi 2.7.0 to serverGroup prod-wh
21:05:02 INFO  [ci] Deployment verification: warehouse-sapi started
21:05:40 INFO  [app] loading configuration-properties file qa.yaml
22:41:18 WARN  [wms] Pick confirmations for shift B missing
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
    'The release notes of plugin 4.10.2 and 4.10.3 list the fix: properties in Runtime Manager are no longer cleared on an armDeployment redeploy.',
    'After the fix, the plugin sends properties only when they are defined in the plugin configuration.',
    'Use 4.10.3 or later, because the notes mark 4.10.2 as deprecated.',
    'This is a different cause from the CloudHub 2.0 rule, which needs a properties or secureProperties element to be present.',
    'Deployment verification shows that the app started, not that it has the right configuration.',
    'Runtime Manager properties override application and global properties, so losing them activates the defaults.',
    'A default that points to a real environment turns a missing property into silent data damage.',
    'After a property change on a hybrid app, restart the app and any server group or cluster where it runs.',
  ],
  solution: `
**Diagnosis.** Nothing is failing technically, so follow the data. The app logs \`qa.yaml\`, which means \`env\` resolved to the \`global-property\` default. Runtime Manager shows no properties, so the value that used to select \`prod.yaml\` has gone. The only thing that changed is the deployment route. The POM has no \`properties\` element, so the CloudHub 2.0 rule about partial properties cannot explain it, and this is a hybrid target anyway. The next place to check is the release notes of the plugin.

**Immediate mitigation.**
- Stop the app, or take it out of the load balancer, so that no more records go to QA. Hybrid deployments have no platform load balancer, so this is your own one.
- Freeze the pipeline for every app with \`armDeployment\`. The next redeploy would do the same thing.
- Recover the 9 values from change records. \`db.password\` must come from its owner or the secret store.
- Restore them in Runtime Manager on the application **Settings** page. If you change properties after an application is deployed, you must restart the application and any server group or cluster where it is deployed.
- Confirm in the log that \`prod.yaml\` is loaded, and run one real request through to the database.
- Work with the warehouse team to move the records of the last 96 minutes from QA to Production.

**Root cause.** The release notes of Mule Maven plugin 4.10.2 and 4.10.3 list this fix, under W-24207441: "Application properties configured in Runtime Manager are no longer cleared when you redeploy an application to on-premises servers by using armDeployment." The plugin now sends properties only when they are defined in the plugin configuration. So on 4.9.1, leaving out the \`properties\` element did not protect the values. The notes do not say in which version the behaviour started, so treat any earlier version as suspect, and test it.

Two design choices turned a lost property into data damage. The hierarchy places deployment properties above application and global properties, so once the value had gone, the \`qa\` default took over with no error. And a QA file that can reach a real database was bundled in the production artifact.

**Permanent fix.**
- Upgrade the plugin in the parent POM to 4.10.3 or later. 4.10.2 has the fix too, but the notes mark it as deprecated.
- Choose one owner for properties. With a pipeline owner, use \`propertiesFile\`, which \`armDeployment\` accepts from plugin 4.9.0, in Java properties format, plus secrets injected at deploy time.
- Remove the dangerous default. A \`global-property\` that defaults to \`local\`, with a file that points nowhere real, makes a missing \`env\` fail at start-up or on the first call.
- Keep verification at its default, and add a smoke test that proves the environment, such as a read-only endpoint that reports the \`env\` and the database host name.

**Prevention.**
- Before you change the route for deploying to an environment, try a redeploy in a lower environment, and compare the property list before and after.
- Make the comparison a pipeline step: list the required keys, and fail if they are not present after deployment.
- Read the release notes when you pin a plugin version, and record why you chose that version.
- Keep the same rule in every environment, so that a difference shows up in Test first.
`,
  followUps: [
    { q: 'Is there a similar old issue on CloudHub 2.0?', a: 'Yes. The 4.2.0 notes say redeploys to CloudHub 2.0 no longer remove the properties when no properties are set in the POM. Since then, the documented rule there is: with neither element present, existing values are preserved.' },
    { q: 'Could a properties element in the POM have prevented this?', a: 'Sending the full set from the pipeline would have, because the values would be supplied on every deploy. Do not rely on sending only some of them: the armDeployment docs do not say what happens to the rest.' },
    { q: 'Why not bundle prod.yaml and drop Runtime Manager properties?', a: 'You can keep non-secret values in the artifact, selected by env, but then env itself still needs a safe source, and secrets must not be in the JAR in clear text.' },
    { q: 'Why did nothing alert for 96 minutes?', a: 'Every technical signal was healthy. Only a business measure, such as confirmations per shift, can see this, so add one for critical flows.' },
  ],
}
