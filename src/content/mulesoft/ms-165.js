export default {
  id: 'ms-165',
  category: 'mulesoft',
  title: 'Scripting Hybrid Runtime Manager With Anypoint CLI: Inventory, Redeploys, Copies Between Environments and What the Commands Will Not Do',
  level: 'INTERMEDIATE',
  tags: ['ci-cd', 'deployment', 'anypoint-cli', 'runtime-manager', 'hybrid', 'automation'],
  estMinutes: 25,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'Match each deployment target to its command family in Anypoint CLI 4.x.',
      pairs: [
        ['On-premises server, server group or cluster', '`runtime-mgr:standalone-application:*`'],
        ['CloudHub 2.0', '`runtime-mgr:application:*`'],
        ['CloudHub 1.0', '`runtime-mgr:cloudhub-application:*`'],
      ],
      explain: 'The three look alike in a script, and a command from the wrong family is an easy mistake when an estate is half migrated.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'What does `runtime-mgr:standalone-application:deploy` take as its arguments?',
      options: [
        '`<targetIdentifier> <name> <zipfile>`, where the target is a server, server group or cluster, by ID or name',
        '`<appID> <deploymentTargetID> <runtimeVersion> <artifactID>`',
        '`<groupId>/<assetId>/<version>`',
        'Only `<zipfile>`, because the target comes from the POM',
      ],
      answer: 0,
      explain: 'It deploys or redeploys. The second option is the shape of `runtime-mgr:application:deploy` for CloudHub 2.0, which takes its artifact from Exchange.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A script must redeploy with a new logging level and with Insight turned on. Which command does the reference point to?',
      options: [
        '`runtime-mgr:standalone-application:modify`, with `--log` and `--insight`',
        '`runtime-mgr:standalone-application:deploy`, with `--log`',
        '`runtime-mgr:server:modify`',
        '`runtime-mgr:standalone-application:restart`, with `--insight`',
      ],
      answer: 0,
      explain: 'The deploy entry says to see `modify` for that. `--log` takes `level:scope` pairs, and you repeat the flag for several levels.',
    },
    {
      type: 'multi',
      detail: true,
      needsScenario: true,
      prompt: 'Which warnings in the reference matter for a script?',
      options: [
        'The delete commands do not prompt twice before deleting',
        'Each target server must be manually registered with the platform for the CLI to recognize it',
        '`standalone-application:copy` needs read and write access to `/tmp` on the OS where the CLI is installed',
        'Apps with the same name but different targets, in the same organization and environment, cannot be copied with the CLI',
        '`standalone-application:list` always returns every application in one call, and accepts no paging flags',
      ],
      answer: [0, 1, 2, 3],
      explain: '`list` has `--limit` and `--offset`, as well as `--output`. A script should page through results and not assume one call returns everything.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'A script must parse the state of an application. What does the reference offer?',
      options: [
        '`--output json`, or `-o json`, for the raw JSON response of `describe`',
        'Only `table` output, so parse it with `awk`',
        'The `--bodyFormat xml` flag',
        'A `--status` flag on `start`',
      ],
      answer: 0,
      explain: 'The supported values for `--output` are `table`, which is the default, and `json`. JSON is the safe choice for a script, because table layouts are made for people.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Before a risky redeploy, an operator wants a copy of the binary that is running now. Which command fits?',
      options: [
        '`runtime-mgr:standalone-application:artifact <identifier> <directory>`',
        '`runtime-mgr:standalone-application:describe`',
        '`runtime-mgr:standalone-application:copy`',
        '`runtime-mgr:server:token`',
      ],
      answer: 0,
      explain: 'It downloads the application artifact binary to the directory given. `describe` returns details about the app, and `copy` creates an app on a target.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'A nightly script sets a client ID and secret, but no environment by flag, variable or profile. Which environment does it act on?',
      options: [
        'Production, which is the default if you do not specify an environment',
        'Sandbox, for safety',
        'The first environment in alphabetical order',
        'None, because the command fails',
      ],
      answer: 0,
      explain: 'The overview page says that if you do not specify an environment, the default is production. Every script should set `--environment` or `ANYPOINT_ENV` explicitly.',
    },
  ],
  description: `
A manufacturer has 60 Mule apps on 9 on-premises servers, in three server groups, all managed by Runtime Manager. The operations team uses a wiki and the console. It wants a small set of scripts, run from Azure DevOps with \`anypoint-cli-v4\`:

1. A nightly inventory: for each environment, the app, target, status and last update.
2. A redeploy script that a pipeline calls with an app name, a target and a file.
3. A script that copies an app from Sandbox to Production after approval.
4. A way to raise the log level for one package during an incident, without touching the POM.
5. A "safe redeploy" that can return to the previous binary.

A draft of the second script:

\`\`\`bash
#!/bin/bash
APP=$1; TARGET=$2; FILE=$3
anypoint-cli-v4 runtime-mgr:application:deploy "$APP" "$TARGET" "$FILE"
anypoint-cli-v4 runtime-mgr:standalone-application:list | grep "$APP"
\`\`\`

**Questions**
1. What is wrong with the draft, and how do you fix it?
2. Write the outline for each of the five scripts.
3. What are the limits of these commands, for properties in particular?
4. What rules apply when you run these scripts on a schedule or from a pipeline?
`,
  answerTemplate: `## Problems in the draft

## The five scripts

## Limits

## Rules for automation
`,
  keyPoints: [
    'standalone-application is for on-premises, application is for CloudHub 2.0, cloudhub-application is for CloudHub 1.0.',
    'standalone-application:deploy takes target, name and file, and it deploys or redeploys.',
    'modify changes the artifact, and it is the command with --log and --insight.',
    'Use --output json in scripts. list pages with --limit and --offset.',
    'artifact downloads the binary, which gives a hybrid rollback a source.',
    'copy needs /tmp access, and has a limit for apps with the same name on different targets.',
    'Delete commands do not ask for confirmation.',
    'Always set the environment: if you do not, the default is production.',
  ],
  solution: `
**Problems in the draft.**
- \`runtime-mgr:application:deploy\` belongs to CloudHub 2.0. For these servers the command is \`runtime-mgr:standalone-application:deploy\`, with the arguments \`<targetIdentifier> <name> <zipfile>\`, so the order is target first.
- No environment is set. If you do not specify one, the default is production, which is a poor default for a script that also runs against Sandbox.
- \`grep\` on table output proves little. It shows only that a row exists, not that the app started. Use \`describe\` with \`--output json\`.
- There is no error handling. Check how your CLI version reports a failed command before you rely on it, because the reference does not document exit codes.

**The five scripts.**

*1. Inventory.* Loop over the environments. For each one, page through \`runtime-mgr:standalone-application:list --output json --limit 50 --offset N\`, and write the result to a file with a date. \`runtime-mgr:server:list --output json\` and \`runtime-mgr:serverGroup:list\` add the targets.

*2. Redeploy.*

\`\`\`bash
#!/bin/bash
set -euo pipefail
APP=$1; TARGET=$2; FILE=$3
export ANYPOINT_ENV=$4
anypoint-cli-v4 runtime-mgr:standalone-application:deploy "$TARGET" "$APP" "$FILE"
anypoint-cli-v4 runtime-mgr:standalone-application:describe "$APP" --output json > "deploy-$APP.json"
\`\`\`

Then poll \`describe\` until the app reaches the expected status, with a time limit, and fail the job if it does not. A deploy command that returns does not prove that the app started.

*3. Copy between environments.* \`runtime-mgr:standalone-application:copy\` takes a source and a target in the \`organization:environment/application\` form, plus the server, server group or cluster. For example \`Services:Sandbox/billing-api Services:Production/billing-api 123456\`. Run it on an agent where the user can write to \`/tmp\`. Promoting the same binary this way fits build once, deploy many. Check first that the hybrid promotion rules hold: compatible Mule runtime versions, matching target types, and permissions on both environments.

*4. Log level during an incident.* \`runtime-mgr:standalone-application:modify\` takes the app and a file, with \`--log\`, for example \`--log DEBUG:com.acme.billing\`. The reference places this flag on \`modify\`, so plan for a redeploy, and record the change so that someone reverses it.

*5. Safe redeploy.*

\`\`\`bash
anypoint-cli-v4 runtime-mgr:standalone-application:artifact "$APP" "./backup/$APP-$(date +%F)"
anypoint-cli-v4 runtime-mgr:standalone-application:deploy "$TARGET" "$APP" "$FILE"
# on a failed check, deploy the file from ./backup in the same way
\`\`\`

Exchange or your artifact repository remains the better source for a known version. This covers apps that nobody can trace to a version.

**Limits.**
- For on-premises apps, the reference gives \`deploy\` only the default flags, and \`modify\` adds \`--insight\` and \`--log\`. It lists no property flag there, unlike the CloudHub 2.0 commands. Check \`--help\` in your version. If it is confirmed, properties must come from the Mule Maven plugin, the console or the Runtime Manager API.
- The reference calls the file a ZIP, while Mule 4 apps are packaged as JAR files, so test a redeploy with your real artifact first.
- \`copy\` cannot handle apps that have the same name but different targets within the same organization and environment. The docs say that can only be done through the UI.

**Rules for automation.**
- Use a Connected App or a dedicated account, not a person. The Continuous Deployment page advises a dedicated account for deployment and CI.
- Set the environment explicitly in every run. Remember the override order: command-line parameters override environment variables, and environment variables override the credentials file.
- Keep \`delete\` commands out of scheduled scripts, or behind a separate approval, because they do not ask for confirmation.
- Pin the CLI version, as with any build tool.
- The CLI works through Runtime Manager, so it respects the rule that a managed server is not managed by any other method. Copying files to the \`apps\` folder would not.
`,
  followUps: [
    { q: 'What is runtime-mgr:server:token for?', a: 'It gets the registration token that is needed to register a new server, which suits scripted provisioning of hosts.' },
    { q: 'Can the CLI build a server group?', a: 'Yes. runtime-mgr:serverGroup:create creates one from servers, and add:server and remove:server change it. The cluster commands work in a similar way.' },
    { q: 'When would you still use the Mule Maven plugin for hybrid?', a: 'When the deployment belongs in the build, with properties in the POM or a propertiesFile. The CLI suits operational scripts that have no project checkout.' },
    { q: 'Does the CLI session expire?', a: 'The session expires based on the default session timeout in the organization settings, which matters for long-running scripts.' },
    { q: 'What happens to usage data?', a: 'MuleSoft gathers anonymized usage data, and you can opt out by setting collectMetrics to false in the credentials file.' },
  ],
}
