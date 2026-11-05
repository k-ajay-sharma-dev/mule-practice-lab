export default {
  id: 'ms-161',
  category: 'mulesoft',
  title: 'Auditing a cloudhub2Deployment Block: Exclusive Parameters, Hidden Defaults and the Plugin Version Each Element Needs',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'maven', 'mule-maven-plugin', 'cloudhub-2'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'The organization is on usage-based pricing and the POM sets both `vCores` and `instanceType`. What does the reference say?',
      options: [
        '`vCores` cannot be used if you configure `instanceType`, and non-UBP organizations use `vCores` instead',
        'Both are allowed, and the larger one wins',
        '`instanceType` is ignored when `vCores` is set',
        '`vCores` is required in every deployment',
      ],
      answer: 0,
      explain: '`vCores` is required only when `instanceType` is not configured. `instanceType` is available only for organizations using a usage-based pricing package.',
    },
    {
      type: 'multi',
      prompt: 'Which `vCores` values does the CloudHub 2.0 reference accept?',
      options: ['`0.1`', '`0.2`', '`0.5`', '`1.5`', '`4`', '`0.25`', '`0.75`', '`8`'],
      answer: [0, 1, 2, 3, 4],
      explain: 'The accepted values are `0.1`, `0.2`, `0.5`, `1`, `1.5`, `2`, `2.5`, `3`, `3.5` and `4`.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about the application endpoint settings are correct?',
      options: [
        'Configure either `publicUrl` or `endpoints`, but not both in the same deployment configuration',
        '`pathRewrite` is used only for applications deployed to a private space, and it must begin with `/`',
        '`generateDefaultPublicUrl` is used only in a private space, and shared space apps always get a generated URL',
        '`access` on an `endpoint` accepts `internal` and `external`',
        '`lastMileSecurity` needs no certificate in the app, and adds no CPU load',
      ],
      answer: [0, 1, 2, 3],
      explain: '`lastMileSecurity` terminates TLS inside the Mule application, so the app must include an SSL certificate, and it consumes additional CPU resources. It defaults to `false`.',
    },
    {
      type: 'single',
      prompt: 'A team sets `<muleVersion>4.6.0</muleVersion>` and nothing else about the runtime, and expects an LTS image on Java 17. What does the reference say the value selects?',
      options: [
        'The last build, defaulting to the Edge channel and Java 8',
        'The last build on the LTS channel and Java 17',
        'The oldest build of 4.6.0 on Java 8',
        'The value is rejected without `releaseChannel`',
      ],
      answer: 0,
      explain: 'For a different channel or Java version, specify the full name, such as `4.6.0:1e-java17`, or set `releaseChannel` and `javaVersion`. Their defaults are `EDGE` and `8`, and an error occurs if the selection does not exist.',
    },
    {
      type: 'match',
      prompt: 'Match each element to the plugin release that added it or that you need for it.',
      pairs: [
        ['`autoscaling` and `tracingEnabled` on CloudHub 2.0', '4.3.0'],
        ['Horizontal Pod Autoscaling for Runtime Fabric', '4.5.0'],
        ['`endpoint` for CloudHub 2.0 endpoints', '4.8.0'],
        ['`propertiesFile`', '4.9.0'],
        ['Applications that target Mule 4.13.1', '4.10.3'],
      ],
      explain: 'A shared parent POM pinned to an old plugin cannot use elements from a later release, so read the release notes before you adopt a new element or a new runtime.',
    },
    {
      type: 'single',
      prompt: 'Autoscaling is disabled, `replicas` is 3, and `minReplicas` and `maxReplicas` are left in the POM from a trial. What must be true of them?',
      options: [
        'They must match the value of the replicas field',
        'They are ignored whatever their value',
        'They override `replicas`',
        'They must be removed, or the plugin deletes the app',
      ],
      answer: 0,
      explain: 'The reference says that if autoscaling is disabled and the fields are provided, they must match `target.replicas`. `replicas` is required only when `autoscaling` is set to `false`.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about logging settings in `cloudhub2Deployment` are correct?',
      options: [
        '`scopeLoggingConfigurations` sets a `logLevel` for a `scope`',
        'The accepted log levels are `INFO`, `DEBUG`, `WARN`, `ERROR` and `FATAL`',
        '`disableAmLogForwarding` disables application-level log forwarding to Anypoint Monitoring, and defaults to `false`',
        '`TRACE` is an accepted `logLevel` in this element',
      ],
      answer: [0, 1, 2],
      explain: 'The reference lists five levels for this element, and `TRACE` is not one of them.',
    },
  ],
  description: `
An insurer has moved \`claims-papi\` to CloudHub 2.0. It runs in a private space, and the organization is on a vCore based subscription. The plugin in the shared parent POM is 4.2.1. A contractor raised this change before leaving, and you are the reviewer:

\`\`\`xml
<cloudhub2Deployment>
  <provider>MC</provider>
  <environment>$\{deploy.env}</environment>
  <target>$\{deploy.target}</target>
  <muleVersion>4.6.0</muleVersion>
  <javaVersion>17</javaVersion>
  <applicationName>$\{deploy.appName}</applicationName>
  <replicas>3</replicas>
  <vCores>0.25</vCores>
  <businessGroup>Claims</businessGroup>
  <deploymentSettings>
    <instanceType>mule.small</instanceType>
    <autoscaling>
      <enabled>false</enabled>
      <minReplicas>2</minReplicas>
      <maxReplicas>6</maxReplicas>
    </autoscaling>
    <http>
      <inbound>
        <publicUrl>https://claims.example.com</publicUrl>
        <endpoints>
          <endpoint>
            <url>https://claims.internal.example.com/v1</url>
            <pathRewrite>api</pathRewrite>
            <access>internal</access>
          </endpoint>
        </endpoints>
        <lastMileSecurity>true</lastMileSecurity>
      </inbound>
    </http>
  </deploymentSettings>
  <scopeLoggingConfigurations>
    <scopeLoggingConfiguration>
      <scope>com.insurer.claims</scope>
      <logLevel>TRACE</logLevel>
    </scopeLoggingConfiguration>
  </scopeLoggingConfigurations>
</cloudhub2Deployment>
\`\`\`

**Questions**
1. List every problem in this block, and say which reference rule it breaks.
2. Which problems does the plugin version cause?
3. What does \`lastMileSecurity\` imply for the application?
4. Rewrite the block so that it is valid.
5. How would you stop such a block getting past review next time?
`,
  answerTemplate: `## Problems

## Plugin version

## Last mile security

## Corrected block

## Prevention
`,
  keyPoints: [
    'Required: applicationName, target, provider MC and environment. vCores unless instanceType is set. replicas unless autoscaling is on.',
    'vCores accepts 0.1, 0.2, 0.5, 1, 1.5, 2, 2.5, 3, 3.5 and 4, and cannot be combined with instanceType. instanceType is for UBP organizations only.',
    'publicUrl and endpoints are exclusive. pathRewrite begins with / and applies to private spaces.',
    'With autoscaling disabled, any minReplicas and maxReplicas must equal the replicas value.',
    'muleVersion 4.6.0 means the last build on Edge and Java 8. releaseChannel defaults to EDGE and javaVersion to 8.',
    'businessGroup is the full path from the parent organization, with backslashes.',
    'scopeLoggingConfiguration accepts INFO, DEBUG, WARN, ERROR and FATAL.',
    'Elements arrive with plugin releases: autoscaling 4.3.0, endpoint 4.8.0, propertiesFile 4.9.0.',
  ],
  solution: `
**Problems.**

| Line | Problem | Rule in the reference |
|---|---|---|
| \`vCores\` 0.25 | Not an accepted value | Accepted: 0.1, 0.2, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4 |
| \`instanceType\` with \`vCores\` | Exclusive, and this organization is not on UBP | \`vCores\` cannot be used with \`instanceType\`. Non-UBP organizations use \`vCores\` |
| \`minReplicas\` 2, \`maxReplicas\` 6 | Autoscaling is disabled, and they differ from \`replicas\` | They must match the replicas value when autoscaling is disabled |
| \`publicUrl\` with \`endpoints\` | Exclusive | Configure one, not both |
| \`pathRewrite\` \`api\` | No leading slash | The value must begin with \`/\` |
| \`businessGroup\` \`Claims\` | Not a full path | Specify the full hierarchical path from the parent organization, such as \`Insurer\\Claims\` |
| \`logLevel\` \`TRACE\` | Not accepted here | INFO, DEBUG, WARN, ERROR, FATAL |
| \`muleVersion\` with \`javaVersion\` | Possibly not a fault, but a trap | \`4.6.0\` alone means Edge and Java 8. The intent must be explicit, and the selection must exist or an error occurs |

**Plugin version.** The parent POM pins 4.2.1. \`autoscaling\` on CloudHub 2.0 came with 4.3.0, \`endpoint\` with 4.8.0 and \`propertiesFile\` with 4.9.0. So \`endpoints\` needs a later plugin than this project has, and the \`autoscaling\` block, even if disabled, assumes one too. \`javaVersion\` and \`releaseChannel\` need 4.1.1 or later, which 4.2.1 satisfies. Remember the other direction as well: a new runtime can force an upgrade. Plugin 4.10.0 added support for Mule 4.12.0, and the 4.10.3 notes tell you to upgrade to that version or later to build and deploy apps for Mule 4.13.1. Skip 4.10.2, which the release notes mark as deprecated.

**Last mile security.** It performs TLS termination and decryption for forwarded HTTPS connections inside the Mule application. So the app must include an SSL certificate, and it consumes additional CPU, which a replica sized for plain HTTP may not have to spare. It defaults to \`false\`.

**Corrected block.** The business decision here is one public URL, fixed capacity and a chosen runtime.

\`\`\`xml
<cloudhub2Deployment>
  <provider>MC</provider>
  <environment>$\{deploy.env}</environment>
  <target>$\{deploy.target}</target>
  <muleVersion>$\{app.runtime}</muleVersion>
  <releaseChannel>LTS</releaseChannel>
  <javaVersion>17</javaVersion>
  <applicationName>$\{deploy.appName}</applicationName>
  <replicas>3</replicas>
  <vCores>0.2</vCores>
  <businessGroup>Insurer\\Claims</businessGroup>
  <deploymentSettings>
    <http>
      <inbound>
        <publicUrl>https://claims.example.com</publicUrl>
        <pathRewrite>/api</pathRewrite>
        <lastMileSecurity>true</lastMileSecurity>
      </inbound>
    </http>
  </deploymentSettings>
  <scopeLoggingConfigurations>
    <scopeLoggingConfiguration>
      <scope>com.insurer.claims</scope>
      <logLevel>DEBUG</logLevel>
    </scopeLoggingConfiguration>
  </scopeLoggingConfigurations>
</cloudhub2Deployment>
\`\`\`

The size of a replica is a capacity decision, so \`0.2\` here only shows a valid value. Confirm that the chosen channel, Mule version and Java version exist for this target.

**Prevention.**
- Keep the deployment block in one reviewed parent POM or template, and let each app supply only values.
- Add a pipeline step that deploys every changed POM to a sandbox, so a bad value fails there first.
- Record the approved plugin version with the reason for it, and read the release notes before raising it.
`,
  followUps: [
    { q: 'What does integrations do in this block?', a: 'integrations, services, objectStoreV2 and enabled set to true instruct the deployment to use Object Store v2.' },
    { q: 'What is tracingEnabled for?', a: 'It exposes tracing information in the OpenTelemetry standard from the Mule runtime to APM solutions.' },
    { q: 'Is target a free text value?', a: 'It is the CloudHub 2.0 target name: a shared space or a private space available in your Deployment Target values. For a shared space the reference points to the regions list, for example Cloudhub-US-East-1.' },
    { q: 'What changes in runtimeFabricDeployment?', a: 'vCores is not in that table. Runtime Fabric sizes replicas with deploymentSettings resources, with cpu and memory reserved and limit values, and allows up to 16 replicas per application.' },
    { q: 'Does a plugin upgrade need a Maven upgrade?', a: 'It can. Plugin 4.0.0 dropped Maven 3.8 and adopted 3.9. Plugin 4.10.4 lists Maven 3.9.0 to 3.10.0 and Java 8, 11, 17 and 21.' },
  ],
}
