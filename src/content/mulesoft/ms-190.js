export default {
  id: 'ms-190',
  category: 'mulesoft',
  title: 'Anypoint Studio on a Laptop vs an App Running on CloudHub',
  level: 'BEGINNER',
  tags: ['cloudhub', 'deployment', 'runtime-manager', 'environments', 'properties', 'logging'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A developer runs a Mule app from Anypoint Studio on a laptop, then shuts the laptop and goes home. A partner tries to call the app that evening. What happens?',
      options: [
        'CloudHub takes over the app, because Studio copies it there on shutdown',
        'The call waits in a queue until the laptop is turned on the next morning',
        'The call fails, because the app was only running on that one laptop',
        'The call works, because Studio keeps the app running in Anypoint Platform',
      ],
      answer: 2,
      explain: 'Studio runs the app on a Mule runtime built into Studio, on your own machine. When the laptop stops, so does the app. Nothing is sent to the cloud unless you deploy it.',
    },
    {
      type: 'match',
      prompt: 'A shipping company has a Mule app on its way to production. Match each task to the place where it is done.',
      pairs: [
        ['Drag components into a flow and step through it with the debugger', 'Anypoint Studio'],
        ['Keep the app running all day for real callers', 'CloudHub'],
        ['Deploy the app and check whether it has started', 'Runtime Manager'],
      ],
      explain: 'Studio is the tool for building and testing. CloudHub is the managed cloud where the app runs. Runtime Manager is the screen where you deploy and look after it.',
    },
    {
      type: 'single',
      prompt: 'A Mule app reads order files from `C:\\orders\\in`. It works in Anypoint Studio on a laptop. After deployment to CloudHub, it cannot find the folder. Why?',
      options: [
        'CloudHub only accepts file paths that are written in upper case',
        'That folder is on the laptop, and the app now runs on a cloud server',
        'The File connector can only be used with apps running inside Studio',
        'CloudHub deletes the folder each time that an app is started again',
      ],
      answer: 1,
      explain: 'In the cloud, the app runs on a machine that MuleSoft manages, and your laptop disk is not part of it. Files that a deployed app must read need to be somewhere it can reach, such as an SFTP server.',
    },
    {
      type: 'single',
      prompt: 'A Mule app uses a test database when run from Anypoint Studio and must use a different database on CloudHub. What is the usual way to handle this without changing the code for each move?',
      options: [
        'Keep two copies of the project, each with its own database host',
        'Ask CloudHub support to change the host inside the deployed app',
        'Write the production host in the flow and change it back for tests',
        'Use a property such as `${db.host}` and set its value per environment',
      ],
      answer: 3,
      explain: 'A property is a named value that the app reads when it starts. The same app can then run in different places, with a different value in each. Runtime Manager lets you set property values for a deployed app.',
    },
    {
      type: 'single',
      prompt: 'A Logger component prints messages to the console in Anypoint Studio when a Mule app runs on a laptop. The same app is now running on CloudHub. Where would a developer normally read those messages?',
      options: [
        'In the Studio console, which stays connected to all deployed apps',
        'In the log view for the app in Runtime Manager',
        'In the page for the app in Anypoint Exchange',
        'In the policy settings of API Manager',
      ],
      answer: 1,
      explain: 'A deployed app writes its logs where it runs, not to your laptop. Runtime Manager shows the logs for an app on CloudHub.',
    },
    {
      type: 'single',
      prompt: 'A Mule project works in Anypoint Studio and is ready to go live on CloudHub. What is actually moved to the cloud?',
      options: [
        'The app, packaged as a deployable JAR file that a Mule runtime can run',
        'A full copy of Studio, which then runs the project on a cloud server',
        'Nothing, as CloudHub forwards each call to the laptop of the developer',
        'The flow XML, which is pasted into a form in API Manager to start it',
      ],
      answer: 0,
      explain: 'The project is packaged as a JAR file. CloudHub starts it on a Mule runtime that MuleSoft manages. Studio is only the building tool, so it stays on the laptop.',
    },
  ],
  description: `
A shipping company has a new **Parcel Tracker** Mule app. It works well on a developer's laptop. Calling \`http://localhost:8081/parcels/123\` in a browser gets the right answer.

The manager says: "Great, send the link to our partner."

The developer explains that this link only works on that laptop. The app must first be deployed to **CloudHub**, which is MuleSoft's managed cloud for running Mule apps. **Anypoint Studio** is the desktop tool used to build them.

**Questions**
1. What is the difference between running the app in Studio and running it on CloudHub?
2. Why can the partner not use the \`localhost\` link?
3. What moves from the laptop to CloudHub, and how?
4. What might work on the laptop but fail on CloudHub?
`,
  answerTemplate: `## Studio and CloudHub

## Why localhost does not work for the partner

## What moves and how

## What might fail after the move
`,
  keyPoints: [
    'Studio is a desktop tool for building and testing, with a Mule runtime built in.',
    'CloudHub is a cloud managed by MuleSoft, where Mule apps run for real callers.',
    'localhost means this machine, so that link only works on the laptop.',
    'The project is packaged as a JAR file and deployed, for example through Runtime Manager.',
    'Laptop files and local services are not available to the deployed app.',
    'Use properties for values that differ by environment.',
    'Logs for a deployed app are in Runtime Manager, not in the Studio console.',
  ],
  solution: `
**1. The difference.** Studio is where you build. When you press Run, the app runs on a Mule runtime inside Studio, on your laptop, for as long as the laptop and Studio are running. CloudHub is where the app lives for real use. MuleSoft manages the servers, and the app keeps running when you go home.

**2. The link.** \`localhost\` means "this machine". On the partner's computer, it points to the partner's own computer. A deployed app gets an address that other people can reach.

**3. What moves.** The project is packaged as a deployable JAR file. You deploy it, for example through **Runtime Manager**, and CloudHub starts it on a Mule runtime. Studio stays on the laptop.

**4. What might fail.**
- A path such as \`C:\\orders\\in\` is on the laptop, so the cloud server cannot see it.
- A database on \`localhost\` is on the laptop too. The app needs a host it can reach from the cloud.
- Values typed into the flows do not change by environment. Use properties such as \`\${db.host}\` instead.

Logs move as well. Look in Runtime Manager rather than the Studio console.
`,
  followUps: [
    {
      q: 'Is the Mule app different in the two places?',
      a: 'The flows are the same. What differs is where the app runs and the values given to it, such as hosts and passwords.',
    },
    {
      q: 'Do you need Studio to keep a CloudHub app running?',
      a: 'No. After deployment, the app runs without Studio. You only go back to Studio to change the code.',
    },
    {
      q: 'Why test on a laptop at all?',
      a: 'It is fast. You can run a flow, step through it with the debugger and fix it before anything reaches a shared environment.',
    },
  ],
}
