export default {
  id: 'ms-133',
  category: 'mulesoft',
  title: 'Promoting API Instances and Policies With Anypoint CLI in a Pipeline',
  level: 'ADVANCED',
  tags: ['ci-cd', 'deployment', 'anypoint-cli', 'api-manager', 'policies'],
  estMinutes: 25,
  quiz: [
    {
      type: 'multi',
      detail: true,
      prompt: 'A Jenkins job runs `anypoint-cli-v4` on a clean agent with no credentials file and no flags. It must authenticate as a Connected App and act on the right organization and environment. Which environment variables should it export?',
      options: [
        '`ANYPOINT_CLIENT_ID`, with the client ID of the Connected App',
        '`ANYPOINT_CLIENT_SECRET`, with the client secret of the Connected App',
        '`ANYPOINT_USERNAME`, with the name of the Connected App',
        '`ANYPOINT_ORG`, with the organization ID',
        '`ANYPOINT_ENV`, with the environment name',
        '`ANYPOINT_DEPLOY_TARGET`, with the target the job deploys to',
      ],
      answer: [0, 1, 3, 4],
      explain: '`ANYPOINT_CLIENT_ID`, `ANYPOINT_CLIENT_SECRET`, `ANYPOINT_ORG` and `ANYPOINT_ENV` are in the authentication table. `ANYPOINT_USERNAME` is in the table too, but it pairs with `ANYPOINT_PASSWORD` for a user sign in, not with a Connected App. There is no variable for a deployment target. Export the environment explicitly, because an unset environment defaults to Production.',
    },
    {
      type: 'order',
      needsScenario: true,
      prompt: 'Order these sources from highest priority to lowest.',
      items: [
        'Command-line parameter',
        'Environment variable',
        'Credentials file parameter',
      ],
      explain: 'Command-line parameters override environment variables, and environment variables override the credentials file.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A script sets the client ID and secret but never sets an environment, in a flag, a variable or a profile. What does the Anypoint CLI page say?',
      options: [
        'The default environment is Production',
        'The command fails and asks for an environment',
        'The default environment is Sandbox',
        'The first environment by name is used',
      ],
      answer: 0,
      explain: 'The override order section says this directly. That makes an unset value a real risk in a script, so always pass the environment explicitly.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'A pipeline runs `api-mgr:api:promote` from Sandbox to Production with no copy flags. The new Production instance has no policies, no SLA tiers and no alerts. Which statements are correct?',
      options: [
        'A bare promote copies none of them, since each copy flag must be included to be enabled',
        'Adding `--copyPolicies` brings the policies across with the instance',
        'Adding `--copyContracts` brings the client applications and their tiers across',
        'Adding `--copyTiers` and `--copyAlerts` brings the tiers and the alerts across',
        'The promote also deploys the Mule application, so only the API settings are missing',
      ],
      answer: [0, 1, 3],
      explain: 'The command reference has three copy flags: `--copyPolicies`, `--copyTiers` and `--copyAlerts`. Each one must be included to be enabled, so a bare promote copies none of them. There is no `--copyContracts` flag, and promoting an API instance does not deploy the Mule application.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A pipeline applies a rate limiting policy with `api-mgr:policy:apply` and sends only the fields it wants to change, trusting the defaults for the rest. What does the docs note say?',
      options: [
        'Every required parameter must be sent, even with a default',
        'Missing fields take their defaults, as in the API Manager UI',
        'Only `--pointcut` is required; the rest take defaults',
        'The policy is applied but stays disabled until edited',
      ],
      answer: 0,
      explain: 'The note is on the command page: you must configure all required policy parameters, even if you plan to use the default values. Use `api-mgr:policy:describe` to see the base configuration properties of a policy.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each pipeline need to the command.',
      pairs: [
        ['Create a new API instance from an Exchange asset', '`api-mgr:api:manage`'],
        ['Bring an instance across from another environment', '`api-mgr:api:promote`'],
        ['Find the autodiscovery properties for the app', '`api-mgr:api:autodiscovery`'],
        ['Point an instance at a new asset version', '`api-mgr:api:change-specification`'],
        ['See a policy\'s configuration properties', '`api-mgr:policy:describe`'],
      ],
      explain: 'All five are listed in the API Manager section of the Anypoint CLI command reference.',
    },
  ],
  description: `
A logistics company manages 60 API instances. Every release, an administrator clicks through API Manager to recreate instances and policies in Test and Production. Last quarter a client ID enforcement policy was missed on one Production instance and was found only in a penetration test.

The team is adding an API Manager stage to its GitHub Actions workflow:

\`\`\`yaml
- name: Promote API
  env:
    ANYPOINT_CLIENT_ID: $\{{ secrets.ANYPOINT_CLIENT_ID }}
    ANYPOINT_CLIENT_SECRET: $\{{ secrets.ANYPOINT_CLIENT_SECRET }}
    ANYPOINT_ORG: $\{{ vars.ANYPOINT_ORG }}
  run: |
    anypoint-cli-v4 api-mgr:api:promote "$API_INSTANCE_ID" "$SOURCE_ENV_ID"
    anypoint-cli-v4 api-mgr:policy:apply "$API_INSTANCE_ID" rate-limiting --config '{"clusterizable": true}'
\`\`\`

The security team requires that every Production instance has the approved policy set, and that the stage can show what it did.

**Questions**
1. How does the CLI authenticate in this job, and what does the Connected App need?
2. What is wrong or risky in this step?
3. Should the pipeline promote instances, or apply policies from configuration? When do you use each?
4. How does the Mule application get tied to the promoted instance?
5. How do you make sure a policy cannot be missed again?
`,
  answerTemplate: `## CLI authentication

## Problems in this step

## Promote or apply from configuration

## Linking the application

## Preventing a missed policy
`,
  keyPoints: [
    'The CLI can authenticate with --client_id and --client_secret, or ANYPOINT_CLIENT_ID and ANYPOINT_CLIENT_SECRET.',
    'Connected Apps need View Organization and View Environment to authenticate. Deploying with runtime-mgr needs the CloudHub and Runtime Manager permissions too.',
    'Override order: command line, then environment variables, then the credentials file. With no environment given, the default is production.',
    'api-mgr:api:promote copies policies, tiers and alerts only if you include --copyPolicies, --copyTiers and --copyAlerts.',
    'api-mgr:policy:apply needs all required policy parameters, even for default values. --config takes JSON and --configFile takes a file.',
    '--output json gives the pipeline something it can parse.',
    'Use api-mgr:api:autodiscovery to get the properties, and pass the instance ID to the deployment as a property.',
  ],
  solution: `
**CLI authentication.** The variables \`ANYPOINT_CLIENT_ID\` and \`ANYPOINT_CLIENT_SECRET\` authenticate the job as a Connected App, and they come from the secret store. The Connected App needs the \`View Organization\` and \`View Environment\` scopes to authenticate, plus the scopes for the API Manager work. Test the minimum set in a sandbox. \`--organization\` is optional and defaults to your main organization, so set \`ANYPOINT_ORG\` when you work in a business group.

**Problems in this step.**
- \`ANYPOINT_ENV\` is missing. With no environment specified, the CLI default is production. Set it explicitly for every stage, from a value owned by the stage.
- \`promote\` has no copy flags, so the job has not asked for policies, tiers or alerts. Add the ones that the design needs, for example \`--copyPolicies --copyTiers\`.
- \`policy:apply\` sends a partial configuration, and the docs require all required parameters even if you plan to use the defaults. Use \`--configFile\` with a complete, reviewed JSON file.
- Nothing is captured. Add \`--output json\`, supported by these commands, and keep the result as a build artifact.

**Promote or apply from configuration.**
- \`promote\` suits instances that should look the same as the earlier environment, and it carries policies, tiers and alerts across in one command.
- Applying from configuration suits values that differ per environment, such as rate limits, and it keeps the desired state in Git, where it is reviewed.

A common design promotes the instance, then applies only the environment-specific policies from files. Agree one owner for each policy so the two routes do not fight.

**Linking the application.** An instance has its own ID in each environment. Use \`api-mgr:api:autodiscovery\`, which lists the autodiscovery properties, then pass the ID to the deployment as an application property, in the \`properties\` element of the Mule Maven plugin. The app's autodiscovery element reads that property. So the API Manager stage must run before the deploy stage.

**Preventing a missed policy.**
- Keep a list of required policies in the repository, and fail the stage if an instance does not have them after the step runs. \`api-mgr:policy:list\` with the instance ID is the source for that check. Its command page does not list \`--output\`, so confirm what your CLI version returns before you parse it.
- Apply the same stage to all 60 instances, so nothing relies on a person.
- Keep the Connected App used for Production separate from the one used for Test.
- Consider automated policies for rules that must apply to every instance in an environment, and confirm how they suit your gateway type first.
`,
  followUps: [
    { q: 'How do you install the CLI on a build agent?', a: 'The CLI is built with Node.js, so the agent needs npm. Pin the package version in the image or the job, so that a CLI update cannot change pipeline behaviour without review.' },
    { q: 'What does --pointcut do on policy:apply?', a: 'It passes pointcut data as JSON, with a methodRegex and uriTemplateRegex, so the policy applies only to matching methods and resources.' },
    { q: 'Can the CLI deploy the application too?', a: 'Yes. On CloudHub 2.0, runtime-mgr:application:deploy deploys an application from Exchange to a deployment target. The docs say a connected app needs CloudHub and Runtime Manager permission for it.' },
    { q: 'How do you use a custom policy?', a: 'policy:apply has --groupId and --policyVersion. groupId defaults to the MuleSoft group ID, so a policy from your own organization needs its group ID.' },
  ],
}
