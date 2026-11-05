export default {
  id: 'ms-175',
  category: 'mulesoft',
  title: 'Object Store Choices per Deployment Target: Standalone, the Cluster Grid and JDBC, Object Store v2 and Persistence Gateway',
  level: 'ADVANCED',
  tags: ['deployment', 'object-store', 'runtime-fabric', 'clustering', 'persistence-gateway', 'on-prem', 'environments'],
  estMinutes: 35,
  quiz: [
    {
      type: 'match',
      detail: true,
      prompt: 'Match each deployment to the store behind a persistent Object Store.',
      pairs: [
        ['Mule cluster with default settings', 'The distributed memory grid, even when `persistent` is true'],
        ['Mule cluster that must survive a full shutdown', 'A centralized JDBC store set in `mule-cluster.properties`'],
        ['CloudHub app using Object Store v2', 'The managed Object Store v2 service'],
        ['Runtime Fabric with Use Persistent Object Storage selected', 'Persistence Gateway, backed by a PostgreSQL database you provide'],
      ],
      explain: 'Your Object Store Connector code stays the same, but durability and limits come from what sits behind it. Always ask where the data physically lives on that target.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Which databases are documented for the cluster JDBC object store?',
      options: [
        'MySQL 5.5+, PostgreSQL 9, and Microsoft SQL Server 2014, 2019 and 2022',
        'PostgreSQL only',
        'Oracle and DB2',
        'Any database with a JDBC driver',
      ],
      answer: 0,
      explain: '`mule.cluster.jdbcstorequerystrategy` accepts `mssql`, `mysql` and `postgresql`. Persistence Gateway is a different feature and uses PostgreSQL.',
    },
    {
      type: 'multi',
      prompt: 'A two-node Mule cluster keeps its object stores in a distributed memory grid, so a full shutdown loses them. The team adds a JDBC store to keep that data in a database. Which three rules apply to that database?',
      options: [
        'Use a dedicated database or schema for the store',
        'Give its user rights to create and drop tables and to change data',
        'Use one database per cluster, reachable from all nodes',
        'Share one database between clusters so that they stay in sync',
        'Create the tables by hand before starting the nodes',
      ],
      answer: [0, 1, 2],
      explain: 'The user needs permission to create and drop tables and to insert, update, delete and select. Clusters are not aware of each other, so sharing a database can corrupt data, for example when apps in different clusters have the same name. Tables are created automatically, two per object store.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An app on Runtime Fabric stores idempotency keys that it expects to keep for 90 days in Persistence Gateway. What does the documentation say?',
      options: [
        'The Persistence Gateway maximum TTL is 30 days, so a 90-day requirement needs a store you control, such as a database',
        'Keys persist forever because the data is in PostgreSQL',
        'Keys persist for 90 days if `entryTtl` is 90 days',
        'Keys persist until the app is deleted',
      ],
      answer: 0,
      explain: 'The limits table gives a maximum TTL of 30 days. When something must be kept longer, store it in a system of record.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Which requirements apply before you enable Persistence Gateway?',
      options: [
        'A PostgreSQL database on a supported version that does not reserve the `partition` keyword',
        'A database user with CREATE, INSERT, SELECT, UPDATE and DELETE privileges',
        'A Kubernetes secret with `persistence-gateway-creds`, plus a `PersistenceGateway` custom resource',
        'A plain text database connection, because only plain text connections are supported',
        'A TLS client certificate for the database',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Only plain text connections are supported, so plan the network path to that database accordingly. Do not use "@" in the username, and encode special characters in the password.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A standalone on-premises app needs a shared store and a team suggests Object Store v2. How can it reach it?',
      options: [
        'Only through the Object Store REST API',
        'By setting `persistent="true"`',
        'Through a Runtime Manager setting',
        'It cannot be accessed in any way',
      ],
      answer: 0,
      explain: 'The Object Store v2 overview states this. For on-premises apps, that means an extra network dependency and API handling, which is rarely better than a local database.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A team moves a stateful app between Runtime Fabric clusters and wants its Persistence Gateway data too. What is the documented approach?',
      options: [
        'Back up the `stores` and `items` tables entirely and recreate them on the target database, without apps deployed on both clusters during the process',
        'Run `rtfctl backup`, which covers the data in PostgreSQL',
        'Point both clusters at one database and leave them running',
        'Export the data from Runtime Manager',
      ],
      answer: 0,
      explain: 'The page warns against having apps deployed on both clusters during this process, to prevent unexpected results.',
    },
  ],
  description: `
A healthcare group has apps on four targets and has found that Object Store behaves differently on each:

- A **standalone server** running a small watermark job.
- A **two-node hybrid cluster** running an idempotent claims intake.
- **CloudHub** apps caching reference data.
- **Runtime Fabric** apps that must share deduplication keys across replicas and restarts.

Architects want one standard. Requirements:
- Claims deduplication must survive a full cluster shutdown during data centre maintenance.
- Runtime Fabric dedup keys must last 14 days.
- Audit reference data must be kept for 90 days.
- The same Mule code should run on CloudHub and Runtime Fabric.

**Questions**
1. Where is Object Store data held on each target?
2. How do you make the cluster store durable? What are the rules for its database?
3. How do you set up Persistence Gateway? What are its limits?
4. What are the Object Store v2 limits that matter here?
5. Which requirement should not be solved with Object Store at all?
`,
  answerTemplate: `## Where the data lives

## Durable cluster store

## Persistence Gateway

## Object Store v2 limits

## What should not be in Object Store
`,
  keyPoints: [
    'Each app has a default persistent object store, and you can create persistent or in-memory ones.',
    'In a cluster, in-memory and persistent stores live in the distributed grid. Without a JDBC store a full shutdown loses them.',
    'The hybrid docs recommend memory-based storage for performance, and JDBC when you need persistence beyond the cluster lifecycle.',
    'Configure the JDBC store with `mule.cluster.jdbcstoreurl`, `jdbcstoreusername`, `jdbcstorepassword`, `jdbcstoredriver` and `jdbcstorequerystrategy`.',
    'Use a dedicated schema, one database per cluster, and never share a database across clusters.',
    'Object Store v2: static or rolling TTL, unlimited entries, values up to 10 MB Base64-encoded, 10 TPS free or up to 100 TPS with premium.',
    'On-premises apps reach Object Store v2 only through the REST API.',
    'Persistence Gateway needs Mule 4.2.1 or later, PostgreSQL and plain text connections, with a 30-day maximum TTL.',
    'Apps use the Object Store v2 REST API through the connector, so they run on both Runtime Fabric and CloudHub without changes.',
    'After an app is deleted, its persistent data can remain for a while: Runtime Fabric cleans it every 60 minutes.',
    'Distributed Locking is not available on CloudHub and CloudHub 2.0 with Object Store v2, so concurrent updates may fail.',
  ],
  solution: `
**1. Where the data lives.**
| Target | Behind the store | Survives |
|---|---|---|
| Standalone | Local runtime storage | Depends on that host |
| Cluster | Distributed memory grid | Redeploys and restarts while the cluster keeps quorum; not a full shutdown |
| Cluster with JDBC | Your central database | Full shutdown |
| CloudHub with Object Store v2 | Managed service | Its TTL rules |
| Runtime Fabric with Persistence Gateway | Your PostgreSQL | Replica restarts, up to a 30-day TTL |

**2. Durable cluster store.** Add these to \`{MULE_HOME}/.mule/mule-cluster.properties\` on the nodes:

\`\`\`properties
mule.cluster.jdbcstoreurl=jdbc:postgresql://db.internal:5432/mule_os
mule.cluster.jdbcstoreusername=mule_os
mule.cluster.jdbcstorepassword=...
mule.cluster.jdbcstoredriver=org.postgresql.Driver
mule.cluster.jdbcstorequerystrategy=postgresql
\`\`\`

The rules: a dedicated database or schema, DDL and DML rights for the user, reachable from all nodes, one per cluster, and not shared with another cluster. Two tables are created automatically for each object store. If table names are too long, use \`mule.cluster.jdbcstoretableNametransformerstrategy\`. The pool uses \`ComboPooledDataSource\`, with \`maxIdleTime\` at 0 by default, so idle connections never expire unless you pass \`c3p0\` values.

**3. Persistence Gateway.**
1. Create the PostgreSQL database and grant the privileges.
2. \`kubectl create secret generic <name> -n rtf --from-literal=persistence-gateway-creds='postgres://user:pass@host:port/db'\`
3. Apply the \`PersistenceGateway\` custom resource, with \`secretRef\` matching the secret. The template uses \`maxBackendConnectionPool: 20\` and \`replicas: 2\`, and spreads pods across zones.
4. Check the \`persistence-gateway\` pod logs for a successful connection.
5. Select **Use Persistent Object Storage** when deploying, or use the Mule Maven plugin 3.5.4 or later.

Limits: 30-day maximum TTL and plain text database connections only. Apps use the Object Store Connector with the Object Store v2 REST API, which gives the portability the group wants. If you use authorized namespaces, add the \`rtf-persistence-gateway\` subject to the RoleBinding.

**4. Object Store v2.** Static TTL defaults to and cannot exceed 30 days; for Mule 4.2.1 and later the default is a rolling TTL with a 30-day window. Free usage is limited to 10 TPS per app; premium allows up to 100 TPS. Values can be up to 10 MB when Base64-encoded. The overview page says the maximum rolling TTL is unlimited while the data keeps being accessed. It also says Object Store v2 enforces a maximum persistence of 30 days from creation, so do not plan on data lasting beyond 30 days. Multi-worker apps can see data discrepancies or key clashes, because Distributed Locking is not available there. It is not the answer for on-premises apps unless you accept REST calls.

**5. What not to store.** The 14-day dedup keys fit Persistence Gateway. Claims deduplication fits a cluster with JDBC. The 90-day audit data does not fit an Object Store on Runtime Fabric or Object Store v2 with a static TTL: it is business data with a retention rule, so it belongs in a database that the business owns. The disaster recovery guidance points the same way: keep integrations stateless and put state in an external store.
`,
  followUps: [
    {
      q: 'Does the performance profile change the object store too?',
      a: 'Yes: it implements the object store without backups, so data associated with a failed node is lost. Stores are still shared between nodes.',
    },
    {
      q: 'What does the rtfctl backup do for object stores?',
      a: 'The backup page lists Object Store among MuleSoft configurations that are backed up, and says data about application state is not. Treat the PostgreSQL database as your own responsibility and back it up with your database tooling; the migration procedure for its tables is separate.',
    },
    {
      q: 'Why might clustering make an Object Store heavy app slower?',
      a: 'The docs say performance can degrade because of the work needed to replicate or coordinate access to data in the grid.',
    },
    {
      q: 'What about Object Store lock timeouts in clusters?',
      a: 'The hybrid high availability page advises using an Object Store Connector version that supports configurable lock timeouts, which prevents indefinite lock hangs.',
    },
  ],
}
