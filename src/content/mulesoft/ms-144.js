export default {
  id: 'ms-144',
  category: 'mulesoft',
  title: 'Releasing to Customer-Hosted Mule: In-Place or Side-by-Side, Hot Deployment, Cluster Staging and Deploy-Time Properties',
  level: 'ADVANCED',
  tags: ['deployment', 'hybrid', 'on-prem', 'clustering', 'zero-downtime', 'environments'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'A team claims that deploying through Runtime Manager to a cluster gives a rolling release, with one node ready before the next one starts. What do the docs say?',
      options: [
        'Artifacts are staged to nodes sequentially, but that does not guarantee the app starts on one node before another; startup and readiness have no fixed order and can overlap',
        'Yes, each node waits until the previous one reports healthy',
        'All nodes always restart at the same moment',
        'Only the primary node gets the new version',
      ],
      answer: 0,
      explain: 'Do not design your release around an ordering the platform does not promise. If a release needs strict control, use a side-by-side environment and move traffic at the load balancer.',
    },
    {
      type: 'single',
      prompt: 'What makes a deployment zero-downtime in the on-premises HA guide?',
      options: [
        'A side-by-side approach: a new environment takes a small share of traffic, which grows until it is the new baseline and the old one is terminated',
        'Copying the JAR over the old one in `$MULE_HOME/apps`',
        'Using a cluster, which removes the need for any other step',
        'Setting `mule.deployment.parallel`',
      ],
      answer: 0,
      explain: 'An in-place deployment can reduce capacity or cause complete downtime. Side-by-side temporarily adds capacity, which is the cost.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about hot deployment on a standalone runtime are documented?',
      options: [
        'Mule checks `$MULE_HOME/apps` for updated configuration files every three seconds',
        'Touching an app\'s anchor file reloads it',
        '`mule.deployment.forceParseConfigXmls=true` is needed to pull changes from an app\'s configuration files',
        'Validations that run during packaging are not executed when you force a redeploy by editing configuration files',
        'A hot deployment keeps serving from the old version until the new one is ready',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The docs do not make the last promise. Treat hot deployment as a convenience, not as a zero-downtime strategy, and be wary of editing production files outside your pipeline.',
    },
    {
      type: 'single',
      prompt: 'How do you confirm that `stockTrader.jar` copied to `$MULE_HOME/apps` was deployed?',
      options: [
        'Status `DEPLOYED`, an unpacked `apps/stockTrader` folder and an anchor file `apps/stockTrader-anchor.txt`',
        'The JAR remains in `/apps` with a `.deployed` suffix',
        'A new line in `wrapper.conf`',
        'An entry in `mule-agent.yml`',
      ],
      answer: 0,
      explain: 'Mule unpacks the app, removes the original JAR after a successful deploy, and creates the anchor file.',
    },
    {
      type: 'single',
      prompt: 'The same property `db.host` is in the bundled YAML file, set with `-M-Ddb.host=...` at start-up, and in the app\'s deployment properties. Which value wins?',
      options: [
        'The deployment property, then the system property, then the application property',
        'The bundled YAML, because it is closest to the app',
        'The system property, which beats everything',
        'The last one read at startup',
      ],
      answer: 0,
      explain: 'The hierarchy is deployment, system, environment, application, then global properties.',
    },
    {
      type: 'single',
      prompt: 'A cluster needs one more node during business hours. It is a unicast cluster. What should you plan for?',
      options: [
        'Adding a server triggers an automatic restart of all existing servers, so use a maintenance window',
        'Nothing: nodes join without any effect',
        'A rebuild of the cluster, because nodes can only be added at creation',
        'Removing the apps first',
      ],
      answer: 0,
      explain: 'Removing a server from a unicast cluster also restarts the remaining servers. Multicast clusters can add nodes dynamically, but many networks block multicast.',
    },
    {
      type: 'match',
      prompt: 'Match each hybrid limit to its value.',
      pairs: [
        ['Maximum servers per cluster', '8'],
        ['Maximum servers per server group', '20'],
        ['Tested recommended deployments per hybrid target', '200'],
        ['Tested recommended properties per application', '300'],
      ],
      explain: 'The first two are hard limits; the others are tested and recommended. A target can be a server, a server group or a cluster.',
    },
  ],
  description: `
A utilities company runs its customer APIs on a three-node Hybrid Standalone cluster behind an F5 load balancer. Releases currently happen on Sunday nights with a four-hour outage window. The business now wants weekday releases with no visible interruption. The company has these proposals:

- **Operations:** "Runtime Manager deploys to one node at a time, so a cluster is already a rolling release."
- **A developer:** "Let's edit the XML under \`$MULE_HOME/apps\`, because Mule hot-deploys it within seconds."
- **The architect:** "Build a second environment and shift traffic gradually with the F5."

The team also wants one artifact for all environments, with database hosts and credentials set at deployment. They have asked how a property change takes effect on a cluster, and whether adding a fourth node needs an outage.

**Questions**
1. Evaluate each proposal.
2. Describe the side-by-side release step by step, and its limits.
3. What must apps do to support two versions running at once?
4. How do you supply environment-specific values, and which value wins?
5. What cluster changes need a maintenance window?
`,
  answerTemplate: `## Evaluating the proposals

## Side-by-side release

## Application requirements

## Deploy-time properties

## Cluster changes
`,
  keyPoints: [
    'Runtime Manager stages artifacts sequentially, but startup across cluster nodes has no fixed order and can overlap.',
    'Hot deployment polls every three seconds, reloads on a touched anchor file, and skips packaging validations for edited configuration files. It is not a zero-downtime strategy.',
    'The documented zero-downtime model is side-by-side: shift traffic gradually, promote the new environment, and terminate the old baseline.',
    'An on-premises cluster has no built-in load balancer or virtual IP, so traffic shifting is done by your own load balancer.',
    'Keep integrations stateless and externalise state, so two environments can run together.',
    'Precedence: deployment, system, environment, application, then global properties.',
    'After changing properties on a deployed app, restart the app and any server group or cluster where it is deployed.',
    'Adding or removing a server in a unicast cluster restarts all existing servers. Plan a maintenance window.',
  ],
  solution: `
**Evaluating the proposals.**
- **Operations:** not safe as stated. The HA guide says Runtime Manager stages artifacts to cluster nodes sequentially, but this does not guarantee that the app starts on one node before another. Startup and readiness can overlap. A cluster gives availability when a node fails, not a controlled rollout.
- **The developer:** reject for production. Hot deployment exists: Mule checks \`$MULE_HOME/apps\` every three seconds, and touching the anchor file reloads the app. But the docs do not offer it as a zero-downtime method, it needs \`mule.deployment.forceParseConfigXmls=true\` to pull configuration changes, and packaging validations do not run. On a cluster it would also change one node's files at a time, outside your pipeline.
- **The architect:** this matches the documented zero-downtime model.

**Side-by-side release.**
1. Treat the current environment as the baseline.
2. Create a new environment with the changes: new apps, configuration or runtime version.
3. Route a small percentage of traffic to it at the F5.
4. Increase the share as confidence grows, while the baseline keeps serving.
5. Send all traffic to the new environment and make it the baseline.
6. Terminate the previous baseline.

Rolling back is a load balancer change until you remove the old environment. The cost is temporary extra capacity and licensing for minutes, hours or days. An on-premises cluster has no virtual IP or load balancer of its own, so this all depends on the F5.

**Application requirements.** The HA guide's best practice is stateless integrations with state in an external store. Both versions run at once, so API contracts and database changes must stay backward compatible during the shift. Scheduled and polling work needs particular care: the Scheduler runs on the primary node of **each** cluster, so two environments mean two schedulers unless the new one starts with them disabled. Note that Object Store persistence does not support sharing the same database across different clusters.

**Deploy-time properties.** Keep defaults in a YAML file in the app, and override them per environment. Runtime Manager's **Properties** tab has the deployment values, which override the bundled file. Values are encrypted in transit and at rest in Runtime Manager. Alternatives are an external properties file, or \`-M-D\` system properties, as in \`mule -M-Denv=prod\`, which are held only in memory and must be provided each time.

The hierarchy is: deployment, system, environment, application, then global properties. After changing a property on a deployed app, you must restart the app and any server group or cluster where it is deployed, so a property change is also a release event.

**Cluster changes.**
- Adding or removing a server in a unicast cluster triggers a restart of all existing servers.
- Deleting a cluster restarts its servers and removes the apps deployed on them.
- Never restart several nodes at once, for example during OS patching: this can trigger membership eviction and take apps offline.
- All nodes need identical Mule, agent and Java versions.

So a fourth node on a unicast cluster needs a maintenance window. The second environment can take the traffic during that window, which is a further benefit of the architect's proposal.
`,
  followUps: [
    { q: 'When is a server group a better target than a cluster?', a: 'When apps are stateless and need no shared memory, because instances run in isolation. It offers up to 20 servers with one deployment target. If you see concurrency problems such as duplicate file processing, the docs point to a cluster.' },
    { q: 'Can a domain be deployed from Runtime Manager as part of this release?', a: 'No. Domain projects cannot be installed using Runtime Manager. You copy the domain JAR to $MULE_HOME/domains on each host, and it must be in place before its apps start.' },
    { q: 'Does a cluster copy my app to all nodes by itself?', a: 'No. Clusters do not distribute artifacts to nodes. You deploy the same app to each node, or do it through Runtime Manager.' },
  ],
}
