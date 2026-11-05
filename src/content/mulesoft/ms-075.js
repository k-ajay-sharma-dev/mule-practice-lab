export default {
  id: 'ms-075',
  category: 'mulesoft',
  title: 'Database Connector for Oracle and SQL Server: Connections, Drivers, Pooling, Bulk and Streaming',
  level: 'ADVANCED',
  tags: ['database', 'oracle', 'sql-server', 'jdbc', 'connection-pool', 'bulk', 'streaming'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      detail: true,
      prompt: 'The DBA gives you an Oracle 19c pluggable database reachable as service `ORDERSPDB`. How do you configure the connection?',
      options: [
        'db:oracle-connection with host, port 1521, user, password and serviceName="ORDERSPDB"',
        'db:oracle-connection with instance="ORDERSPDB" and databaseName="ORDERSPDB"',
        'db:mssql-connection with databaseName="ORDERSPDB"',
        'db:my-sql-connection with database="ORDERSPDB"',
      ],
      answer: 0,
      explain: 'Oracle can be addressed by SID (`instance`) or by service name (`serviceName`); pluggable databases and RAC are reached by service name. `databaseName` belongs to the SQL Server connection.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'SQL Server runs as named instance `SQLPROD01\\BILLING`, database `Billing`. Which configuration fits?',
      options: [
        'db:mssql-connection with host SQLPROD01, instanceName BILLING and databaseName Billing',
        'db:mssql-connection with serviceName BILLING',
        'db:oracle-connection with instance BILLING',
        'db:generic-connection with driverClassName oracle.jdbc.OracleDriver',
      ],
      answer: 0,
      explain: 'The SQL Server connection has `databaseName` and `instanceName`; with a named instance you can give the instance name instead of a fixed port (default instances listen on 1433).',
    },
    {
      type: 'single',
      prompt: 'The app fails at deployment with an error that no suitable JDBC driver was found for Oracle. What is missing?',
      options: [
        'The Oracle JDBC driver (ojdbc) as a Maven dependency, declared as a shared library of the Mule application',
        'The tnsnames.ora file in src/main/resources',
        'An Oracle client installation on the CloudHub worker',
        'The Oracle wallet password in the pooling profile',
      ],
      answer: 0,
      explain: 'The Database connector does not ship vendor drivers. Add ojdbc (Oracle) or mssql-jdbc (SQL Server) to the pom and as a shared library so the connector can load it — no native client is needed for the thin driver.',
    },
    {
      type: 'single',
      prompt: 'A developer builds the query as `"SELECT * FROM customers WHERE email = \'" ++ attributes.queryParams.email ++ "\'"`. What is the correct version?',
      options: [
        'SELECT * FROM customers WHERE email = :email, with db:input-parameters #[{ email: attributes.queryParams.email }]',
        'The same concatenation, after replacing single quotes in the email',
        'A stored procedure that receives the full SQL text',
        'The same concatenation inside a Try scope',
      ],
      answer: 0,
      explain: 'Named parameters are bound by the driver as values, never parsed as SQL, which prevents SQL injection and lets the database reuse the execution plan. Escaping by hand is fragile.',
    },
    {
      type: 'single',
      prompt: 'A nightly export reads millions of rows from Oracle with `db:select` and ends in an `OutOfMemoryError`. What fixes it?',
      options: [
        'Read the result as a stream with a `fetchSize`, and process it in chunks',
        'Build one JSON array of all the rows, so the write is a single call',
        'Raise `maxPoolSize` in the pooling profile to match the row count',
        'Set a shorter `maxWait` in the pooling profile',
      ],
      answer: 0,
      explain: 'Streaming keeps memory flat, and materialising millions of rows at once risks running out of memory. Pools are sized by concurrent statements, not by row count. For the write side of a large load, use `db:bulk-insert` with a list of parameter sets per chunk, because bulk operations send a JDBC batch.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each vendor feature to the database it belongs to.',
      pairs: [
        ['ORA-00001 on a duplicate key', 'Oracle unique constraint violation'],
        ['Error 2627 on a duplicate key', 'SQL Server unique / primary key violation'],
        ['FETCH FIRST 100 ROWS ONLY', 'Oracle 12c+ row limiting'],
        ['SELECT TOP (100) ... and OUTPUT INSERTED.id', 'SQL Server row limiting and returning generated keys'],
      ],
      explain: 'Knowing the vendor dialect matters when you write db:select SQL and when you map database error codes to business errors.',
    },
  ],
  description: `
An insurer is building two System APIs on Mule 4:
- **sys-policy** on **Oracle 19c** (pluggable database, service \`POLPDB\`), used by 6 Process APIs, peak 120 requests/s.
- **sys-billing** on **SQL Server 2019**, named instance \`SQLPROD01\\BILLING\`, database \`Billing\`, also loaded nightly with 2 million premium lines.

The first build has problems:
- The Oracle connection was configured with \`instance="POLPDB"\` and fails to connect.
- Deployment to a new environment failed: "no suitable driver".
- A search endpoint concatenates query parameters into SQL.
- The nightly load does one \`db:insert\` per row and takes 6 hours.
- An export \`db:select\` of 5 million rows ends in an OutOfMemoryError.

**Questions**
1. Configure the Oracle and SQL Server connections correctly and explain the parameters.
2. How do you provide JDBC drivers?
3. How do you size the pooling profiles?
4. Fix the search query, the nightly load and the export.
`,
  answerTemplate: `## Connections

## JDBC drivers

## Pooling

## Query, bulk load and export fixes
`,
  keyPoints: [
    'db:oracle-connection: host, port (default 1521), user, password and either instance (SID) or serviceName — PDB/RAC use serviceName.',
    'db:mssql-connection: host, port (default 1433), user, password, databaseName and instanceName for named instances.',
    'Vendor JDBC drivers (ojdbc, mssql-jdbc) are added as Maven dependencies and shared libraries; the connector does not ship them.',
    'db:pooling-profile (maxPoolSize, minPoolSize, maxWait…) per replica; total connections = replicas × maxPoolSize must fit the DB budget.',
    'Always parameterise: :name placeholders with db:input-parameters — never concatenate input into SQL.',
    'Bulk operations (db:bulk-insert / bulk-update / bulk-delete) send JDBC batches; stream large selects with a fetchSize and process them in chunks.',
  ],
  solution: `
**1. Connections.**
\`\`\`xml
<db:config name="oraclePolicy">
  <db:oracle-connection host="ora-scan.corp" port="1521" user="POLICY_API" password="$\{secure::ora.password}"
                        serviceName="POLPDB">
    <db:pooling-profile maxPoolSize="15" minPoolSize="2" maxWait="5" maxWaitUnit="SECONDS"/>
  </db:oracle-connection>
</db:config>

<db:config name="sqlBilling">
  <db:mssql-connection host="SQLPROD01" instanceName="BILLING" databaseName="Billing"
                       user="billing_api" password="$\{secure::mssql.password}">
    <db:pooling-profile maxPoolSize="10" minPoolSize="1"/>
  </db:mssql-connection>
</db:config>
\`\`\`
\`instance\` is the Oracle SID; a pluggable database is reached by **service name**, which is why \`instance="POLPDB"\` failed.

**2. Drivers.** Add \`com.oracle.database.jdbc:ojdbc8\` (or ojdbc11) and \`com.microsoft.sqlserver:mssql-jdbc\` to the pom and list them as **shared libraries** in the mule-maven-plugin configuration, so the connector can load them in every environment.

**3. Pooling.** Size by concurrency (rate × time a connection is held) per replica, plus headroom; multiply by the maximum number of replicas and agree the total with the DBA. Use a short \`maxWait\` so callers fail fast instead of hanging.

**4. Fixes.**
- Search: \`SELECT ... WHERE email = :email\` with \`<db:input-parameters>#[{ email: attributes.queryParams.email }]</db:input-parameters>\`.
- Nightly load: split into chunks (e.g. 1,000–5,000 rows) and use \`db:bulk-insert\` with the chunk as a list of parameter maps; optionally run chunks in a batch job with controlled concurrency.
- Export: process the \`db:select\` result as a stream with a \`fetchSize\`, write it out incrementally (e.g. CSV with streaming enabled or batch steps), and never build the full result in memory.
`,
  followUps: [
    {
      q: 'When would you use db:generic-connection?',
      a: 'For databases without a dedicated connection type (PostgreSQL, for example) or when you need a JDBC URL option the dedicated type does not expose. You give the url and driverClassName yourself.',
    },
    {
      q: 'How do you call an Oracle stored procedure with an output parameter?',
      a: 'Use db:stored-procedure with { call PROC(:in1, :out1) }, input-parameters for inputs and output-parameters with the type for outputs; the results come back in the payload by parameter name.',
    },
    {
      q: 'Why might a bulk-insert chunk fail as a whole?',
      a: 'A JDBC batch is sent together; if one row violates a constraint the driver reports the batch as failed. Validate before loading, keep chunks moderate, and have a fallback that retries the failed chunk row by row to isolate bad records.',
    },
  ],
}
