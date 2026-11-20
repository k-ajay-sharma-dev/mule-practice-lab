export default {
  id: 'ms-291',
  category: 'mulesoft',
  title: 'Connecting Mule to SQL Server: The JDBC Driver, the URL, Named Instances and Encryption',
  level: 'BEGINNER',
  tags: ['myproject', 'sql-server', 'jdbc', 'database-connector', 'tls', 'connection'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'What does a Mule app need to talk to SQL Server through the Database connector?',
      options: [
        'Nothing more, since the connector ships with the SQL Server driver',
        'The mssql-jdbc driver as a dependency, and a SQL Server connection',
        'The SQL Server ODBC driver installed on the Mule worker',
        'The jTDS driver, which the connector needs for named instances',
      ],
      answer: 1,
      explain: 'Add the Microsoft JDBC driver, mssql-jdbc, as a dependency and shared library. The Database connector does not ship vendor drivers. You add the driver to the project and reference it in the connection.',
    },
    {
      type: 'single',
      prompt: 'Which default port does SQL Server listen on?',
      options: ['1521', '1433', '3306', '5432'],
      answer: 1,
      explain: '1521 is the Oracle listener, 3306 MySQL and 5432 PostgreSQL. A named instance often uses another port.',
    },
    {
      type: 'single',
      prompt: 'After upgrading the JDBC driver, connections fail with a certificate path error. What changed?',
      options: [
        'The new driver needs TLS 1.3, which the server does not offer',
        'Newer drivers encrypt by default and check the server certificate',
        'The new driver no longer reads the Java default truststore',
        'The server certificate expired on the same day as the upgrade',
      ],
      answer: 1,
      explain: 'The client now checks a server certificate it does not trust. Recent drivers set encrypt to true by default. Older ones defaulted to false. The fix is to trust the server certificate, not to switch checks off.',
    },
    {
      type: 'single',
      prompt: 'What does trustServerCertificate=true do?',
      options: [
        'It adds the server certificate to the Java truststore on first use',
        'It encrypts but accepts any server certificate without checks',
        'It turns off encryption, so the certificate is not needed',
        'It trusts the certificate only if its name matches the host name',
      ],
      answer: 1,
      explain: 'The client then cannot tell the real server from an impostor. It can unblock a test, but in production use a trusted certificate or a truststore with the server CA.',
    },
    {
      type: 'multi',
      prompt: 'How can Mule reach a named instance such as SQLPRD01\\PLANNING?',
      options: [
        'Give the instance name, and the driver asks SQL Browser for the port',
        'Give the fixed port of the instance, which skips the Browser lookup',
        'Give port 1433, which every named instance shares with the default',
        'Give the instance name as the databaseName in the connection',
      ],
      answer: [0, 1],
      explain: 'SQL Browser answers on UDP 1434. A fixed port is common in locked down networks, where UDP 1434 is often closed.',
    },
    {
      type: 'single',
      prompt: 'Where should the database password live?',
      options: [
        'In the JDBC URL, kept in a plain properties file per environment',
        'In an encrypted secure property, read into the connection config',
        'In the connection config XML, so it is versioned with the code',
        'In a system property passed on the java command line in plain text',
      ],
      answer: 1,
      explain: 'Secure properties keep secrets out of source control. Also check that the URL is never logged with a password in it.',
    },
  ],
  description: `
Marrow & Pine Home stores the plans it gets back from the planning platform in a SQL Server database that the ERP reads. A new Mule app must write to it. The DBA gives you a server name, a named instance, a database and a SQL login. The first test fails with a certificate error.

**Questions**
1. What do you add to the Mule project to connect?
2. What goes in the connection settings?
3. Why does the certificate error appear, and how do you fix it?
4. How do you reach a named instance?
`,
  answerTemplate: `## Project setup

## Connection settings

## The certificate error

## Named instances
`,
  keyPoints: [
    'Add the Microsoft JDBC driver as a dependency and shared library.',
    'Use the SQL Server connection of the Database connector, or a generic JDBC URL.',
    'Default port 1433. Named instances often use another port.',
    'Newer drivers encrypt by default and check the server certificate.',
    'Trust the certificate. Keep trustServerCertificate=true out of production.',
    'Passwords go in secure properties.',
  ],
  solution: `
**1. Project setup.** Add the \`mssql-jdbc\` driver to the pom and declare it as a shared library for the Database connector. Pick a driver version your SQL Server and Java versions support.

**2. Connection settings.** Use the SQL Server connection type, or a generic connection with a URL like \`jdbc:sqlserver://host:1433;databaseName=Plans;encrypt=true\`. Add the user and a password from a secure property, and set a login timeout and a pooling profile.

**3. The certificate error.** Recent driver versions encrypt by default, so the driver checks the server certificate. The server uses a certificate from an internal CA that the Java truststore does not know. Ask for the CA certificate, add it to a truststore the app uses, and keep encryption on. Setting \`trustServerCertificate=true\` hides the problem and allows a fake server, so keep it for local tests only.

**4. Named instances.** Either give the instance name, and the driver asks the SQL Browser service on UDP 1434 for the port, or give the instance's fixed port. In locked down networks the fixed port is usual, because UDP 1434 is closed.
`,
  followUps: [
    {
      q: 'Should the app log in with Windows authentication or a SQL login?',
      a: 'It depends on what the platform supports. Mule on Linux often uses a SQL login. Windows or Entra ID logins need extra driver setup. Follow the DBA standard.',
    },
    {
      q: 'What rights should the app login have?',
      a: 'Only what it needs: execute on its procedures, or insert and select on its tables. Never db_owner or sysadmin.',
    },
    {
      q: 'How do you test the connection from Mule before writing flows?',
      a: 'Use Test Connection in Studio and a small flow with SELECT 1, run from the same network as the deployed app.',
    },
  ],
}
