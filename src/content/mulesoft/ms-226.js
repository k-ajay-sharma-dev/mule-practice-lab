export default {
  id: 'ms-226',
  category: 'mulesoft',
  title: 'Debugging a Flow in Anypoint Studio: Breakpoints, the Mule Debugger and Evaluating Expressions',
  level: 'BEGINNER',
  tags: ['anypoint-studio', 'debugging', 'breakpoints', 'dataweave', 'troubleshooting', 'fundamentals', 'retail'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'You set a breakpoint on a Transform Message and run the project normally with Run. What happens at the breakpoint?',
      options: [
        'The flow stops there and the debugger opens',
        'Nothing. Breakpoints only stop the flow when the project runs in debug mode',
        'The app fails to start',
        'The Transform is skipped',
      ],
      answer: 1,
      explain: 'Breakpoints work only when you start the project with Debug. A normal run ignores them.',
    },
    {
      type: 'single',
      prompt: 'The flow stops at a breakpoint on a Logger. What has run so far?',
      options: [
        'Every component before the Logger. The Logger itself has not run yet',
        'The whole flow, including the Logger',
        'Nothing, the flow stops at the event source',
        'Only the Logger',
      ],
      answer: 0,
      explain: 'The debugger stops before the component with the breakpoint. The values you see are the input to that component.',
    },
    {
      type: 'single',
      prompt: 'At a breakpoint you want to test `payload.lines filter ($.qty > 0)` without changing the flow. Where do you type it?',
      options: [
        'In a new Logger, then run again',
        'In the property file',
        'In the Evaluate DataWeave Expression window of the debugger',
        'In the Console view',
      ],
      answer: 2,
      explain: 'The debugger can run a DataWeave expression against the current event. It is a quick way to try a fix before you edit the script.',
    },
    {
      type: 'multi',
      prompt: 'Which parts of the event can you look at in the Mule Debugger view while stopped?',
      options: ['The payload', 'The attributes', 'The variables', 'The logs of other apps running on CloudHub'],
      answer: [0, 1, 2],
      explain: 'The debugger shows the current event: payload, attributes and variables. It knows nothing about other apps.',
    },
    {
      type: 'single',
      prompt: 'A For Each runs 500 times and only item 312 fails. How do you stop there without pressing resume 311 times?',
      options: [
        'Remove the other 499 items from the test file',
        'Put a condition on the breakpoint, such as an expression that is true only for that item',
        'Add a Logger with level DEBUG',
        'Set the For Each batch size to 312',
      ],
      answer: 1,
      explain: 'A conditional breakpoint stops only when its expression is true, so the flow runs freely until the item you care about.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to find why a total is wrong in a flow.',
      items: [
        'Put a breakpoint on the component before the total is built',
        'Start the project in debug mode and send a test request',
        'Check the payload and variables in the debugger',
        'Try a corrected expression in the evaluate window',
        'Change the script and run the request again',
      ],
      explain: 'Stop close to the problem, read the real values, try the fix on those values, then change the code.',
    },
  ],
  description: `
Kestrel Garden Stores has a Mule app that takes online orders and works out a total with delivery charges. A tester reports that orders with a voucher come out with the wrong total. The developer added six Loggers to find the problem, and the log is now hard to read.

A senior developer suggests using the Studio debugger instead.

**Questions**
1. How do you start a project so that breakpoints work, and where do you put the first breakpoint?
2. What can you see when the flow stops, and what has already run?
3. How do you test a corrected DataWeave expression without changing the flow?
4. How do you stop inside a loop only for the one item that fails?
5. When is a Logger still the better tool?
`,
  answerTemplate: `## Starting in debug mode

## What you see at a breakpoint

## Trying an expression

## Stopping on one item

## Debugger or Logger
`,
  keyPoints: [
    'Breakpoints only stop the flow when the project runs in debug mode.',
    'The flow stops before the component that has the breakpoint.',
    'The Mule Debugger view shows the payload, attributes and variables of the current event.',
    'The Evaluate DataWeave Expression window runs an expression against the current event.',
    'A conditional breakpoint stops only when its expression is true.',
    'Use the debugger on your own machine. Use Loggers for problems in shared or production environments.',
  ],
  solution: `
**1. Starting.** Right-click the project and choose Debug instead of Run. Studio starts the app with the debugger attached and opens the Mule Debug perspective. Put the first breakpoint on the component right before the total is built, here the Transform that applies the voucher.

**2. At a breakpoint.** The flow stops before that component runs. The Mule Debugger view shows the payload, attributes and variables as they reach it. Step to the next component to see what it changed, or resume to run until the next breakpoint.

**3. Trying a fix.** Open the Evaluate DataWeave Expression window and run expressions against the current event, for example the voucher rule on its own. When a version gives the right number, copy it into the script and run the request again.

**4. One item in a loop.** Add a condition to the breakpoint, such as an expression on the order line id. The flow runs freely and stops only when that line comes through.

**5. Debugger or Logger.** The debugger fits work on your own machine, with test data you can send again. On a shared test server or in production you cannot stop the app, so a few well chosen Loggers with a correlation id are the right tool there. Remove the six debug Loggers once the bug is fixed.
`,
  followUps: [
    {
      q: 'The breakpoint never triggers. What do you check first?',
      a: 'Check that the project was started with Debug and not Run. Then check that the request really reaches that flow, for example by putting a breakpoint on the first component after the listener.',
    },
    {
      q: 'Can you debug a DataWeave script without running the whole flow?',
      a: 'Yes. The Transform Message preview runs the script against sample data you give it. That is faster for script problems, and the debugger is better when the data comes from earlier steps.',
    },
    {
      q: 'Why not leave the debug Loggers in the code at DEBUG level?',
      a: 'A few with clear messages can help later. Six that print whole payloads make the log noisy and may write personal data, so keep only the useful ones and log ids instead of full payloads.',
    },
  ],
}
