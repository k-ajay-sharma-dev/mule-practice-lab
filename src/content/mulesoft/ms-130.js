export default {
  id: 'ms-130',
  category: 'mulesoft',
  title: 'What mvn deploy Really Does: Mule Maven Plugin Goals, muleDeploy and Deployment Verification',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'deployment', 'maven', 'mule-maven-plugin', 'cloudhub-2'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      prompt: 'Match each command to what the Mule Maven plugin does.',
      pairs: [
        ['`mvn clean package`', 'Generates the application JAR'],
        ['`mvn clean deploy`', 'Uploads the artifact to the repository in `distributionManagement`'],
        ['`mvn clean deploy -DmuleDeploy`', 'Packages, then deploys with the strategy in the plugin configuration'],
        ['`mvn mule:deploy`', 'Deploys without rebuilding the artifact'],
        ['`mvn mule:undeploy`', 'Removes the application from the configured target'],
      ],
      explain: 'The `deploy` goal binds to the Maven `deploy` phase. Only `muleDeploy` switches it from uploading to a repository to deploying to a target.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A new job runs `mvn clean deploy -DmuleDeploy` for an app that has never been published. The plugin configuration is valid. What is missing?',
      options: [
        'The prerequisite: the application must already be published in Exchange, which is a separate `mvn clean deploy` without `muleDeploy`',
        'Nothing, because `muleDeploy` publishes to Exchange and then deploys in the same step',
        'A `mule:undeploy` step, because a deployment needs an empty target',
        'The `-Dmule.artifact` parameter, which is mandatory for CloudHub 2.0',
      ],
      answer: 0,
      explain: 'The CloudHub 2.0 and Runtime Fabric pages both list publication in Exchange under the steps to complete first. The upload and the deployment are two different behaviours of the goal.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'The promotion stage must deploy the artifact that was already built, without compiling again. Which command does the CloudHub 2.0 page give for that?',
      options: [
        '`mvn mule:deploy`',
        '`mvn clean deploy -DmuleDeploy`',
        '`mvn package -DattachMuleSources`',
        '`mvn deploy -DskipTests`',
      ],
      answer: 0,
      explain: 'The docs describe `mvn mule:deploy` as deploying the artifact without rebuilding it. `-DskipTests` only skips the tests, and the project is still rebuilt.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which statements about `skip` and `skipDeploymentVerification` are correct?',
      options: [
        '`skip` set to true skips the plugin deployment goal',
        '`skipDeploymentVerification` set to true skips the status verification of the deployed app',
        'Both default to false',
        '`skipDeploymentVerification` makes the deployment faster on the target because replicas start in parallel',
        '`skip` skips the MUnit tests as well',
      ],
      answer: [0, 1, 2],
      explain: 'Verification is a check made by the plugin after it asks for the deployment. Skipping it says nothing about how the target starts replicas. MUnit has its own skip parameters.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A large app takes about 13 minutes to reach a running state, and the deploy job fails while waiting for confirmation. Which setting applies, and what is its default?',
      options: [
        '`deploymentTimeout`, in milliseconds, default `600000` (10 minutes)',
        '`deploymentTimeout`, in seconds, default `600`',
        '`skipDeploymentVerification`, default `true`',
        '`updateStrategy`, default `recreate`',
      ],
      answer: 0,
      explain: 'It is the allowed time between the start of the deployment process and confirmation that the artifact has been deployed. Raising it keeps verification in place, which skipping would not.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A parent POM declares the plugin without `<extensions>true</extensions>`. What do the docs say?',
      options: [
        'The plugin does not work without it',
        'Only the `mule:undeploy` goal stops working',
        'It is optional from plugin version 3.2.5',
        'Maven adds it automatically for a Mule project',
      ],
      answer: 0,
      explain: 'The docs state that if `<extensions>true</extensions>` is not present, the plugin does not work. Version 3.2.5 is when `skipDeploymentVerification` was introduced.',
    },
  ],
  description: `
A retail group runs 18 Mule applications on CloudHub 2.0, and about 40 deployments go out each month from Jenkins. Two senior developers have left, and the remaining team copies pipeline commands without knowing what each one does. Three symptoms show this:

- A new starter asks why the "publish" and "deploy to Test" stages both run a command called \`deploy\`.
- The production stage runs \`mvn clean deploy -DmuleDeploy\`, so it packages the project again rather than reusing the build that was tested.
- A previous engineer set \`skipDeploymentVerification\` to \`true\` to "stop the job timing out" on a slow app.

\`\`\`xml
<plugin>
  <groupId>org.mule.tools.maven</groupId>
  <artifactId>mule-maven-plugin</artifactId>
  <version>$\{mule.maven.plugin.version}</version>
  <extensions>true</extensions>
  <configuration>
    <cloudhub2Deployment>
      <provider>MC</provider>
      <environment>$\{deploy.env}</environment>
      <target>$\{deploy.target}</target>
      <applicationName>$\{deploy.appName}</applicationName>
      <replicas>2</replicas>
      <vCores>0.5</vCores>
      <skipDeploymentVerification>true</skipDeploymentVerification>
    </cloudhub2Deployment>
  </configuration>
</plugin>
\`\`\`

**Questions**
1. List the plugin goals and say what each does.
2. Why do two stages both run \`deploy\`, and what makes them different?
3. How should the production stage change?
4. What is wrong with using \`skipDeploymentVerification\` to fix a timeout, and what is the right setting?
5. When would you use \`skip\`?
`,
  answerTemplate: `## Plugin goals

## Why two stages run deploy

## Production stage

## Verification and timeouts

## Using skip
`,
  keyPoints: [
    'Goals: package, deploy, mule:deploy, mule:undeploy. Parameters are passed on the command line with -D.',
    'package and deploy bind by default to the Maven phases of the same name.',
    'Without muleDeploy, deploy uploads to the repository in distributionManagement. With it, deploy uses the deployment strategy in the plugin configuration.',
    'CloudHub 2.0 and Runtime Fabric deployments need the application published in Exchange first.',
    'mvn mule:deploy deploys without rebuilding, which fits promotion. Redeploying is the same command as deploying.',
    'skipDeploymentVerification removes the status check, so a failed start can leave the job green. deploymentTimeout (default 600000 ms) is the setting for slow apps.',
    'undeploy also deletes the app in plugin 3.3.0 and later.',
  ],
  solution: `
**Plugin goals.**
- \`package\` generates the application JAR and binds to the \`package\` phase.
- \`deploy\` binds to the \`deploy\` phase. It uploads and starts the application on a target, or uploads to a repository, depending on \`muleDeploy\`.
- \`mule:deploy\` deploys an artifact without building it. \`-Dmule.artifact\` gives the location, and the docs say that property is valid for CloudHub, standalone and on-premises deployments.
- \`mule:undeploy\` uses the plugin configuration to remove the application from the target. In plugin 3.3.0 and later it also deletes the app.

**Why two stages run deploy.** The difference is one parameter. If \`muleDeploy\` is not set, the plugin uploads the artifacts to the repository in \`distributionManagement\`. That is the publish stage, with Exchange as the repository. If it is set, the plugin deploys using the strategy in the configuration. That is the deploy stage. Naming the stages "Publish to Exchange" and "Deploy to Test" removes most of the confusion.

**Production stage.** \`mvn clean deploy -DmuleDeploy\` packages the project again, so the stage does not simply reuse what was tested. Use \`mvn mule:deploy\`, which the CloudHub 2.0 page gives for deploying without rebuilding, and run it from the same tagged commit with production parameters. That way the version tested is the version released.

**Verification and timeouts.** With \`skipDeploymentVerification\` set to \`true\` the plugin does not check the status of the deployed app. So a deployment that fails to start can leave the job green, which is worse than the timeout. Remove the setting and raise \`deploymentTimeout\` for the slow app. It is the time allowed, in milliseconds, between the start of the deployment and confirmation, and it defaults to \`600000\`. For a 13-minute start, a value such as \`1200000\` leaves some margin.

**Using skip.** \`skip\` set to \`true\` skips the deployment goal, and it sits inside the deployment configuration. It suits a build that shares the POM but must not deploy, driven by a property. It should not be hard-coded, because the deploy stage then does nothing.
`,
  followUps: [
    { q: 'How do you redeploy an application?', a: 'Run the same command as for the first deployment. On CloudHub 2.0 and Runtime Fabric, the docs say the platform rewrites the application you had deployed.' },
    { q: 'Can the plugin deploy to more than CloudHub?', a: 'Yes. The strategies are CloudHub, CloudHub 2.0, Runtime Fabric, the Runtime Manager REST API, the Runtime Manager agent and a standalone runtime. The agent strategy works only if all Mule instances reside in one address space.' },
    { q: 'What do lightweightPackage and onlyMuleSources do?', a: 'lightweightPackage leaves the repository of dependencies out of the JAR, and onlyMuleSources produces a JAR with only the source code. The docs say both are for sharing purposes, so neither is a deployable build.' },
    { q: 'Which plugin versions should you avoid?', a: 'The docs mark 3.0.0, 3.1.0 to 3.1.7 and 3.8.3 as deprecated. A shared parent POM is a good place to pin one approved version.' },
  ],
}
