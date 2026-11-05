export default {
  id: 'ms-140',
  category: 'mulesoft',
  title: 'Registering Standalone Mule with Runtime Manager: amc_setup, the Agent and What Survives a Control Plane Outage',
  level: 'INTERMEDIATE',
  tags: ['deployment', 'hybrid', 'on-prem', 'runtime-manager', 'agent', 'environments'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'What is the difference between an unregistered on-premises runtime and a Hybrid Standalone runtime?',
      options: [
        'Both are Mule on hosts you control, but a Hybrid Standalone runtime is registered with Runtime Manager through the agent',
        'Hybrid Standalone runs on MuleSoft-owned servers',
        'Only an unregistered runtime can run several apps',
        'A Hybrid Standalone runtime has no `$MULE_HOME`',
      ],
      answer: 0,
      explain: 'Registration is optional. An unregistered runtime does not depend on Runtime Manager to start or to deploy JARs; you copy them to `$MULE_HOME/apps`.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'One server runs test apps and the team also wants to see it in the Production environment. What do the docs say?',
      options: [
        'Do not do it: a Mule runtime must not be registered with more than one business group or environment, or more than once',
        'Run `amc_setup` twice, once with each token',
        'Add a second environment name to `mule-agent.yml`',
        'Run the agent in a separate JVM for the second environment',
      ],
      answer: 0,
      explain: 'The registration token identifies a specific environment in a specific business group. The docs also note that the agent cannot run in a separate JVM.',
    },
    {
      type: 'single',
      prompt: 'A firewall team refuses any new inbound rule from the internet. Standalone Mule servers in the data centre must be managed by Runtime Manager through the agent. Can that work?',
      options: [
        'Yes, because all connectivity requirements are outbound from your network',
        'No, because Runtime Manager opens an inbound connection for every deployment',
        'No, because the agent needs an inbound port for its WebSocket connections',
        'Yes, but only with a proxy that intercepts the Runtime Manager certificate',
      ],
      answer: 0,
      explain: 'No inbound connectivity to your servers is required, so a server in a data centre can be managed without opening inbound firewall rules. The agent keeps persistent WebSocket connections open and authenticates to the Runtime Manager endpoints with mutual TLS. A proxy that intercepts the Runtime Manager certificate breaks the connection, and the troubleshooting page says to check for that.',
    },
    {
      type: 'single',
      prompt: 'During a link failure Runtime Manager cannot be reached from the data centre. What happens to traffic on the running Mule apps?',
      options: [
        'Apps keep serving; the control plane is not in the request path, but new or updated policies are not pulled until the connection returns',
        'Apps stop within a few minutes because the agent cannot heartbeat',
        'Apps keep running only if they have no API Manager policies',
        'The runtime restarts and waits for the control plane',
      ],
      answer: 0,
      explain: 'Management is lost for the duration, for example deployments from Runtime Manager, but not runtime traffic.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each agent task to the documented way of doing it.',
      pairs: [
        ['First registration from a bundled agent', '`$MULE_HOME/bin/amc_setup -H <token> <server-name>`'],
        ['Update the agent and keep the current configuration', '`amc_setup -U`, with no other parameters'],
        ['Configure JMX monitoring for external services', 'Edit `$MULE_HOME/conf/mule-agent.yml` manually'],
        ['Collect information for a support ticket on Linux', '`$MULE_HOME/bin/amc_debug`'],
      ],
      explain: 'An agent update stops Mule first and restarts it afterwards. After updating the agent, you must also uninstall and reinstall the Anypoint Monitoring agent.',
    },
    {
      type: 'single',
      detail: true,
      prompt: '`$MULE_HOME/conf/mule-agent.yml` is found empty after a disk incident and no backup exists. What is the documented recovery?',
      options: [
        'Remove the server from Runtime Manager, uninstall the agent, update it to the latest supported version, and add the server again',
        'Create an empty file, because the agent regenerates defaults at startup',
        'Copy the file from another server unchanged',
        'Run `amc_setup -U`, which rebuilds the file',
      ],
      answer: 0,
      explain: 'If a backup exists, restore it. `-U` retains the existing file, so it does not help when that file is the problem.',
    },
  ],
  description: `
An insurer is bringing six Linux servers in its data centre under Runtime Manager. They run Mule 4 standalone and today the operations team deploys by copying JARs to \`$MULE_HOME/apps\`. Two servers are for test and four for production.

The team has these questions:

- The firewall team refuses any new inbound rule from the internet. Can Runtime Manager still manage the servers?
- One test server is occasionally used to rehearse production releases, so a developer suggests registering it in both environments.
- The risk team asks what happens to claims traffic if Anypoint Platform is unreachable for an hour.
- The servers go through a corporate proxy, and the last proxy change affected other Java apps.
- Who owns agent upgrades, and what else must be done when the agent changes?

**Questions**
1. What changes when you register a standalone runtime, and what stays the same?
2. How do you register a server, and what are the rules?
3. What does the network need?
4. Answer the risk team.
5. Describe the agent's life after installation: configuration, updates and troubleshooting.
`,
  answerTemplate: `## What registration changes

## Registering a server

## Network

## Control plane outage

## Operating the agent
`,
  keyPoints: [
    'Registration is optional. A registered runtime is a Hybrid Standalone runtime, managed by Runtime Manager; you still own the host.',
    'The agent is a plugin in the Mule JVM and is bundled with the runtime. It cannot run in a separate JVM.',
    'amc_setup -H <token> <server-name> registers Mule. The token identifies one environment in one business group.',
    'Do not register a runtime twice, or with more than one business group or environment.',
    'Connectivity is outbound only, over persistent WebSocket connections, with mutual TLS to the Runtime Manager endpoints.',
    'The control plane is not in the request path: apps keep serving, but new or updated policies are not pulled until the connection returns.',
    'amc_setup creates mule-agent.yml. Rerun amc_setup or edit the file to change configuration; some options exist only in the file.',
    'amc_setup -U updates the agent and retains mule-agent.yml. Anypoint Monitoring then has to be uninstalled and reinstalled.',
  ],
  solution: `
**What registration changes.** Mule keeps running on your host, in your \`$MULE_HOME\`. Registration adds central management: deployment, status, monitoring and alerts through Runtime Manager. The agent is a plugin that exposes the Mule Java API as a service, and the docs say it cannot run in a separate JVM. Without registration, you still have a working runtime: it starts and deploys JARs without Runtime Manager.

**Registering a server.**
1. In Runtime Manager, select the correct environment, open **Servers**, click **Add Server** and enter a unique name.
2. Copy the generated registration token. It identifies a specific environment for a specific business group.
3. Run \`$MULE_HOME/bin/amc_setup -H <token> <server-name>\`, then start Mule.

\`amc_setup\` creates \`$MULE_HOME/conf/mule-agent.yml\`. Your enterprise licence must be current.

Rules: do not register Mule more than once, and do not register a runtime with more than one business group or environment. So the suggestion for the rehearsal server is rejected. Use a separate production-like server in the right environment.

**Network.** All requirements are outbound from your network, and no inbound connectivity is required, so the firewall team's rule can stay. The agent keeps persistent WebSocket connections and uses mutual TLS with the Runtime Manager endpoints. Allow the hostnames listed for your control plane region. For the proxy, register with the \`--proxy\` option and verify that the proxy does not modify the Runtime Manager certificate, because that is a documented check when the agent cannot connect.

**Control plane outage.** The control plane is not in the request path, so claims traffic carries on. Expect no deployments or status from Runtime Manager during the outage, and note that new or updated policies are not pulled until the connection returns. Tell the risk team that management, not processing, is what they lose.

**Operating the agent.**
- *Configuration:* rerun \`amc_setup\`, or edit \`mule-agent.yml\`. Some options, such as extending JMX monitoring to external services, are only available in the file.
- *Compatibility:* the agent version must support your Mule and Runtime Manager versions, so check the agent release notes.
- *Updates:* stop Mule, extract the agent setup zip to \`$MULE_HOME/bin\`, run \`amc_setup -U\` and restart. The script backs up the old agent to \`$MULE_HOME/tools\` and keeps \`mule-agent.yml\`. Then uninstall and reinstall the Anypoint Monitoring agent.
- *Troubleshooting:* check the JVM, the agent version, licence and certificate expiry, connectivity to the allowed hosts, and that \`mule-agent.yml\` is not corrupted or empty. On Linux, \`amc_debug\` collects evidence for Support.
- *Logs:* the agent writes to \`mule_agent.log\` by default. A \`mule-agent-appender\` in \`$MULE_HOME/conf/log4j2.xml\` can redirect it.
`,
  followUps: [
    { q: 'How long is the agent key pair valid?', a: 'Two years. It is stored in $MULE_HOME/conf/mule-agent.jks, and the connection with Runtime Manager ends when it expires. It can be renewed from Runtime Manager before expiry, followed by a manual runtime restart.' },
    { q: 'Can a server be registered in Runtime Manager and also be managed by the old Mule Management Console?', a: 'No. The docs say to unregister it from MMC before running amc_setup.' },
    { q: 'Which system would you pick for one host that nobody needs to manage centrally?', a: 'An unregistered runtime works, with JARs copied to $MULE_HOME/apps. You lose Runtime Manager deployment, status and alerts, so it suits only small or isolated estates, such as an air-gapped host.' },
  ],
}
