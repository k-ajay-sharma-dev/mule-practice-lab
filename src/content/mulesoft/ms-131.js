export default {
  id: 'ms-131',
  category: 'mulesoft',
  title: 'One App, Two Targets: cloudhub2Deployment and runtimeFabricDeployment Side by Side',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'mule-maven-plugin', 'cloudhub-2', 'runtime-fabric'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'What value does `provider` take in both `cloudhub2Deployment` and `runtimeFabricDeployment`?',
      options: [
        '`MC`, the MuleSoft Control Plane, meaning the deployment is managed through Runtime Manager',
        '`CH2` for CloudHub 2.0 and `RTF` for Runtime Fabric',
        '`AWS` or `K8S`, depending on where the target runs',
        'It is optional and comes from `target`',
      ],
      answer: 0,
      explain: 'Both reference tables mark `provider` as required, with the value `MC`. The `target` element is what names the shared space, private space or Runtime Fabric.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each need to the element that handles it.',
      pairs: [
        ['Size a CloudHub 2.0 replica (non-UBP organization)', '`vCores`'],
        ['Size a Runtime Fabric replica', '`deploymentSettings` then `resources` with `cpu` and `memory`'],
        ['Use Object Store v2 on CloudHub 2.0', '`integrations` then `services` then `objectStoreV2`'],
        ['Use a persistent object store on Runtime Fabric', '`persistentObjectStore` in `deploymentSettings`'],
        ['Pass JVM arguments on Runtime Fabric', '`jvm` then `args` in `deploymentSettings`'],
      ],
      explain: 'The two blocks look alike at the top and differ in `deploymentSettings`, so one shared template does not fit both targets.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The Runtime Fabric block has no `resources` element. What does the reference table say each replica gets?',
      options: [
        '0.5 vCores reserved and 700 MB of memory reserved',
        '1 vCore and 1 GB',
        '0.1 vCores and 1 GB',
        'Nothing: `resources` is mandatory, so the deployment is rejected',
      ],
      answer: 0,
      explain: 'The defaults are 0.5 vCores for `cpu` `reserved` and 700 MB for `memory` `reserved`. If a `limit` is set, it must be equal to or higher than the reserved value.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'A team sets `<muleVersion>4.6.0</muleVersion>` and nothing else about the runtime. Which statements match the reference table?',
      options: [
        '`4.6.0` selects the last build, defaulting to the Edge channel and Java 8',
        '`releaseChannel` accepts `NONE`, `EDGE` and `LTS`',
        '`javaVersion` accepts `8` and `17`',
        'A full name such as `4.6.0:1e-java17` selects a different channel or Java version',
        'If the selected release channel does not exist, the plugin falls back to `EDGE`',
      ],
      answer: [0, 1, 2, 3],
      explain: 'If the selected channel or Java version does not exist, an error occurs, so there is no fallback. Plugin versions 3.8.0 and 4.0.0 cannot specify these in `muleVersion`, and the docs ask for 4.1.1 or later.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A CloudHub 2.0 app has 4 replicas in a private space and `updateStrategy` is not set. Which behaviour applies on redeploy?',
      options: [
        '`rolling`: replicas update incrementally, and this needs one additional replica\'s worth of resources',
        '`recreate`: replicas terminate first, and no extra resources are needed',
        '`rolling`: it needs double the resources for the duration of the update',
        'The strategy is chosen by the platform from the load at that moment',
      ],
      answer: 0,
      explain: 'The default is `rolling`, which maintains availability. `recreate` is quicker and needs no additional resources, but it terminates replicas before redeployment.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'A team enables `enforceDeployingReplicasAcrossNodes`. Which limits follow, with N nodes?',
      options: [
        'With `rolling`, the maximum number of replicas is N minus 1',
        'With `recreate`, the maximum number of replicas is N',
        'With `rolling`, the maximum number of replicas is N plus 1',
        'With `recreate`, the maximum number of replicas is 2N',
      ],
      answer: [0, 1],
      explain: 'Both limits are in the `updateStrategy` row of the table. `rolling` needs room for one extra replica on a separate node during the update.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'A business group user has access to one business group but not to the parent organization. How should the deployment identify it?',
      options: [
        '`businessGroupId`, which the docs call mandatory in this case',
        '`businessGroup` with only the last part of the path',
        'Leave both out, because it defaults to the group the user can see',
        '`environment`, using the business group name',
      ],
      answer: 0,
      explain: 'Without either value, the deployment defaults to the main business group of the user. When `businessGroupId` is set, `businessGroup` is omitted.',
    },
  ],
  description: `
An insurer is moving 25 applications from a data centre. Customer-facing APIs go to **CloudHub 2.0** private spaces, and 9 claims applications that must stay near an on-premises document system go to **Runtime Fabric**. The platform team wants one parent POM and one pipeline template.

A developer copied a CloudHub 2.0 block and changed only the top-level element name:

\`\`\`xml
<runtimeFabricDeployment>
  <provider>MC</provider>
  <environment>$\{deploy.env}</environment>
  <target>$\{deploy.target}</target>
  <applicationName>claims-docs-sapi</applicationName>
  <replicas>2</replicas>
  <vCores>0.5</vCores>
  <integrations>
    <services>
      <objectStoreV2><enabled>true</enabled></objectStoreV2>
    </services>
  </integrations>
</runtimeFabricDeployment>
\`\`\`

Constraints:
- The claims apps need 1 vCPU burst, 1.5 GB of memory and a fixed JVM metaspace limit.
- During business hours redeployments must not cause downtime, and a private space or fabric has limited spare capacity.
- The pipeline identity only has access to the Claims business group, not to the parent organization.
- Production must be on an LTS channel with Java 17.

**Questions**
1. What must every deployment block contain, and what does \`provider\` mean?
2. Rewrite the block above for Runtime Fabric.
3. How do you choose the runtime version, channel and Java version?
4. Which update strategy do you use, and what capacity must you plan for?
5. How do you structure the parent POM so that both targets stay simple?
`,
  answerTemplate: `## Required elements

## Runtime Fabric block

## Runtime version, channel and Java

## Update strategy and capacity

## Parent POM structure
`,
  keyPoints: [
    'Required in both: top-level element, applicationName, target, provider (MC) and environment. replicas is required when autoscaling is false.',
    'environment must match an environment configured in Anypoint Platform.',
    'CloudHub 2.0 uses vCores (or instanceType for UBP organizations). Runtime Fabric uses resources with cpu and memory, each with reserved and limit.',
    'Runtime Fabric defaults: 0.5 vCores and 700 MB reserved. The maximum is 16 replicas per application.',
    'Object Store v2 is an integrations service on CloudHub 2.0. Runtime Fabric has persistentObjectStore in deploymentSettings.',
    'releaseChannel defaults to EDGE and javaVersion to 8. A channel or Java version that does not exist causes an error.',
    'rolling is the default and needs one extra replica of resources. recreate is quicker but terminates replicas first.',
    'businessGroupId is mandatory when you have access only to a specific business group.',
  ],
  solution: `
**Required elements.** Both blocks need \`applicationName\`, \`target\`, \`provider\` and \`environment\`. \`provider\` is \`MC\`, which means the deployment is managed through Runtime Manager. \`target\` is the name of the shared space, private space or fabric. \`replicas\` is required when autoscaling is \`false\`. On CloudHub 2.0, \`vCores\` is required unless \`instanceType\` is configured, and \`instanceType\` is for organizations on usage-based pricing.

**Runtime Fabric block.** Remove \`vCores\` and \`integrations\`, which come from the CloudHub 2.0 reference, and use the Runtime Fabric elements:

\`\`\`xml
<runtimeFabricDeployment>
  <provider>MC</provider>
  <environment>$\{deploy.env}</environment>
  <target>$\{deploy.target}</target>
  <businessGroupId>$\{deploy.businessGroupId}</businessGroupId>
  <applicationName>claims-docs-sapi</applicationName>
  <muleVersion>$\{deploy.muleVersion}</muleVersion>
  <releaseChannel>LTS</releaseChannel>
  <javaVersion>17</javaVersion>
  <replicas>2</replicas>
  <deploymentSettings>
    <updateStrategy>rolling</updateStrategy>
    <persistentObjectStore>true</persistentObjectStore>
    <resources>
      <cpu>
        <reserved>500m</reserved>
        <limit>1000m</limit>
      </cpu>
      <memory>
        <reserved>1500Mi</reserved>
      </memory>
    </resources>
    <jvm>
      <args>-XX:MaxMetaspaceSize=500m</args>
    </jvm>
  </deploymentSettings>
</runtimeFabricDeployment>
\`\`\`

The \`limit\` must be equal to or higher than \`reserved\`. Check the allocation against the Runtime Fabric resource guide before you fix these values.

**Runtime version, channel and Java.** \`muleVersion\` must be equal to or higher than the earliest Mule version the app requires. If it is not set, the latest available version is selected. \`releaseChannel\` defaults to \`EDGE\` and \`javaVersion\` to \`8\`, so production must set both explicitly, or it gets values nobody chose. Use plugin 4.1.1 or later: the docs say the LTS channel is not supported with 4.1.0 or earlier.

**Update strategy and capacity.** Use the default, \`rolling\`, during business hours, because it updates replicas incrementally and maintains availability. It needs one additional replica's worth of resources, so keep that much free in each private space or fabric. If \`enforceDeployingReplicasAcrossNodes\` is enabled, the maximum number of replicas is one less than the number of nodes with \`rolling\`, and equal to it with \`recreate\`. Keep \`recreate\` for cases where a short outage is acceptable, because it terminates replicas before redeployment.

**Parent POM structure.** Put the plugin version and \`<extensions>true</extensions>\` in the parent. Keep one block per target in a Maven profile, for example \`ch2\` and \`rtf\`, and pass everything that varies as a property: environment, target, business group, replicas and sizing. The pipeline template then needs only the profile name and a parameter file. Keep the parameter names the same across profiles.
`,
  followUps: [
    { q: 'How many replicas can a Runtime Fabric application have?', a: 'The reference table gives a maximum of 16 replicas per application.' },
    { q: 'Can you configure autoscaling in the plugin?', a: 'Yes. deploymentSettings has an autoscaling element with enabled, minReplicas and maxReplicas. It is CPU based. If autoscaling is disabled and min and max are provided, they must match the replicas value.' },
    { q: 'What is the difference between publicUrl and endpoints on CloudHub 2.0?', a: 'Both configure application endpoints, and you must use one or the other, not both. endpoints lets you set url, pathRewrite and access (internal or external) for each entry.' },
    { q: 'When do you set clustered?', a: 'It enables clustering across two or more replicas and defaults to false. Set it when the application design needs it, not by default.' },
  ],
}
