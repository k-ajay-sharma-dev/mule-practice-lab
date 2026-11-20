export default {
  id: 'ms-235',
  category: 'mulesoft',
  title: 'Reconnection at Startup: failsDeployment, Test Connection and Backends That Are Down at Deploy Time',
  level: 'INTERMEDIATE',
  tags: ['myproject', 'reconnection', 'connectors', 'deployment', 'connectivity', 'reliability', 'database', 'healthcare'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A database config has a reconnection strategy with failsDeployment left at its default. The database is down while the app deploys. What usually happens?',
      options: [
        'The deployment fails at once',
        'The app deploys, and DB calls fail until it is back',
        'Mule waits for the database before it starts',
        'Mule holds DB calls in memory until it is back',
      ],
      answer: 1,
      explain: 'By default a failed connectivity test at startup is logged and does not stop the deployment. The problem shows up when operations run.',
    },
    {
      type: 'single',
      prompt: 'The same config has failsDeployment set to true, and the database is still down. What happens?',
      options: [
        'The app deploys and only logs a warning',
        'The deployment fails once the retries are used up',
        'The deployment fails before any retry',
        'The app deploys and retries in the background',
      ],
      answer: 1,
      explain: 'With failsDeployment true, the reconnection strategy runs at startup, and if it cannot connect the deployment fails.',
    },
    {
      type: 'single',
      prompt: 'Which reconnection settings try every 5 seconds, 3 times?',
      options: [
        'A reconnect element with frequency 5000 and count 3',
        'reconnect-forever with frequency 3',
        'An Until Successful scope with maxRetries 5',
        'A response timeout of 15 seconds',
      ],
      answer: 0,
      explain: 'reconnect takes a frequency in milliseconds and a count. reconnect-forever keeps trying with no count.',
    },
    {
      type: 'multi',
      prompt: 'Which statements about reconnection strategies are true?',
      options: [
        'They deal with failures to connect, not with business errors such as a 400 from an API',
        'They are set on the connection of a connector config',
        'They are different from Until Successful, which retries the processors inside its scope',
        'They retry a SQL statement that has a syntax error until it works',
      ],
      answer: [0, 1, 2],
      explain: 'A syntax error is not a connection problem, and retrying it would never help.',
    },
    {
      type: 'single',
      prompt: 'When is failsDeployment true a good choice?',
      options: [
        'For every connector config in every app',
        'When the app is useless without that system',
        'Only for HTTP Request configs',
        'Only in test environments, never in production',
      ],
      answer: 1,
      explain: 'It turns a wrong host or password into a failed deployment that someone sees at once, not a fault the first caller finds. The cost is that a short outage of that system can also block a deployment.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to set up a new database connection for a production app.',
      items: [
        'Use Test Connection in the IDE against a test database',
        'Choose a reconnection strategy for the connection',
        'Decide whether a failed connection should fail the deployment',
        'Deploy to Test once with the database stopped and watch the result',
        'Add an alert on connection errors in production',
      ],
      explain: 'Testing the down case before production shows what the team will see on a bad night.',
    },
  ],
  description: `
Linwood Clinics runs an appointment API on Mule. Last month a deployment to production went green, but the database password in its properties was wrong. The app ran for 40 minutes, answering every booking with 500, before a patient complained.

The team lead wants a wrong setting to be found at deployment, not by patients. A colleague warns that the database is sometimes restarted for maintenance, and the team does not want every deployment in that window to fail.

**Questions**
1. What does Mule do with a failed connection at startup by default?
2. What does failsDeployment change, and how does it work with the reconnection strategy?
3. How is a reconnection strategy different from Until Successful?
4. What would you set for this app, and what else would you add?
`,
  answerTemplate: `## Default behaviour at startup

## failsDeployment

## Reconnection or Until Successful

## Your choice for this app
`,
  keyPoints: [
    'By default a failed connectivity test at startup is logged and the app still deploys.',
    'failsDeployment true makes the deployment fail when the reconnection strategy cannot connect.',
    'reconnect has a frequency and a count. reconnect-forever has no count.',
    'Reconnection handles connection failures, not business or syntax errors.',
    'Until Successful retries the processors in its scope, whatever the error.',
    'An alert on connection errors catches what startup checks miss.',
  ],
  solution: `
**1. By default.** At startup Mule tests the connection of configs that support a connectivity test. If the test fails and failsDeployment is not set, the failure is logged and the app deploys anyway. Each operation then tries to connect when it runs, using the reconnection strategy, and fails if it cannot. That is how a wrong password stayed hidden for 40 minutes.

**2. failsDeployment.** On the reconnection element of a connection, \`failsDeployment="true"\` makes the startup test count. Mule runs the reconnection strategy, for example 3 tries 5 seconds apart, and if none works the deployment fails. A wrong password then shows as a failed deployment in Runtime Manager within seconds of the release.

**3. Reconnection or Until Successful.** A reconnection strategy belongs to a connection and only handles failures to connect. Until Successful wraps processors and retries them on any error, so it can repeat a call that reached the system and failed for a business reason. Use reconnection for connectivity, and use Until Successful only around steps that are safe to repeat.

**4. For this app.** Set failsDeployment to true with enough attempts to ride out a short restart, for example 6 tries 10 seconds apart. Agree a deployment freeze during planned database maintenance. Add an alert on connection errors in production, because a password can also change after the app has started. Release with a rolling update where possible, so the old version keeps serving if the new one fails to start.
`,
  followUps: [
    {
      q: 'Does every connector run a connectivity test at startup?',
      a: 'Only configs whose connection supports testing. Check the connector documentation, and test the down case in a lower environment.',
    },
    {
      q: 'The app uses five connectors. Should all of them fail the deployment?',
      a: 'Only the ones the app cannot work without. A reporting database that is used once a day may be better as a logged warning and an alert.',
    },
    {
      q: 'What does Test Connection in the IDE prove?',
      a: 'That your machine can reach the system with those settings. It does not prove the deployed app can, since the network and properties differ.',
    },
  ],
}
