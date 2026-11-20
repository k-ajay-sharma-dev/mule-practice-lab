export default {
  id: 'ms-276',
  category: 'mulesoft',
  title: 'SFTP Listeners on Several Nodes: Primary Node Only, File Claims and Duplicate Pickups',
  level: 'ADVANCED',
  tags: ['myproject', 'sftp', 'clustering', 'primary-node-only', 'object-store', 'idempotency', 'scaling'],
  estMinutes: 24,
  quiz: [
    {
      type: 'single',
      prompt: 'In a Mule cluster, what does primary node only mean for an SFTP listener?',
      options: [
        'Every node polls, but only the primary node may move or delete files',
        'Only the primary polls, and another node takes over if it fails',
        'Only the primary polls, and polling stops until it is restarted',
        'Every node polls, and the primary hands each file to one node',
      ],
      answer: 1,
      explain: 'Only the primary node polls the folder. If it fails, another node becomes primary and takes over. Polling sources usually run on the primary node, so two nodes do not pick the same file.',
    },
    {
      type: 'single',
      prompt: 'An app with an SFTP listener is scaled to two workers or replicas that are not one Mule cluster. What is the risk?',
      options: [
        'None, because the SFTP server hands each file to one client',
        'Both can list the folder and pick the same file, so it runs twice',
        'The second worker is refused, since the account allows one session',
        'The watermark is shared, so each worker skips files the other read',
      ],
      answer: 1,
      explain: 'An SFTP server has no idea of consumers. Check how your deployment target runs polling sources, and design for repeats anyway.',
    },
    {
      type: 'multi',
      prompt: 'Which measures stop two pollers from processing the same file?',
      options: [
        'Run the poll on one node or one replica only',
        'Take a lock in Object Store keyed by the file path before processing',
        'Move the file to a processing folder first; a failed move means it is taken',
        'An idempotent message validator keyed by path and timestamp',
        'Poll more often, so each file is claimed sooner after it arrives',
      ],
      answer: [0, 1, 2, 3],
      explain: 'The lock and the validator need an object store that every node shares. Polling more often makes clashes more likely, not less.',
    },
    {
      type: 'single',
      prompt: 'Why does a rename work as a claim?',
      options: [
        'The server locks a renamed file for the session that renamed it',
        'Only the first rename works, since the source path is then gone',
        'The SFTP protocol queues renames so each client gets its own file',
        'The connector checks the watermark before it renames a file',
      ],
      answer: 1,
      explain: 'A second client trying the same rename fails because the source path is gone. The server does the check for you, with no shared lock store. The processing folder then holds work in progress.',
    },
    {
      type: 'single',
      prompt: 'The primary node crashes while processing a file. The file was not moved yet. What happens next?',
      options: [
        'The file is lost, because its watermark was already stored',
        'A new primary finds the file and processes it again',
        'The cluster waits for the old primary before it polls again',
        'The new primary resumes the file from the last record processed',
      ],
      answer: 1,
      explain: 'The target must cope with a repeat. At least once is the normal outcome. Make the load idempotent by file or business key.',
    },
    {
      type: 'single',
      prompt: 'The listener runs on the primary node only, but processing is heavy. How do you use every node?',
      options: [
        'Turn off primary node only, so every node polls the same folder',
        'Keep one poller, and put file references on a queue all nodes read',
        'Add one listener per node, each with a different file name pattern',
        'Raise the listener max concurrency on the primary node',
      ],
      answer: 1,
      explain: 'Keep the listener on the primary, and hand each file reference or its records to a queue such as VM or Anypoint MQ that all nodes consume. One poller finds work and a queue spreads it. Send a small reference rather than large content through the queue.',
    },
  ],
  description: `
Quayle Freight receives proof of delivery files from carriers over SFTP. The Mule app was scaled out to handle month end volume, and the next day carriers complained of duplicate invoices. Logs show two nodes processed the same files.

**Questions**
1. How do polling sources behave on several nodes?
2. Why did files get processed twice?
3. How can the app claim each file once?
4. How do you scale processing without duplicate pickups?
`,
  answerTemplate: `## Polling on several nodes

## Why duplicates happened

## Claiming files

## Scaling safely
`,
  keyPoints: [
    'In a cluster, polling sources run on the primary node only.',
    'Separate workers or replicas can each poll and pick the same file.',
    'Claim with an Object Store lock, a rename into a processing folder, or an idempotent validator.',
    'Failover can repeat a file. Make the load idempotent.',
    'One poller plus a queue spreads the work.',
  ],
  solution: `
**1. Polling on several nodes.** In a Mule cluster, the SFTP listener runs on the primary node only, and another node takes over if it fails. When an app runs as separate workers or replicas that do not form one cluster, check how your platform treats polling sources: each copy may poll on its own.

**2. Why duplicates happened.** Each node listed the folder, saw the same new files and started a flow for each. The SFTP server does not hand out files to one client. Moving or deleting the file at the end comes too late to stop the second node.

**3. Claiming files.** Three common ways. Run the poll on one node only. Take a lock in a shared Object Store keyed by the file path, and skip the file if the lock is taken. Or rename the file into a processing folder first: only one rename can succeed, so a failed rename means another node has it. An idempotent message validator keyed by path and timestamp adds a second guard.

**4. Scaling safely.** Keep one poller and spread the work: the listener sends a small message with the file path, or the records, to a VM or Anypoint MQ queue that every node consumes. Make the final load idempotent, since a failover can still repeat a file.
`,
  followUps: [
    {
      q: 'Where does the idempotent validator store its keys?',
      a: 'In an object store shared by all nodes, persistent, with an expiry longer than the time a file could come back.',
    },
    {
      q: 'What if the lock holder dies?',
      a: 'Give the lock an expiry longer than normal processing time. After it expires, another node can take the file, so the load must still be idempotent.',
    },
    {
      q: 'Why send a path and not the file through the queue?',
      a: 'Queues have message size limits and large messages slow them. A path or a claim check keeps messages small.',
    },
  ],
}
