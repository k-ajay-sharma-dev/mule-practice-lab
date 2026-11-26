export default {
  id: 'ms-116',
  category: 'mulesoft',
  title: 'Runtime Manager for Hybrid Servers: Server Groups or Clusters, Properties, Environments and Anypoint CLI',
  level: 'INTERMEDIATE',
  tags: ['runtime-manager', 'deployment', 'environments', 'api-management', 'anypoint-cli', 'platform-apis', 'hybrid'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: '`baggage-events` has a Scheduler and is deployed to a server group of two on-premises servers. Each run, both servers process the same work. What explains it, and what fixes it?',
      options: [
        'The servers are not in one multicast segment, so the group cannot coordinate; open multicast between them',
        'Group instances run in isolation, so each runs the Scheduler; deploy to a cluster instead',
        'Primary node only is off on the Scheduler; turn it on so one group member runs it',
        'Each server keeps its own watermark in a local store; move the watermark to a shared database',
      ],
      answer: 1,
      explain: 'In a server group, application instances run in isolation, so each instance runs its own Scheduler. In a cluster, instances are aware of each other, share information and synchronize statuses, and a Scheduler runs on the primary node only. Both are a single deployment target, so a server group still deploys to every server. The network segment rule is for multicast clusters, not server groups, and primary node behaviour belongs to clusters, so no setting gives it to a group. A shared watermark does not stop two servers from running the same poll at the same moment. If you have concurrency issues with a server group, the docs suggest a cluster.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'A team plans a server group of four servers: two run Mule 4.6 and two run 4.9, all with the same agent and Java version. One server still runs an old app, and the network blocks multicast. Which statements are correct?',
      options: [
        'The Mule runtime versions must be aligned before the group is formed',
        'The old app must be stopped and deleted before that server joins',
        'Blocked multicast rules out a server group, so a unicast cluster is needed',
        'The agent and Java versions must also match, and here they already do',
        'Mixed runtime versions are allowed, because group instances run in isolation',
      ],
      answer: [0, 1, 3],
      explain: 'All servers in a server group run the same Mule runtime version, the same Runtime Manager agent version and the same Java version. Isolation of instances does not relax this. Applications on a server must be stopped and deleted before it joins the group. The network segment rule is for multicast clusters, not server groups, so blocked multicast does not matter here.',
    },
    {
      type: 'match',
      needsScenario: true,
      prompt: 'Match each deployment target to its property.',
      pairs: [
        ['Unicast', 'You configure node IP addresses, so they cannot be assigned dynamically with DHCP'],
        ['Multicast', 'Nodes detect each other automatically, and must be on the same network segment'],
        ['Server group', 'No cluster type to choose, because application instances run in isolation'],
      ],
      explain: 'A unicast node must be Running to be added. A multicast node need not be, but many networks block multicast. A cluster has up to eight servers.',
    },
    {
      type: 'single',
      prompt: 'An engineer changes a property on the Settings page of an app running on a cluster. Nothing changes in behaviour. What is missing?',
      options: [
        'A restart of the app and of the cluster where it is deployed',
        'A new JAR, because properties are read only at build time',
        'A change in the bundled YAML file, which takes priority',
        'A redeploy of the same JAR to each cluster node in turn',
      ],
      answer: 0,
      explain: 'After a change to properties, the docs say you must restart the application and any server group or cluster where it is deployed. Settings page values override values in the properties file, so no new JAR or YAML change is needed. Redeploying the same JAR node by node is not the documented step; the restart of the app and its cluster is.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each environment type to its purpose.',
      pairs: [
        ['Production', 'Deploy applications and APIs publicly'],
        ['Sandbox', 'Develop and test without affecting production'],
        ['Design', 'Used by Design Center; you cannot deploy to it with Runtime Manager'],
      ],
      explain: 'The type is chosen when an environment is created, and it cannot be changed after that.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A CI job runs Anypoint CLI. The credentials file has one client ID, an environment variable has another, and the command line has a third. Which is used?',
      options: [
        'The command line, then environment variables, then the file',
        'The file, then environment variables, then the command line',
        'Environment variables, then the command line, then the file',
        'The command fails, because the client IDs it was given differ',
      ],
      answer: 0,
      explain: 'Command-line parameters override all other methods. Environment variables override the configuration file.',
    },
    {
      type: 'single',
      prompt: 'Since MFA was enabled for all users, how should an automated job authenticate to Anypoint CLI?',
      options: [
        'With a connected app (client ID and client secret)',
        'With a dedicated service user whose password the CI vault rotates',
        'With the environment client ID and secret from Access Management',
        'With the client ID and secret of a client application in Exchange',
      ],
      answer: 0,
      explain: 'The CLI page says that, as part of MFA enablement, the only way to use Anypoint CLI is through Connected Apps. A service user with a password still signs in with user credentials, which MFA blocks for a job. Environment client credentials and Exchange client applications are for other purposes, not CLI sign-in.',
    },
  ],
  description: `
An airline keeps its Mule runtimes on-premises for data residency reasons, and manages them from Runtime Manager. There are four servers, and Sandbox and Production environments.

| App | Behaviour |
|---|---|
| \`crew-roster-api\` | Stateless REST API |
| \`baggage-events\` | Scheduler and listener; two nodes must not process the same work |

Questions from a design review:
- Should each app go on a server group or a cluster?
- Servers get their addresses from DHCP, and the network team blocks multicast.
- The team sets properties in Runtime Manager, and sometimes the change seems to be ignored.
- Monitoring shows only one of the four servers.
- A new environment was created with the wrong type by mistake.
- The team wants scripts, not clicks, for promoting API instances and listing contracts.

**Questions**
1. How do you register a server? What are servers, server groups and clusters?
2. Which target suits each app, and what do the network facts change?
3. How do properties work in hybrid deployments?
4. Explain environment types and the mistake.
5. What can Anypoint CLI and the platform APIs do, and how should a script authenticate?
`,
  answerTemplate: `## Servers, groups and clusters

## Target for each app

## Properties

## Environments

## Anypoint CLI and platform APIs
`,
  keyPoints: [
    'Register a Mule server with the Runtime Manager agent, using the amc_setup command that Runtime Manager generates.',
    'A server group is one deployment target with isolated app instances. A cluster has up to eight servers, whose instances share information and synchronize; if one fails, another takes over.',
    'All servers in a group or cluster need the same Mule runtime, Runtime Manager agent and Java versions.',
    'Unicast needs fixed IP addresses; multicast needs one network segment and a network that allows it.',
    'Settings page properties override properties in the file, and changes need a restart of the app and any group or cluster.',
    'Environment types are production, sandbox and design. The type cannot be changed after creation.',
    'Install the Anypoint Monitoring agent on each server in a group or cluster.',
    'Anypoint CLI (anypoint-cli-v4) scripts the platform. Use connected apps. Precedence: command line, environment variables, configuration file.',
  ],
  solution: `
**1. Servers, groups and clusters.** In Runtime Manager, choose **Servers > Add Server** and enter a name. Runtime Manager generates an \`amc_setup\` command with a registration token for your organization and environment. Run it to configure the agent on the server. A server belongs to one environment and is visible only there. You can then deploy to the server, or add it to a group or cluster.

| | Server group | Cluster |
|---|---|---|
| Deployment target | One | One |
| App instances | Isolated | Aware of each other, share information |
| If a server fails | Redundancy: the app is also on other servers | Another server takes over processing |
| Size | Not stated on the page | Up to eight servers |

**2. Target for each app.**
- \`crew-roster-api\` is stateless, so a **server group** behind a load balancer gives redundancy without coordination.
- \`baggage-events\` has concurrency concerns, and the docs suggest clusters for those, so use a **cluster**.

The network facts decide the cluster type. Multicast is blocked, so the cluster must be **unicast**. Unicast identifies a node by IP address, so IP addresses cannot be assigned dynamically with DHCP. If a restarted server gets a new address, you must add it to the cluster again with that address. So ask for fixed addresses. Keep nodes on one subnet or in one availability zone, because clustering relies on high-speed connectivity.

**3. Properties.** You can bundle a properties file in the app and add environment-specific values in Runtime Manager. The **Settings** page values override the file. Any change needs a **restart** of the app and of any group or cluster it runs on, which explains the "ignored" changes. Values are sent over HTTPS and stored encrypted, and are displayed only on the Settings page.

**4. Environments.**
- **Production:** deploy apps and APIs publicly.
- **Sandbox:** development and test.
- **Design:** used by Design Center. Only applications deployed from Design Center can target it.

You **cannot change the type** after an environment is created, so create a new one with the right type and move the work. Users cannot be added to an environment directly; you grant access with role permissions. Each environment has its own client ID and secret. Apps can be promoted from a sandbox to production without uploading them again.

**Monitoring.** The Anypoint Monitoring agent must be installed on **each** server in a group or cluster, which explains why only one server shows data.

**5. CLI and APIs.** \`anypoint-cli-v4\` covers accounts, API Manager, Design Center, governance, CloudHub and more. Examples:
- \`api-mgr:api:promote\` with \`--copyPolicies\`, \`--copyTiers\` and \`--copyAlerts\`.
- \`api-mgr:contract:list\`.
- \`api-mgr:api:autodiscovery\` lists the properties a gateway needs.
- \`governance:api:validate\` checks a spec against rulesets.

Authenticate with a **connected app**. Its client ID and secret can be in a configuration file, environment variables or command-line flags, in that increasing order of priority.

The platform also offers REST APIs, such as the Exchange API, Runtime Manager REST services and the Anypoint Monitoring Metrics API. A connected app gets a bearer token from \`/accounts/api/v2/oauth2/token\`, limited to its scopes, business groups and environments. API Manager control plane endpoints have rate limits per client IP and return 429 when exceeded, so scripts should back off.
`,
  followUps: [
    {
      q: 'Is the Distributed option of a rate-limiting policy useful on a server group?',
      a: 'No. Quotas are shared only in a Mule HA cluster. On a server group, each node enforces the quota on its own.',
    },
    {
      q: 'Which alerts can be set for hybrid servers?',
      a: 'Runtime Manager offers server CPU, memory, load average (not on Windows) and thread count, plus connection events for servers, groups and clusters, such as Server disconnected and Cluster presents visibility issues.',
    },
    {
      q: 'Can anyone switch off a Runtime Manager alert?',
      a: 'Yes. The docs say all users of Anypoint Platform, even those without permission to create alerts, can switch an alert on or off, and the change applies to everyone who receives it.',
    },
    {
      q: 'Where do CloudHub 2.0 and Runtime Fabric fit?',
      a: 'They are other deployment targets in Runtime Manager. Server groups and clusters are for hybrid and Private Cloud Edition servers.',
    },
  ],
}
