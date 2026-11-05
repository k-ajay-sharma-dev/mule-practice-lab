export default {
  id: 'inc-155',
  category: 'incidents',
  title: 'One Call in Three Works: A Pipeline Shortcut Creates a Rogue App on a Server Group',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'deployment', 'maven', 'mule-maven-plugin', 'hybrid', 'runtime-manager', 'server-groups'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: '10:12:03 INFO  [ci] mule-maven-plugin: standaloneDeployment fx-rates-sapi 1.0.0, muleHome=/opt/mule (agent runs on app-prod-01)', relevant: true, why: 'A local deployment on one server, into a group that Runtime Manager manages.' },
      { text: '10:12:58 INFO  [mule] app-prod-01: Started app fx-rates-sapi', relevant: true, why: 'It really is running, on this server only.' },
      { text: '10:13:04 INFO  [ci] Pipeline finished: SUCCESS', relevant: false },
      { text: '10:21:17 INFO  [lb] GET /fx/rates -> app-prod-01 200 (31 ms)', relevant: true, why: 'Requests that reach the one server with the app succeed.' },
      { text: '10:21:17 WARN  [lb] GET /fx/rates -> app-prod-02 502 connection refused', relevant: true, why: 'The other members have no such app. The pattern follows the node, not the request.' },
      { text: '10:21:18 WARN  [lb] GET /fx/rates -> app-prod-03 502 connection refused', relevant: true, why: 'Same result on the third node, which accounts for two calls in three failing.' },
      { text: '10:24:40 INFO  [agent] Heartbeat OK: app-prod-02', relevant: false },
      { text: '10:30:12 INFO  [ops] Runtime Manager > Applications, Production: fx-rates-sapi not listed', relevant: true, why: 'Manually deployed applications are not auto-discovered, so the app cannot be seen or managed there.' },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why is the app on one server only, and missing from Runtime Manager?',
        options: [
          'It was added directly to the `apps` folder of one server in a server group, so it deployed only to that server, and it is a rogue app that Runtime Manager does not see',
          'Server groups roll out new apps one server per hour',
          '`standaloneDeployment` needs `targetType` set to `serverGroup`',
          'Runtime Manager hides apps that have not had traffic for an hour',
        ],
        answer: 0,
        explain: 'The Server Groups page describes this: the app deploys only to that specific server, is not visible in the server group view, and is not deployed to the other servers.',
      },
      {
        type: 'single',
        prompt: 'An engineer offers to copy the JAR to the other two servers. Is that a fix?',
        options: [
          'No. It adds two more unmanaged copies. A managed server must be deployed to through Runtime Manager',
          'Yes, because the server group then discovers the app',
          'Yes, if the JAR name is identical',
          'Yes, after a restart of the agent',
        ],
        answer: 0,
        explain: 'MuleSoft does not support manually deploying apps on servers managed by Runtime Manager. Three rogue copies are still invisible, and nothing monitors or updates them as one.',
      },
      {
        type: 'single',
        prompt: 'How should the rogue copy be removed from `app-prod-01`?',
        options: [
          'Delete the anchor file `$MULE_HOME/apps/fx-rates-sapi-anchor.txt`, and let Mule remove the app folder after the app terminates',
          'Delete the app folder while it is running',
          'Use `mule:undeploy` with `armDeployment`, because Runtime Manager knows the app',
          'Restart Mule, which removes unknown apps',
        ],
        answer: 0,
        explain: 'The docs recommend deleting only the anchor file. It avoids interference from the hot-deployment layer and JAR locking problems, and it allows a clean shutdown.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in the permanent fix?',
        options: [
          'Use `armDeployment` with `targetType` set to `serverGroup` for this environment',
          'Use a Connected App, so that the reason for the shortcut (no credentials on the agent) goes away',
          'Move the build agent off the Production server',
          'Add a post-deployment check that lists the app against the target through Runtime Manager',
          'Keep `standaloneDeployment`, and add a nightly `rsync` between servers',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Deploying through Runtime Manager places the app on all servers in the group as one target. Synchronising folders is still management outside Runtime Manager.',
      },
      {
        type: 'order',
        prompt: 'Order the response.',
        items: [
          'Find out which node serves the app, from the load balancer logs',
          'Check how the app got there, in the pipeline definition',
          'Prepare `armDeployment` with the group as the target',
          'Remove the rogue copy with the anchor file',
          'Deploy to the server group through Runtime Manager',
          'Confirm the app on all three servers, and in Runtime Manager',
          'Scan the other servers for apps that Runtime Manager does not know',
        ],
        explain: 'The rogue copy goes first, so that it does not compete with the managed deployment on `app-prod-01`.',
      },
    ],
  },
  description: `
## Symptoms
- A new API, \`fx-rates-sapi\`, was released this morning. Callers report that it works about one time in three, and otherwise fails with \`502\` from the load balancer.
- The pipeline is green.
- Operations cannot find the app in Runtime Manager, and no monitoring or alert exists for it.

## Change / Context
- Production is the server group \`prod-grp\`, with \`app-prod-01\`, \`app-prod-02\` and \`app-prod-03\`, behind the company's own load balancer in round robin.
- All other apps were deployed from the Runtime Manager console by the operations team.
- The new team wanted automation, and had no Anypoint credentials for the pipeline. A Jenkins agent already runs on \`app-prod-01\`, so they used:

\`\`\`xml
<standaloneDeployment>
  <applicationName>fx-rates-sapi</applicationName>
  <muleHome>/opt/mule</muleHome>
  <muleVersion>$\{app.runtime}</muleVersion>
</standaloneDeployment>
\`\`\`

## Logs
\`\`\`
10:12:03 INFO  [ci] standaloneDeployment fx-rates-sapi 1.0.0, muleHome=/opt/mule
10:21:17 INFO  [lb] GET /fx/rates -> app-prod-01 200
10:21:17 WARN  [lb] GET /fx/rates -> app-prod-02 502 connection refused
10:30:12 INFO  [ops] Runtime Manager > Applications: fx-rates-sapi not listed
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
    'A server group is a single deployment target through Runtime Manager, not through the file system.',
    'Adding a JAR to the apps folder of one server deploys it to that server only, as a rogue API.',
    'It is not visible in the server group view, and it is not deployed to the others.',
    'When you use Runtime Manager to manage a server, you cannot use other deployment and management methods.',
    'standaloneDeployment suits an unmanaged local instance. armDeployment with serverGroup suits this target.',
    'Undeploy a manual app by deleting its anchor file.',
    'Green means the plugin finished its job on the target it was given, so check the right target.',
    'Hybrid deployments have no platform load balancing, so the load balancer here is your own.',
  ],
  solution: `
**Diagnosis.** The failure follows the node. Every call that reaches \`app-prod-01\` works, and the others fail with \`502\`, because nothing listens on that port there. So the app exists on one of three servers. It is also missing from Runtime Manager, so it did not arrive through Runtime Manager. The pipeline definition shows why.

**Immediate mitigation.**
- Take \`app-prod-02\` and \`app-prod-03\` out of rotation for \`/fx/\` on the load balancer, if your load balancer can route by path. That makes all calls reach the one working copy while you fix this. Otherwise tell the consumers.
- Prepare the correct deployment, and then remove the rogue copy by deleting \`$MULE_HOME/apps/fx-rates-sapi-anchor.txt\`. Mule removes the app folder after the app terminates. Do not delete the folder directly.
- Deploy through Runtime Manager to \`prod-grp\`, and put all servers back in rotation.
- Do not copy the JAR to the other two servers. That gives three unmanaged copies.

**Root cause.** The docs describe this result. If you manually add a \`.jar\` file to a server's \`apps\` folder, the application deploys only to that specific server, and becomes a rogue API that is not visible in the Runtime Manager server group view and is not deployed to other servers in the group. \`standaloneDeployment\` has that effect, because it works with the local \`muleHome\`. The wider rule is on the deployment pages: when you use Runtime Manager to manage a server, you cannot use other deployment and management methods or tools to manage it. The plugin did what it was told, so the job was green.

**Permanent fix.**

\`\`\`xml
<armDeployment>
  <applicationName>fx-rates-sapi</applicationName>
  <muleVersion>$\{app.runtime}</muleVersion>
  <target>prod-grp</target>
  <targetType>serverGroup</targetType>
  <environment>Production</environment>
  <connectedAppClientId>$\{anypoint.clientId}</connectedAppClientId>
  <connectedAppClientSecret>$\{anypoint.clientSecret}</connectedAppClientSecret>
  <connectedAppGrantType>client_credentials</connectedAppGrantType>
</armDeployment>
\`\`\`

- Give the pipeline its own Connected App. The missing credential was the reason for the shortcut.
- Move the Jenkins agent off the Production server. A build tool on a Production host is a security and capacity problem, whatever the deployment method.
- Add the new app to monitoring and alerts, which Runtime Manager can now support.

**Prevention.**
- Publish a rule, and enforce it in the shared pipeline: for an environment managed by Runtime Manager, only \`armDeployment\`, the CLI or the API are allowed. A pipeline check can reject \`standaloneDeployment\` in a Production profile.
- After a deployment, check the result through Runtime Manager, for example with \`runtime-mgr:standalone-application:describe\`. Also call the app through the load balancer several times, so that a partial deployment shows up.
- Run a regular audit: compare the \`apps\` folder of each server with the list from Runtime Manager.
`,
  followUps: [
    { q: 'What happens if someone deletes an app folder on a server in a group?', a: 'The docs say the API is deleted, but because it was not removed from the server group, it redeploys when you restart the server.' },
    { q: 'What if a server in the group is down during a deployment?', a: 'The group page covers server status. A server in Unknown status blocks further updates, such as from version 2 to version 3, until it is removed from the group or reconnected.' },
    { q: 'Is standaloneDeployment ever right in a pipeline?', a: 'Yes, for a Mule instance on the build machine that nothing else manages, such as a smoke test instance.' },
    { q: 'How do you remove an app from all servers in the group?', a: 'Delete it from the server group in Runtime Manager, which removes it from all servers in the group.' },
  ],
}
