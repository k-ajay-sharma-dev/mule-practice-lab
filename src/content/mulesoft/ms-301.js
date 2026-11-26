export default {
  id: 'ms-301',
  category: 'mulesoft',
  title: 'Connecting Mule to Oracle: The Driver, Service Name or SID, and a Healthy Pool',
  level: 'BEGINNER',
  tags: ['myproject', 'oracle', 'jdbc', 'database-connector', 'connection-pool', 'connection'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'The Oracle DBA sends a tnsnames.ora entry and says every client needs Oracle Instant Client installed. The Mule app will run on CloudHub 2.0. What do you do?',
      options: [
        'Ask MuleSoft support to install Instant Client on the CloudHub 2.0 replicas',
        'Add ojdbc11 as a dependency and shared library, and use a thin driver URL',
        'Use the OCI driver, since the thin driver cannot work with a connection pool',
        'Nothing in the app, since the Database connector ships with an Oracle driver',
      ],
      answer: 1,
      explain: 'The thin driver is pure Java, so no Oracle client install is needed, and the host, port and service name from the tnsnames entry go into the URL. Add the Oracle JDBC driver, such as ojdbc8 or ojdbc11, as a dependency and shared library, since the connector does not ship vendor drivers. You cannot install native clients on CloudHub 2.0 replicas, and the thin driver works with pools.',
    },
    {
      type: 'single',
      prompt: 'The DBA gives you a service name, PLANPDB. Which URL form uses it?',
      options: [
        'jdbc:oracle:thin:@db-host:1521:PLANPDB',
        'jdbc:oracle:thin:@//db-host:1521/PLANPDB',
        'jdbc:oracle://db-host:1521/PLANPDB',
        'jdbc:oracle:thin:@db-host:1521;service=PLANPDB',
      ],
      answer: 1,
      explain: 'A slash and // mean a service name. A colon before the last part means a SID. Pluggable databases are reached by service name.',
    },
    {
      type: 'single',
      prompt: 'The connection fails with ORA-12505, listener does not currently know of SID. What is the likely cause?',
      options: [
        'The schema user exists but has no CREATE SESSION right',
        'A service name was used in the SID form, or the SID is wrong',
        'The listener port is closed by a firewall on the way',
        'The ojdbc driver is too old for this release, so the listener rejects it',
      ],
      answer: 1,
      explain: 'ORA-12505 is about a SID. ORA-12514 is the same problem for a service name. A closed port gives a network error instead.',
    },
    {
      type: 'single',
      prompt: 'The network team copies the SQL Server rule and opens TCP 1433 from the Mule egress range to the Oracle host. Connections with jdbc:oracle:thin:@//db-host/PLANPDB time out. Why?',
      options: [
        'Oracle also needs UDP 1434 open, for the service name lookup',
        'A service name URL needs port 1522, which is kept for pluggable databases',
        'With no port in the URL the driver uses 1521, which the rule does not open',
        'Oracle needs both 1433 for the login and 1521 for the data, and only one is open',
      ],
      answer: 2,
      explain: 'The default Oracle listener port is 1521, and a URL without a port uses it. 1433 is the SQL Server port, and UDP 1434 is the SQL Browser lookup for SQL Server named instances. Pluggable databases are reached through the same listener port by service name. Many sites keep 1521, but always check.',
    },
    {
      type: 'multi',
      prompt: 'After a quiet night, the first calls fail with a closed connection error, then work again. What helps?',
      options: [
        'A test query such as SELECT 1 FROM DUAL, to find dead connections',
        'Retiring idle connections before the firewall idle timeout',
        'A keep-alive on the TNS connection, such as ENABLE=BROKEN in the descriptor',
        'A larger max pool size, so more connections are ready',
        'A longer query timeout on the Select operation',
        'Switching the URL from SID to service name',
      ],
      answer: [0, 1, 2],
      explain: 'Firewalls often drop idle sessions without telling either side. A test query finds a dead connection before use, retiring idle connections early avoids the drop, and a keep-alive set with ENABLE=BROKEN stops inactivity timers from dropping the connection. A bigger pool only gives you more dead connections. A longer timeout makes a call on a dead socket wait longer. SID or service name decides which database you reach, not how long an idle session lives.',
    },
    {
      type: 'single',
      prompt: 'Five Mule apps each have a max pool size of 50 against one Oracle database. What should you check with the DBA?',
      options: [
        'Nothing, since idle pooled connections use no database session',
        'That the sessions and processes limits allow 250 more sessions',
        'That each app has its own tablespace for its sessions',
        'That the five apps share one user, so they share one session limit',
      ],
      answer: 1,
      explain: 'The limits must take up to 250 sessions from these apps, plus everything else. Each pooled connection is a session. When the limit is reached, new logins fail for every client, not only Mule.',
    },
  ],
  description: `
Fenwick Supply keeps its merchandising staging tables in Oracle. A new Mule app must read and write them. The DBA sends a host, a port, a service name and a schema user. The first test fails with ORA-12505. Later, in test, the first calls each morning fail and then recover.

**Questions**
1. What do you add to the Mule project to connect?
2. How do service names and SIDs differ in the URL?
3. Why did ORA-12505 appear?
4. Why do the first calls each morning fail, and what do you set?
`,
  answerTemplate: `## Project setup

## Service name or SID

## The ORA-12505 error

## Morning failures and the pool
`,
  keyPoints: [
    'Add the Oracle thin JDBC driver as a dependency and shared library.',
    'Service name: jdbc:oracle:thin:@//host:1521/service. SID: jdbc:oracle:thin:@host:1521:SID.',
    'ORA-12505 means a SID problem, ORA-12514 a service name problem.',
    'Use a pooling profile with a test query and a reconnection strategy.',
    'Size the pool with the DBA, since every connection is a session.',
    'Passwords go in secure properties.',
  ],
  solution: `
**1. Project setup.** Add the Oracle thin driver, for example \`ojdbc8\` or \`ojdbc11\` to match the Java version, to the pom and declare it as a shared library for the Database connector. Keep the password in a secure property.

**2. Service name or SID.** A SID names one instance. A service name is what modern databases and pluggable databases publish. The thin URL for a service name is \`jdbc:oracle:thin:@//host:1521/SERVICE\`. The older SID form is \`jdbc:oracle:thin:@host:1521:SID\`. The Oracle connection type in Studio asks for an instance, which maps to the SID form, so for a service name many teams use a generic connection or a data source with the service URL. Check this against your connector version.

**3. The ORA-12505 error.** The listener was asked for a SID it does not know. The DBA gave a service name, and the URL used the colon form. Changing to the \`//host:port/service\` form fixes it.

**4. Morning failures.** A firewall between Mule and Oracle drops sessions that stay idle too long. The pool still holds them and hands one out, and the first statement fails. Add a pooling profile with a test query such as \`SELECT 1 FROM DUAL\`, retire idle connections before the firewall timeout, and add a reconnection strategy. Agree a max pool size with the DBA, because each connection is a session on the database.
`,
  followUps: [
    {
      q: 'What is a TNS alias, and can Mule use one?',
      a: 'It is a name in tnsnames.ora that maps to a full connect descriptor. The thin driver can use a full descriptor in the URL, and some setups point it at a TNS admin folder. Most Mule apps use the host, port and service form.',
    },
    {
      q: 'How would you connect to an Oracle RAC cluster?',
      a: 'Use the SCAN host name and the service name the DBA gives. The listener spreads sessions over the nodes, and the service can move if a node fails.',
    },
    {
      q: 'What rights should the app schema user have?',
      a: 'Only what it needs: insert and select on its staging tables, execute on its packages. Not the owner schema, and never DBA rights.',
    },
  ],
}
