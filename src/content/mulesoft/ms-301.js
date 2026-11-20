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
      prompt: 'What does a Mule app need to talk to Oracle through the Database connector?',
      options: [
        'Nothing more, since the Oracle driver ships with the connector',
        'The Oracle JDBC driver as a dependency, and an Oracle connection',
        'An Oracle client install with tnsnames.ora on every worker',
        'The Oracle OCI driver, since the thin driver cannot use pools',
      ],
      answer: 1,
      explain: 'Add the Oracle JDBC driver, such as ojdbc8 or ojdbc11, as a dependency and shared library. The connector does not ship vendor drivers. The thin driver is pure Java, so no Oracle client install is needed.',
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
        'The driver version is too old for this database release',
      ],
      answer: 1,
      explain: 'ORA-12505 is about a SID. ORA-12514 is the same problem for a service name. A closed port gives a network error instead.',
    },
    {
      type: 'single',
      prompt: 'Which port does an Oracle listener use by default?',
      options: ['1433', '1521', '3306', '5432'],
      answer: 1,
      explain: '1433 is SQL Server, 3306 MySQL and 5432 PostgreSQL. Many sites keep 1521, but always check.',
    },
    {
      type: 'multi',
      prompt: 'After a quiet night, the first calls fail with a closed connection error, then work again. What helps?',
      options: [
        'A test query such as SELECT 1 FROM DUAL, to find dead connections',
        'Retiring idle connections before the firewall idle timeout',
        'A reconnection strategy on the config',
        'A larger max pool size, so more connections are ready',
      ],
      answer: [0, 1, 2],
      explain: 'Firewalls often drop idle sessions without telling either side. A bigger pool only gives you more dead connections.',
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
