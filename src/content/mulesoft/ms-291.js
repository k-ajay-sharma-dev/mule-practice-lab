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
      prompt: 'A new Mule 4 app has a Database config with a SQL Server connection, and Studio says the driver is not configured. The DBA notes that the database server has the SQL Server ODBC driver installed. What do you do?',
      options: [
        'Nothing in the app, since the connector uses the ODBC driver on the server',
        'Install the ODBC driver on each Mule worker, since the connector calls ODBC',
        'Add mssql-jdbc as a Maven dependency and as a shared library of the connector',
        'Add the jTDS driver, which the SQL Server connection needs for named instances',
      ],
      answer: 2,
      explain: 'The Database connector does not ship vendor drivers. Add the Microsoft JDBC driver, mssql-jdbc, to the project and reference it as a shared library, so the connection can load it. JDBC drivers are Java libraries inside the app, and the connector does not use ODBC on the server or the worker. jTDS is an old third party driver and is not needed for named instances.',
    },
    {
      type: 'single',
      prompt: 'A URL to a default instance gives no port and works through a firewall that allows TCP 1433. A second server has its default instance set to TCP 14330, and the same URL style fails there. Why?',
      options: [
        'The driver asked SQL Browser on UDP 1434, which is closed, so the lookup of 14330 failed',
        'The driver tries 1433 and then the next ports in turn, and the firewall blocks them',
        'The driver reads the port from a DNS record for the host, which still says 1433',
        'Without a port or an instance name the driver uses 1433, so the URL must give 14330',
      ],
      answer: 3,
      explain: 'With no port and no instance name, the driver connects to the default port 1433. A default instance moved to another port must be reached with that port in the URL. The SQL Browser lookup on UDP 1434 is used only when an instance name is given. The driver does not scan ports or read the port from DNS.',
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
      prompt: 'To unblock a test, a developer adds encrypt=true;trustServerCertificate=true to the URL, and connections work. What is the state of the connection now?',
      options: [
        'Encrypted, but any server certificate is accepted, so an impostor is not detected',
        'Not encrypted, since trusting the server certificate turns TLS off',
        'Encrypted and verified, since the driver saved the certificate to the truststore',
        'Encrypted and verified, as long as the certificate name matches the host name',
      ],
      answer: 0,
      explain: 'trustServerCertificate=true keeps encryption but skips the certificate checks, the host name check included. The client then cannot tell the real server from an impostor. The driver does not save the certificate anywhere. It can unblock a test, but in production use a trusted certificate or a truststore with the server CA.',
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
      prompt: 'A code review finds the SQL Server password in plain text in config-prod.yaml, committed to Git. The app runs on CloudHub 2.0. What fix do you propose?',
      options: [
        'Base64 encode the value in the file, so it no longer reads as clear text',
        'Encrypt it with the Secure Properties tool and commit the key in the project too',
        'Move it into the connection config XML as a literal, since XML is not logged',
        'Encrypt it with the Secure Properties tool and pass the key as a protected property',
      ],
      answer: 3,
      explain: 'Secure properties keep secrets out of source control only when the key lives elsewhere, such as a protected property set in Runtime Manager. A key committed with the project lets anyone with the repository decrypt the value. Base64 is an encoding that anyone can reverse. A literal in the XML is still a secret in Git. Also rotate the password, since it is in the Git history.',
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
