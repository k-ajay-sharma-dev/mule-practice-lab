export default {
  id: 'ms-142',
  category: 'mulesoft',
  title: 'Upgrading and Patching On-Premises Mule: the Upgrade Tool, Config Conflicts, Clusters and Rollback',
  level: 'ADVANCED',
  tags: ['deployment', 'on-prem', 'upgrade', 'patching', 'clustering', 'operations'],
  estMinutes: 25,
  quiz: [
    {
      type: 'single',
      prompt: 'The Mule upgrade tool is a command-line utility that updates standalone on-premises Mule 4 instances. A team wants to apply the latest cumulative patch with it. What must it give the tool as the new distribution?',
      options: [
        'The full runtime distribution, unpacked',
        'The full runtime distribution, still packed',
        'The patch file for the new version, unpacked',
        'A copy of the current `$MULE_HOME` directory',
      ],
      answer: 0,
      explain: 'The tool needs the full runtime distribution, unpacked, with `distribution` and not `patch` in the file name. It also needs a stopped Mule instance, the latest version of the tool, at least 2 GB of free disk space and no blank spaces in `$MULE_HOME` or the new distribution path. Paths with blank spaces make it exit with an error. Apps do not need removing, because the tool does not modify the Mule apps running on the runtime.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'The Anypoint Monitoring agent is installed on the server. What do you do about it?',
      options: [
        'Uninstall it before the upgrade and reinstall it afterwards, because the tool does not support upgrading it',
        'Nothing: the tool upgrades it with the Runtime Manager agent',
        'Stop it and let the tool restart it',
        'Delete `mule-agent.yml`',
      ],
      answer: 0,
      explain: 'The Runtime Manager agent is different: if it is installed, the tool updates its version during the upgrade.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'Why rename the `$MULE_HOME` directory before running the tool, if you rename it at all?',
      options: [
        'Renaming it after the upgrade makes Anypoint Monitoring stop working, which needs an uninstall and reinstall to restore',
        'The tool only accepts the name `mule`',
        'The licence is bound to the directory name',
        'A rename after the upgrade removes the backup',
      ],
      answer: 0,
      explain: 'The docs suggest a generic name or one that matches the target version. You may also leave the name unchanged. A stable symlink such as `/opt/mule` is another way to keep scripts simple.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'The upgrade fails with an error naming `wrapper.conf` as a conflict. What has happened?',
      options: [
        'The tool could not merge the local and new versions of the file automatically, so you review it in `to_review`, put the result in `ready`, and run the upgrade again',
        'The upgrade is finished but custom settings are lost',
        'The file is corrupt and must be deleted',
        'The tool has rolled back and cannot be used for this instance',
      ],
      answer: 0,
      explain: 'The tool compares configuration files between distributions. Conflicting files are copied under `${MULE_HOME}/upgrade-tool`, and the docs warn that discarding the new changes can leave you on deprecated settings.',
    },
    {
      type: 'order',
      prompt: 'Order the steps for upgrading one standalone server.',
      items: [
        'Download the latest upgrade tool and the full target distribution, and unpack the distribution',
        'Uninstall the Anypoint Monitoring agent if it is installed',
        'Stop Mule and confirm with `mule status`',
        'Rehearse with the `--dry-run` option',
        'Run `upgrade-tool upgrade -n <newMuleDistributionPath>` from `$MULE_HOME/tools`',
        'Start Mule, verify the apps, and reinstall the Anypoint Monitoring agent',
      ],
      explain: 'The dry run simulates the upgrade without permanent changes to the distribution, so conflicts can appear before the window.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'How does the tool handle a Mule cluster?',
      options: [
        'It upgrades local instances: you run it on each node, and every node must end on the same Mule version',
        'One run on the primary node upgrades every node',
        'Runtime Manager distributes it automatically',
        'Clusters are not supported',
      ],
      answer: 0,
      explain: 'Copy the distribution and tool to each node first to reduce downtime. Rollback follows the same rule: every node must be rolled back to the same version.',
    },
    {
      type: 'single',
      detail: true,
      needsScenario: true,
      prompt: 'After the upgrade, smoke tests fail and the team decides to go back. What do they run?',
      options: [
        '`$MULE_HOME/tools/upgrade-tool rollback`, which restores from the backup in `$MULE_HOME/.upgrade-tool-backup`',
        '`upgrade-tool upgrade -n` with the old version number',
        'Nothing: the tool cannot restore a previous version',
        '`amc_setup -U`',
      ],
      answer: 0,
      explain: 'The tool generates the backup before it starts. Keep that in mind when planning disk space and when cleaning up folders.',
    },
  ],
  description: `
A retailer runs Mule 4 on-premises on eight hosts: a four-node production cluster registered with Runtime Manager, two standalone integration servers, and two test servers. The security team has asked for the latest cumulative patch within 30 days. Previous upgrades were done by hand, and one of them lost a custom heap setting.

The platform lead wants a repeatable process:

- Can it be scripted?
- What happens to custom settings in \`conf\`?
- What happens to the Runtime Manager and Anypoint Monitoring agents?
- How do you handle the production cluster?
- How do you go back if the patch causes a problem?

**Questions**
1. Describe the upgrade tool and its prerequisites.
2. Walk through the upgrade of one server, including a rehearsal.
3. How are configuration changes protected?
4. Plan the production cluster upgrade. What are the risks?
5. How do you roll back? What is your alternative if you need no downtime at all?
`,
  answerTemplate: `## The tool and prerequisites

## Upgrading one server

## Configuration conflicts

## The production cluster

## Rollback and alternatives
`,
  keyPoints: [
    'The Mule upgrade tool is a command-line utility for standalone on-premises Mule 4 and can be scripted.',
    'It needs a stopped instance, the latest tool, an unpacked full distribution (not a patch file), 2 GB of disk and paths without spaces.',
    'It updates the Runtime Manager agent if installed. The Anypoint Monitoring agent must be uninstalled first and reinstalled afterwards.',
    'It does not modify Mule apps on the runtime.',
    'It compares configuration files. Unresolved conflicts fail the run and are reviewed through the to_review and ready folders.',
    'For a cluster, run it on each node. All nodes must end up on the same Mule, agent and Java versions.',
    'It creates a backup in $MULE_HOME/.upgrade-tool-backup, and upgrade-tool rollback restores it.',
    'An in-place upgrade can reduce capacity or cause downtime. A side-by-side environment avoids that at a higher temporary cost.',
  ],
  solution: `
**The tool and prerequisites.** The Mule upgrade tool is a command-line utility for updating standalone on-premises Mule 4 instances, and the docs describe integrating it with scripts and cron jobs. You need:
- The latest version of the tool, in \`$MULE_HOME/tools\`.
- The target's **full** distribution, unpacked. The file name contains \`distribution\`, not \`patch\`.
- A stopped Mule instance.
- At least 2 GB of free disk space.
- No blank spaces in \`$MULE_HOME\` or the new distribution path.
- On Windows, the PowerShell execution policy set to Unrestricted.

**Upgrading one server.**
1. Uninstall the Anypoint Monitoring agent if it is present, because upgrading it is not supported.
2. If you want a new directory name, rename \`$MULE_HOME\` now. A rename after the upgrade stops Anypoint Monitoring working.
3. Stop Mule and check with \`$MULE_HOME/bin/mule status\`.
4. Rehearse with the \`--dry-run\` option, which simulates the process with no permanent changes.
5. Run \`$MULE_HOME/tools/upgrade-tool upgrade -n <newMuleDistributionPath>\`.
6. Start Mule, check \`mule_ee.log\`, test the apps and reinstall monitoring.
7. Delete the unpacked distribution, since it is no longer needed.

The tool leaves apps alone, and it updates the Runtime Manager agent if one is installed. Do test servers first.

**Configuration conflicts.** The tool compares configuration files in the current and new distributions, and tries to resolve changes automatically. If it cannot, it stops with an error, logs the file names, and copies the files under \`\${MULE_HOME}/upgrade-tool\`. You compare each file in \`to_review\` with the new version, merge or keep it, and place the result in \`ready\`. Be careful when keeping your old file, as this can leave deprecated settings in place. A fully manual upgrade is different: the release notes say you must replicate custom settings yourself, such as a maximum heap size in \`wrapper.conf\`. That is how the earlier upgrade lost its setting.

**The production cluster.** Copy the tool and distribution to every node first, to reduce downtime. Run the tool on each node, as it only works on local instances. Every node must be on the same Mule version to work, and for cumulative patches the patch version must also match. The HA guide warns against restarting several nodes at the same time, because concurrent restarts can trigger cluster-membership eviction and take apps offline. Yet nodes on different versions do not meet the cluster requirement. So treat this as a planned maintenance window, confirm the sequence for your version with MuleSoft guidance, and test failover in a lower environment.

**Rollback and alternatives.** The tool stores a backup in \`$MULE_HOME/.upgrade-tool-backup\`, and \`upgrade-tool rollback\` restores it. For a cluster, roll every node back to the same version.

If no downtime is acceptable, use the side-by-side approach in the on-premises HA guide: build a new environment on the new version, send a small percentage of traffic to it, and raise this as confidence grows. The old baseline is removed once the new one takes all traffic. It costs extra capacity for that period, whereas an in-place change can reduce capacity or cause complete downtime.
`,
  followUps: [
    { q: 'Do you need the upgrade tool at all?', a: 'It is highly recommended but not strictly necessary: the release notes describe a fully manual upgrade, in which you replicate custom settings and install the licence on the new instance.' },
    { q: 'Can the tool upgrade any Mule 4 version?', a: 'Not all. Releases of 4.1.1 through 4.1.4 from before January 20, 2022 are not supported, and an attempt produces an error saying you must first move to a supported version.' },
    { q: 'What should you check for connectors when moving to a Mule version that needs a newer JDK?', a: 'Errors such as JavaVersionNotSupportedByExtensionException mean that an extension does not support the JDK in use. Check each app\'s Java compatibility before the runtime change, because the tool does not modify apps.' },
  ],
}
