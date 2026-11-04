export default {
  id: 'ms-060',
  category: 'mulesoft',
  title: 'Connecting to Oracle: JDBC Driver as a Shared Library, Pool Basics and Safe Store Inventory Lookups',
  level: 'BEGINNER',
  tags: ['retail', 'oracle', 'database', 'jdbc', 'sql-injection', 'connection-pool'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'The app deploys, but the first `db:select` fails because the Oracle driver class cannot be found. What is the usual fix?',
      options: [
        'Add the Oracle JDBC driver (e.g. ojdbc8/ojdbc11) as a Maven dependency and declare it as a shared library for the Mule Maven plugin',
        'Copy ojdbc.jar into src/main/resources',
        'Nothing — the Database connector bundles the Oracle driver',
        'Switch to the generic connection, which does not need a driver',
      ],
      answer: 0,
      explain: 'The Database connector does not ship vendor drivers. The driver must be on the connector classpath, which is done with a pom dependency plus a `sharedLibrary` entry (Studio does this when you click "Add driver"). A generic connection still needs the driver.',
    },
    {
      type: 'single',
      prompt: 'A developer wrote `#["SELECT qty FROM store_stock WHERE store_id = \'" ++ attributes.queryParams.store ++ "\'"]`. What is the main problem?',
      options: [
        'The value is concatenated into the SQL text, so it allows SQL injection and Oracle sees a different statement for every store',
        'DataWeave cannot build strings with ++',
        'Oracle does not accept single quotes in WHERE clauses',
        'It only works when the store ID is numeric',
      ],
      answer: 0,
      explain: 'Concatenation lets a crafted value (`\' OR \'1\'=\'1`) change the query, and a new statement text for every value defeats statement caching on both sides. Use `:storeId` in the SQL and pass the value in `input-parameters`.',
    },
    {
      type: 'multi',
      prompt: 'Which are benefits of `WHERE store_id = :storeId AND sku = :sku` with values in `db:input-parameters`?',
      options: [
        'Values are bound, not parsed as SQL, which prevents injection',
        'Oracle can reuse the parsed statement across calls',
        'The driver converts types (numbers, dates) instead of you formatting them as text',
        'It removes the need for a connection pool',
      ],
      answer: [0, 1, 2],
      explain: 'Bind parameters are safe, reusable and type-aware. They do nothing for connection management — that is the pooling profile.',
    },
    {
      type: 'single',
      prompt: 'Every request to the Store Inventory API opens a new Oracle session and takes 300 ms longer than expected. What should you check first?',
      options: [
        'That the connection uses a pooling profile so connections are reused',
        'That the SQL uses upper-case keywords',
        'That the HTTP listener uses HTTPS',
        'That the result is converted to JSON with DataWeave',
      ],
      answer: 0,
      explain: 'Opening an Oracle session is expensive (network, authentication, session setup). A pooling profile keeps connections open and lends them to requests.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to add a safe Oracle lookup to a new Mule project.',
      items: [
        'Add the Oracle JDBC driver dependency and shared library to the pom',
        'Create the Database config (Oracle or generic connection) with credentials from secure properties',
        'Add a pooling profile sized for the expected concurrency',
        'Write the db:select with named parameters and input-parameters',
        'Test with a store ID containing a quote to confirm it is handled as data',
      ],
      explain: 'Driver first (otherwise "Test connection" fails), then the config with secured credentials and a pool, then parameterised SQL — and a quick negative test proves the value is bound.',
    },
  ],
  description: `
A fashion retailer is building a **Store Inventory System API** so the mobile app can show "available in your store". Stock lives in an **Oracle 19c** table:

\`\`\`sql
STORE_STOCK (STORE_ID VARCHAR2(6), SKU VARCHAR2(20), ON_HAND NUMBER, RESERVED NUMBER, UPDATED_AT TIMESTAMP)
\`\`\`

A junior developer delivered a first version:
- The app fails on the first request with a "driver class not found" error.
- After copying the driver jar into \`src/main/resources\` it "worked on my machine" but not in CloudHub.
- The query is built by concatenating \`attributes.queryParams.store\` and \`attributes.queryParams.sku\` into the SQL string.
- Each request opens a new Oracle session; the DBA complains about logon storms during store opening hours.

**Questions**
1. How should the Oracle JDBC driver be added to a Mule 4 project, and why?
2. Rewrite the query safely. What exactly is wrong with string concatenation?
3. What does a pooling profile give you, and what are the main settings?
4. Where should the Oracle credentials and connection URL come from?
`,
  answerTemplate: `## Adding the driver

## Safe query

## Pooling profile

## Credentials and URL
`,
  keyPoints: [
    'The Database connector does not include vendor drivers; add the Oracle JDBC driver as a pom dependency and as a sharedLibrary in the Mule Maven plugin.',
    'Use named parameters (:storeId) with db:input-parameters; never concatenate request values into SQL text.',
    'Concatenation allows SQL injection and creates a new statement text per value, which defeats statement reuse in Oracle.',
    'A pooling profile (maxPoolSize, minPoolSize, maxWait, preparedStatementCacheSize…) reuses connections instead of logging on for each request.',
    'Credentials and URLs come from environment-specific (secure) properties, not hard-coded values.',
  ],
  solution: `
**1. Driver.** The connector ships without vendor drivers. Add the driver to the pom and expose it to the connector as a **shared library** (Studio's "Add driver" does both):
\`\`\`xml
<dependency>
  <groupId>com.oracle.database.jdbc</groupId>
  <artifactId>ojdbc8</artifactId>
  <version>19.x</version>
</dependency>
<!-- mule-maven-plugin configuration -->
<sharedLibraries>
  <sharedLibrary>
    <groupId>com.oracle.database.jdbc</groupId>
    <artifactId>ojdbc8</artifactId>
  </sharedLibrary>
</sharedLibraries>
\`\`\`
A jar in \`src/main/resources\` is not on the connector's classpath, which is why it was unreliable.

**2. Safe query.**
\`\`\`xml
<db:select config-ref="oracleStock">
  <db:sql>SELECT on_hand - reserved AS available FROM store_stock
          WHERE store_id = :storeId AND sku = :sku</db:sql>
  <db:input-parameters>#[{ storeId: attributes.queryParams.store, sku: attributes.queryParams.sku }]</db:input-parameters>
</db:select>
\`\`\`
Concatenation means the value becomes part of the SQL text: a value like \`' OR '1'='1\` changes the query (SQL injection), quoting and date formats are your problem, and every store/SKU combination is a different statement for Oracle to parse.

**3. Pooling.**
\`\`\`xml
<db:oracle-connection host="\${db.host}" port="\${db.port}" user="\${db.user}" password="\${secure::db.password}" instance="\${db.sid}">
  <db:pooling-profile maxPoolSize="10" minPoolSize="2" maxWait="5" maxWaitUnit="SECONDS" preparedStatementCacheSize="20"/>
</db:oracle-connection>
\`\`\`
Connections are opened once and lent to requests; \`maxWait\` makes requests fail fast instead of hanging when the pool is busy. Size it with the DBA: total sessions = replicas × maxPoolSize. (If your environment uses a service name rather than a SID, a generic connection with \`jdbc:oracle:thin:@//host:1521/SERVICE\` works too.)

**4. Credentials.** Host, port, user and SID/service from per-environment property files; the password from **secure properties** (or a vault), never committed in plain text.
`,
  followUps: [
    {
      q: 'Can you parameterise a table name the same way?',
      a: 'No. Bind parameters only replace values, not identifiers. If the table really varies, choose it from a fixed allow-list in DataWeave rather than passing user input into the SQL text.',
    },
    {
      q: 'How do you query many SKUs at once without concatenation?',
      a: 'Common options are a fixed number of placeholders built from an allow-listed count, a join to a global temporary table filled with a bulk insert, or splitting the work into batches of single-SKU parameterised queries.',
    },
    {
      q: 'Why might the pool need fewer connections than the number of concurrent HTTP requests?',
      a: 'A connection is only held while the query runs; if queries take a few milliseconds, a handful of connections serves many concurrent requests. Oversizing the pool just moves the queue into Oracle.',
    },
  ],
}
