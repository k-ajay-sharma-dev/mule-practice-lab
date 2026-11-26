export default {
  id: 'ms-174',
  category: 'mulesoft',
  title: 'Runtime Fabric Lifecycle: Leaving the Appliance, rtfctl or Helm, the Agent 3.0 Upgrade, Downgrades and Mule Image Patches',
  level: 'ADVANCED',
  tags: ['deployment', 'runtime-fabric', 'kubernetes', 'helm', 'rtfctl', 'upgrade', 'operations', 'environments'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'A customer still runs Runtime Fabric appliance on VMs and has no Kubernetes team. What does the migration page recommend considering first if they want the lowest operational overhead?',
      options: [
        'CloudHub 2.0, which has the lowest operational overhead',
        'Staying on the appliance, which has the lowest overhead on VMs',
        'Standalone Mule, which has the lowest management overhead',
        'Runtime Fabric on a managed Kubernetes service, for the lowest overhead',
      ],
      answer: 0,
      explain: 'MuleSoft will stop investing in the appliance. Existing Core capacity can move to other customer-hosted options, and customers with Flexible Hybrid Deployment rights can convert Cores to vCores for CloudHub 2.0. Standalone is described as having reduced runtime resiliency and heavy management overhead.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A cluster was installed with `rtfctl`. The team wants to use `helm upgrade` for the next agent version. What must happen first?',
      options: [
        'Migrate the installation to Helm with `rtfctl migrate`',
        'Nothing; `helm upgrade` adopts the `rtfctl` install on first run',
        'Reinstall the fabric and redeploy every app',
        'Run `helm upgrade` with the `--reuse-values` flag',
      ],
      answer: 0,
      explain: 'The migration needs `rtf-agent` at v2.2.5 or above and `rtfctl` at 1.0.10 or later. Helm upgrades are not available for existing installations that used `rtfctl`. The migrate command is the documented route for bring-your-own-Kubernetes clusters.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Before `rtfctl migrate` runs on the production AKS cluster, the change board asks what the command will touch. Which statements about it are correct?',
      options: [
        'Backs up the current installation to the named tarball',
        'Uninstalls only the previous runtime-fabric Helm chart',
        'Regenerates activation data for the fabric ID',
        'Deletes the `custom-properties` secret so that the Helm-managed install can recreate it',
        'Upgrades Runtime Fabric to the latest version',
        'Deletes and recreates the rtf namespace for the Helm install',
      ],
      answer: [0, 1, 2, 3],
      explain: 'It does not change the version, does not update Mule app deployments, and leaves the rtf namespace and configuration in place. If it fails, restore from the backup with `rtfctl restore`, then retry.',
    },
    {
      type: 'single',
      prompt: 'An engineer changed the proxy values after installing with Helm. What is the risk during an upgrade with the command Runtime Manager supplies?',
      options: [
        'It reuses the original install values, so later changes are lost',
        'None; Helm reads the live values from the cluster',
        'It applies the chart defaults, so all custom values are lost',
        'The upgrade refuses to run while a proxy is set',
      ],
      answer: 0,
      explain: 'Later changes must be added to the upgrade, or they are not kept. The Helm upgrade page carries this as an important note. Generate the `values.yml` as instructed and add anything changed since install.',
    },
    {
      type: 'order',
      prompt: 'A fabric on agent 2.11 uses the log forwarder DaemonSet. Order the documented preparation for an upgrade to 3.0.0.',
      items: [
        'Enable application-scoped log forwarding through the Runtime Fabric API, if it was disabled',
        'Redeploy every application that forwards logs through the DaemonSet',
        'Remove the log forwarder DaemonSet through the Runtime Fabric API',
        'Verify that logs are visible in Anypoint Monitoring and `am-log-forwarder` is gone',
        'Upgrade Runtime Fabric to 3.0.0',
      ],
      explain: 'Agent 3.0.0 removes DaemonSet log forwarding; logs travel only through a sidecar in each replica. Skipping these steps may disrupt log forwarding.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each telemetry setup to the sidecar resources to plan per replica on agent 3.0.0.',
      pairs: [
        ['Metrics only', '0.05 vCPU and 90 MiB'],
        ['Metrics and logs', 'Up to 30% of the replica CPU limit and up to 150 MiB'],
        ['Metrics, logs and traces', 'Up to 30% of the replica CPU limit and up to 240 MiB'],
      ],
      explain: 'All telemetry goes through a single sidecar per replica. Allocate cluster capacity for it to avoid deployment failures.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'After a component upgrade with `rtfctl`, the fabric reports "degraded" in Runtime Manager. What should the on-call engineer expect?',
      options: [
        'It is normal while it syncs, and clears in about five minutes',
        'The upgrade failed, so restore a backup at once',
        'A node must be added before the status clears',
        'The apps must be redeployed to resync with the control plane',
      ],
      answer: 0,
      explain: 'The fabric synchronizes with the control plane after the upgrade. The upgrade usually takes fewer than 10 minutes, a disconnect during it is restored afterwards, and component upgrades do not require adding a node.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A new Mule date-patch is out, and last night the team upgraded the Runtime Fabric agent on the production cluster. What is true of the 120 running apps this morning?',
      options: [
        'The agent upgrade moved all replicas to the new Mule image',
        'Replicas restart one by one onto the patch in the next window',
        'They still run their old Mule image until each one is redeployed',
        'They are patched automatically, as CloudHub 2.0 apps are',
      ],
      answer: 2,
      explain: 'Mule deployments on Runtime Fabric are not automatically patched. Update in a sandbox environment first, then redeploy. An upgrade of the Runtime Fabric agent and a patch of the Mule runtime image are two separate activities, so the agent upgrade did not touch the apps. Automatic upgrades are a CloudHub behaviour, not a Runtime Fabric one.',
    },
  ],
  description: `
A manufacturer runs **two Runtime Fabric clusters on AKS**, including production, installed with \`rtfctl\` on agent 2.11. A third, older site is still on **Runtime Fabric appliance**. The platform team has to produce a lifecycle plan for the next year:

- Decide what to do with the appliance site. The local team has no Kubernetes experience.
- Move the AKS clusters to Helm management and to agent 3.0.
- Plan a monthly Mule patching routine for 120 apps.
- Understand what changes for logging and for capacity in agent 3.0.
- Write a rollback plan for an agent upgrade.

**Questions**
1. What are the appliance options, and how does licensing move?
2. What is the route from \`rtfctl\` to Helm, and what does it change?
3. How do you upgrade with each tool? What must be done before agent 3.0.0?
4. How does telemetry change capacity planning?
5. How do you downgrade?
6. How do agent upgrades differ from Mule runtime patches?
`,
  answerTemplate: `## Appliance options

## From rtfctl to Helm

## Upgrading the agent

## Capacity after 3.0

## Downgrade plan

## Mule patches
`,
  keyPoints: [
    'MuleSoft is moving away from the appliance. Options are CloudHub 2.0, Runtime Fabric on a public cloud or OpenShift, or standalone Mule.',
    'Core capacity can move to other customer-hosted options, subject to licence limits; Flexible Hybrid Deployment rights allow conversion to vCores.',
    'Upgrade routes: `rtfctl`, Helm, or the OpenShift console. Helm upgrades are not available for rtfctl-installed fabrics until they are migrated.',
    '`rtfctl migrate` requires agent 2.2.5 or above and rtfctl 1.0.10 or later. It does not change the version.',
    'Runtime Manager generates the Helm upgrade command from install-time values. Add anything changed later.',
    'With rtfctl, upgrade components in Runtime Manager, then the utility. Try it first on a non-production fabric, at a time with no deployments.',
    'Agent 3.0.0 removes DaemonSet log forwarding. Migrate before upgrading.',
    'From 3.0.0 a single sidecar per replica carries all telemetry; size it per the table.',
    'Downgrade: a PATCH request for rtfctl fabrics, `helm upgrade --version` for Helm fabrics, plus extra log forwarding steps and a redeploy of apps.',
    'Mule patches on Runtime Fabric need a redeploy. New date-patches appear monthly. Build tags can pin a version from Mule 4.5.',
  ],
  solution: `
**1. Appliance.** MuleSoft says it will stop investing in the appliance and asks customers to migrate before the EOL deadlines. With no Kubernetes skills at that site, CloudHub 2.0 has the lowest operational overhead, if the data can leave the site. Runtime Fabric on a managed Kubernetes platform or OpenShift keeps it customer-hosted. Standalone Mule stays possible, but the docs warn of reduced runtime resiliency and heavy management overhead. Licensed Core capacity can move to any customer-hosted option, subject to total licence limits, and customers with Flexible Hybrid Deployment rights can convert Cores to vCores.

**2. rtfctl to Helm.** For a bring-your-own-Kubernetes cluster with agent 2.2.5 or above and \`rtfctl\` 1.0.10 or later, you run:

\`\`\`bash
rtfctl migrate previous-rtf-bkp.tar.gz --organizationId <orgId> --fabricId <fabricId> --token <token> --host anypoint.mulesoft.com --confirm
\`\`\`

It backs up the install, removes only the old chart, regenerates activation data, deletes the \`custom-properties\` secret and reinstalls with Helm at the same version. Ingress templates, Persistence Gateway, custom resources and proxy values should stay intact: verify that afterwards, and verify in Runtime Manager that the fabric is Helm managed. If it fails, use \`rtfctl restore\` with the backup and retry.

**3. Upgrades.**
- *rtfctl:* in Runtime Manager select **Upgrade to vx.x**, wait for **Active**, then update the utility. Do this on a non-production instance first, and at a time when the team is not deploying.
- *Helm:* run the command Runtime Manager supplies to generate \`values.yml\`, add optional values and any changes made since install, run \`helm repo update\`, then \`helm upgrade --install runtime-fabric rtf/rtf-agent --version <VERSION_FROM_UI> -f values.yaml -n <namespace>\`.
- *OpenShift:* use the OpenShift console.

Before 3.0.0, complete the log forwarding migration in the correct order. Check the supported Kubernetes versions in the 3.x release notes: for example, 3.0.38401 supports 1.33 to 1.36.

**4. Capacity.** Each replica now carries one sidecar for metrics, logs and traces. With logs enabled, plan up to 30% of the replica CPU limit and up to 150 MiB, or 240 MiB with traces. On a tightly packed cluster this can cause deployment failures, so check headroom before the redeployments that the migration requires. Rolling updates also need one additional replica's worth of resources while they run.

**5. Downgrade.** For rtfctl-installed fabrics, send a PATCH request with the target version. For Helm fabrics, run \`helm upgrade --install\` with the older \`--version\`. If you use Anypoint Monitoring log forwarding, turn daemon-set forwarding back on as the downgrade page describes. Apps that were redeployed on the newer agent must be redeployed again, to reduce their resource allocation. The downgrade page is written for version 2.x, so confirm the path with MuleSoft Support before you promise a rollback from 3.0 in a change record.

**6. Mule patches.** Agent upgrades change the fabric's own services. Mule patches change the runtime image of each app. MuleSoft releases date-patches monthly, but Runtime Fabric does not apply them: you select the new version and redeploy, sandbox first. If you need control over the exact image, pass the build tag. A wrong, invalid or unsupported tag makes the deployment fail.
`,
  followUps: [
    {
      q: 'Which is the right moment to back up?',
      a: 'Keep hourly backups as recommended, and take one right before any upgrade. The migration creates its own tarball too, but agent upgrades made after a backup are not restored from it, so a restore may need them reapplied.',
    },
    {
      q: 'Does the upgrade affect existing metrics?',
      a: 'Backup and restore, Runtime Fabric upgrades and OS patching of nodes do not affect or restore existing metrics data.',
    },
    {
      q: 'Is there anything special on OpenShift?',
      a: 'Yes. The upgrade uses the OpenShift console, and upgrading from 2.6.52 or earlier to 2.7.0 or later needs a manual update of the `rtfd` container resources first. `rtfctl migrate` targets BYOK clusters installed with rtfctl.',
    },
    {
      q: 'What if you use a private registry?',
      a: 'The 3.x release notes require customers with a private registry to synchronize the `rtf-mule-actions` image, and each release lists the image versions to mirror.',
    },
  ],
}
