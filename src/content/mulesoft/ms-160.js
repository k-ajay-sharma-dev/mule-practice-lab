export default {
  id: 'ms-160',
  category: 'mulesoft',
  title: 'Deploying to Your Own Servers From Maven: armDeployment, agentDeployment and standaloneDeployment',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'mule-maven-plugin', 'hybrid', 'on-premises', 'runtime-manager'],
  estMinutes: 30,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each target to the deployment element of the Mule Maven plugin.',
      pairs: [
        ['A Production cluster registered in Runtime Manager', '`armDeployment`'],
        ['A Mule instance installed on the machine that runs Maven', '`standaloneDeployment`'],
        ['A remote Mule instance reached through the local API of its agent, with all instances in one address space', '`agentDeployment`'],
      ],
      explain: '`armDeployment` goes through the Runtime Manager REST API. `agentDeployment` calls the API that the Runtime Manager agent exposes. `standaloneDeployment` works with a local `muleHome`.',
    },
    {
      type: 'multi',
      prompt: 'Which parameters does the Runtime Manager REST API reference table mark as required for `armDeployment`?',
      options: [
        '`applicationName`',
        '`muleVersion`',
        '`target`',
        '`targetType`',
        '`environment`',
        '`uri`',
        '`deploymentTimeout`',
      ],
      answer: [0, 1, 2, 3, 4],
      explain: '`uri` defaults to `https://anypoint.mulesoft.com`, and you set it for a Private Cloud Edition installation. `deploymentTimeout` defaults to `600000` milliseconds.',
    },
    {
      type: 'single',
      prompt: 'The Production target is a cluster called `prod-cluster-a`. What does the plugin need?',
      options: [
        '`target` set to `prod-cluster-a` and `targetType` set to `cluster`',
        '`target` set to `cluster` and `targetType` set to `prod-cluster-a`',
        '`target` only, because Runtime Manager works out the type from the name',
        '`serverGroup` set to `prod-cluster-a`',
      ],
      answer: 0,
      explain: 'The valid `targetType` values are `server`, `serverGroup` and `cluster`, and the parameter is required. The target itself must already exist in Runtime Manager.',
    },
    {
      type: 'single',
      prompt: 'The POM says `muleVersion` 4.9.6, and the servers run 4.9.4. What does the page say happens?',
      options: [
        'The plugin raises an exception, and it does not download a Mule runtime',
        'The plugin downloads 4.9.6 to the servers and continues',
        'The plugin deploys and logs a warning',
        'Runtime Manager upgrades the target to match the POM',
      ],
      answer: 0,
      explain: 'The reference says that if the value does not match the Mule version running in the target, the plugin raises an exception. It also says the plugin does not download a runtime when the values differ. In a hybrid pipeline this makes the server upgrade and the POM change one coordinated step.',
    },
    {
      type: 'single',
      prompt: 'The operations team manages the Test servers from Runtime Manager. A developer proposes `standaloneDeployment` on one of them, because it needs no Anypoint credentials. What do the docs say?',
      options: [
        'When you use Runtime Manager to manage a server, you cannot use other deployment and management methods or tools to manage it',
        'It works, and Runtime Manager discovers the application on its next poll',
        'It works, provided that `muleVersion` matches',
        'It is the recommended option for Test environments',
      ],
      answer: 0,
      explain: 'MuleSoft does not support manually deploying apps on servers managed by Runtime Manager, and such apps are not auto-discovered, so you cannot see or manage them there.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about the on-premises strategies are correct?',
      options: [
        'The plugin supports deploying domains only with the standalone or the Runtime Manager agent strategy',
        '`armInsecure` skips the security validations and is aimed at TLS errors with a Private Cloud Edition installation',
        'The docs warn that enabling an insecure connection is a dangerous practice',
        'The agent strategy works only if all Mule instances reside in one address space',
        '`armDeployment` needs the application to be published in Exchange first, as CloudHub 2.0 does',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The prerequisite the page lists for the REST API strategy is a server, server group or cluster created in Runtime Manager. Publication in Exchange is listed on the CloudHub 2.0 and Runtime Fabric pages.',
    },
    {
      type: 'single',
      prompt: 'A pipeline uses `standaloneDeployment` for an integration test box. Which setting is NOT in the standalone reference table?',
      options: [
        '`skipDeploymentVerification`',
        '`muleHome`',
        '`deploymentTimeout`',
        '`skip`',
      ],
      answer: 0,
      explain: 'The standalone table has `applicationName`, `muleVersion`, `muleHome`, `deploymentTimeout` and `skip`. Skipping status verification is described for the platform deployments: CloudHub, Runtime Manager and Runtime Fabric.',
    },
  ],
  description: `
A logistics company must keep its Mule runtimes in its own data centres. Today a release engineer copies JAR files by hand. The integration lead asks for a Maven based pipeline that covers these targets:

| Target | What it is | Managed from |
|---|---|---|
| \`ci-box\` | One Mule instance on the Jenkins agent, for smoke tests | Nothing, it is a local install |
| \`test-group\` | Server group of 3 servers | Runtime Manager |
| \`prod-cluster-a\` | Cluster of 4 servers | Runtime Manager |
| \`dmz-01\` | Isolated Mule instance, not linked to Anypoint Platform, with the agent exposing its local API | Nothing |

The first draft of the shared profile looks like this:

\`\`\`xml
<configuration>
  <armDeployment>
    <muleVersion>$\{app.runtime}</muleVersion>
    <target>$\{deploy.target}</target>
    <username>$\{anypoint.user}</username>
    <password>$\{anypoint.password}</password>
    <environment>$\{deploy.env}</environment>
    <armInsecure>true</armInsecure>
    <properties>
      <env>$\{deploy.env}</env>
    </properties>
  </armDeployment>
</configuration>
\`\`\`

**Questions**
1. Which deployment element suits each target, and why?
2. What is missing or wrong in the draft?
3. What does \`muleVersion\` mean here, compared with CloudHub 2.0?
4. Which rule limits how \`test-group\` and \`prod-cluster-a\` can be deployed to?
5. What must the pipeline know about parallel starts, undeployment and updates on a standalone instance?
`,
  answerTemplate: `## Strategy for each target

## Problems in the draft

## muleVersion

## Rule for managed servers

## Standalone operations
`,
  keyPoints: [
    'Three on-premises strategies: standaloneDeployment (local muleHome), armDeployment (Runtime Manager REST API) and agentDeployment (agent local API).',
    'armDeployment needs a target created in Runtime Manager first, and targetType must be server, serverGroup or cluster.',
    'Required for armDeployment: applicationName, muleVersion, target, targetType, environment.',
    'muleVersion must match the target. The plugin raises an exception and downloads nothing if it does not.',
    'A server managed by Runtime Manager must not be managed by any other method. Manually deployed apps are not auto-discovered.',
    'armInsecure is for TLS errors against Private Cloud Edition, and the docs call it a dangerous practice.',
    'Domains deploy only through the standalone or agent strategies.',
    'Parallel deployment is fixed at 20 and gives no start order. Undeploy by deleting the anchor file.',
  ],
  solution: `
**Strategy for each target.**
- \`ci-box\`: \`standaloneDeployment\`. It deploys to a Mule instance on the machine that runs Maven, using \`muleHome\` and \`muleVersion\`, with no platform credentials.
- \`test-group\`: \`armDeployment\` with \`targetType\` \`serverGroup\`.
- \`prod-cluster-a\`: \`armDeployment\` with \`targetType\` \`cluster\`.
- \`dmz-01\`: \`agentDeployment\` with the \`uri\` of the agent. The docs say this strategy works only if all your Mule instances reside in one address space, so check that the build agent and the instance qualify before you commit to it.

All of them run with \`mvn clean deploy -DmuleDeploy\`, and \`mvn mule:deploy -Dmule.artifact=...\` deploys an existing JAR. The docs say that property is valid for CloudHub, standalone and on-premises deployments, which suits a build-once pipeline.

**Problems in the draft.**
- \`applicationName\` is missing, and it is required.
- \`targetType\` is missing, and it is required.
- \`username\` and \`password\` belong to a person. Use a Connected App, with \`connectedAppClientId\`, \`connectedAppClientSecret\` and \`connectedAppGrantType\` set to \`client_credentials\`, or a \`server\` entry in \`settings.xml\`. If you use \`server\`, do not also set \`username\` and \`password\`, because they overwrite it.
- \`armInsecure\` should go. It exists for TLS errors when the Runtime Manager is on a Private Cloud Edition installation whose certificates are not in the truststore. The docs warn against it unless you know what you are doing and the installation is isolated in a local network. This company uses the cloud control plane, so it has no reason to be there.
- If the deployment target sits in a business group and the identity cannot see the parent, add \`businessGroupId\`.

\`\`\`xml
<armDeployment>
  <applicationName>$\{deploy.appName}</applicationName>
  <muleVersion>$\{app.runtime}</muleVersion>
  <target>$\{deploy.target}</target>
  <targetType>$\{deploy.targetType}</targetType>
  <environment>$\{deploy.env}</environment>
  <connectedAppClientId>$\{anypoint.clientId}</connectedAppClientId>
  <connectedAppClientSecret>$\{anypoint.clientSecret}</connectedAppClientSecret>
  <connectedAppGrantType>client_credentials</connectedAppGrantType>
  <deploymentTimeout>900000</deploymentTimeout>
</armDeployment>
\`\`\`

**muleVersion.** On CloudHub 2.0 this value selects the runtime the platform runs for you, and it is optional. On your own servers the runtime is already installed. The value is required, and if it does not match the target the plugin raises an exception. It never downloads a runtime. So upgrading the servers and changing the POM value belong in the same change, and a server group must stay on one version: all its servers must run the same Mule runtime, Runtime Manager agent and Java versions.

**Rule for managed servers.** When you use Runtime Manager to manage a server, you cannot use other deployment and management methods or tools to manage it. So the shortcut of \`standaloneDeployment\` on a \`test-group\` server is not an option, and neither is copying a JAR into \`apps\`. Deployment goes through Runtime Manager: the plugin's \`armDeployment\`, the REST API, the CLI or the console.

**Standalone operations.** These apply to \`ci-box\` and \`dmz-01\`.
- Starting Mule with \`-M-Dmule.deployment.parallel\` deploys all apps in \`/apps\` in parallel. Parallelism is fixed at 20, and a start order cannot be guaranteed, so the apps must not depend on each other.
- To undeploy, delete the app's anchor file, such as \`$MULE_HOME/apps/stockTrader-anchor.txt\`, and not the folder. This avoids interference from the hot-deployment layer and JAR locking issues. On Windows, log files are released only after a 15 second timeout.
- A new JAR in \`$MULE_HOME/apps\` is detected as an update, and Mule performs a clean redeployment. Any changes made in the old application folder are discarded.
`,
  followUps: [
    { q: 'Does the plugin wait for the app to start with armDeployment?', a: 'Yes, unless skipDeploymentVerification is true, which is listed for armDeployment. deploymentTimeout, default 600000 milliseconds, is the time allowed between the start of the deployment and the confirmation.' },
    { q: 'How do you pass properties with armDeployment?', a: 'With the properties element or a propertiesFile in Java properties format. Check the plugin version first: the 4.10.2 and 4.10.3 notes record a fix for properties set in Runtime Manager being cleared on an armDeployment redeploy.' },
    { q: 'Is a deployment size limit relevant here?', a: 'The tested recommended limit for CloudHub and standalone is 200 MB per deployment, with 200 deployments per hybrid target and 300 properties per application.' },
    { q: 'Does a target have to be in a particular state?', a: 'Yes. The hybrid deployment page says a target must be in the Running status to accept deployments.' },
    { q: 'Can you avoid the plugin and call the API?', a: 'Yes. The Continuous Deployment page describes a workflow on the Access Management and Runtime Manager APIs: find the target ID, look for an existing application ID, then POST for a first deployment or PATCH to redeploy. The page says the Mule Maven plugin provides the same capabilities.' },
  ],
}
