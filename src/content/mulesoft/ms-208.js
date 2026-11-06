export default {
  id: 'ms-208',
  category: 'mulesoft',
  title: 'A2A Connector in a Mule App: Taking Tasks, Delegating Tasks and the Agent Card',
  level: 'BEGINNER',
  tags: ['ai-agents', 'a2a'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'An HR company builds a payroll agent in a Mule app. An agent is an AI powered service that carries out tasks. Other agents must be able to send it tasks over A2A (Agent2Agent, how agents discover each other and delegate tasks). What does the Mule app need from the A2A Connector?',
      options: [
        'A client, so that the Mule app can poll other agents for new tasks',
        'A client, so that the Mule app can publish its tasks to other agents',
        'A server, so that the Mule app can receive tasks from other agents',
        'A server, so that the Mule app can send its tasks to other agents',
      ],
      answer: 2,
      explain: 'The server side exposes an endpoint and implements the A2A protocol, so a Mule agent can respond to requests from other agents.',
    },
    {
      type: 'single',
      prompt: 'A Mule app must hand a benefits question to a separate benefits agent that already speaks A2A (Agent2Agent, how agents discover each other and delegate tasks). What does the Mule app need from the A2A Connector?',
      options: [
        'A client, so that the Mule app can start the request to the benefits agent',
        'A server, so that the Mule app can start the request to the benefits agent',
        'A client, so that the benefits agent can start a request to the Mule app',
        'A server, so that the benefits agent can read the question from a queue',
      ],
      answer: 0,
      explain: 'The client side initiates requests and consumes what A2A servers offer. The Mule app is the one delegating, so it is the client.',
    },
    {
      type: 'single',
      prompt: 'A Mule agent in a shipping company takes tasks from a customer service agent. It then delegates the customs part of each task to a customs agent. Both links use A2A (Agent2Agent). How should the A2A Connector be set up?',
      options: [
        'Two Mule apps are required, as one app can hold only a single A2A role',
        'Client only, as a client can both take tasks in and pass them on',
        'Server only, as a server can both take tasks in and pass them on',
        'Server and client in the same Mule app, one for each direction of the work',
      ],
      answer: 3,
      explain: 'The connector can act as an A2A server, an A2A client or both in one Mule app. Taking tasks in is the server side, and delegating them is the client side.',
    },
    {
      type: 'single',
      prompt: 'Before it delegates anything, a Mule app wants to find out what a remote A2A (Agent2Agent) agent offers. What should it do?',
      options: [
        'Send a sample task and work out the offer from the error message',
        'Read the agent card that the remote agent serves',
        'Open the runtime logs of the remote agent',
        'Look up the agent in the Mule app\'s own Object Store',
      ],
      answer: 1,
      explain: 'Capability discovery is part of A2A. An agent describes itself in its agent card, and the A2A Connector client has a Get Card operation that fetches the card.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A Mule app uses the A2A Connector as a server, with its agent path set to `/payroll`. Where is its agent card served?',
      options: [
        '`/payroll/agent-card.xml`',
        '`/.well-known/payroll/card.json`',
        '`/payroll/.well-known/agent-card.json`',
        '`/payroll/api/v1/agents/card`',
      ],
      answer: 2,
      explain: 'The server connection serves the card at the agent path followed by `/.well-known/agent-card.json`. The card itself comes from the configuration, as a JSON string or from a JSON file.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each need in a Mule app that acts as an A2A client to the A2A Connector operation that meets it.',
      pairs: [
        ['Learn what a remote agent offers', '`A2A Client - Get Card`'],
        ['Delegate work to a remote agent', '`A2A Client - Send Message`'],
        ['Check on work that was delegated earlier', '`A2A Client - Get Task`'],
        ['Stop work that is no longer needed', '`A2A Client - Cancel Task`'],
      ],
      explain: 'The usual order is to read the card, send a message, follow the task, and cancel it if the work is no longer needed.',
    },
  ],
  description: `
An HR company is building a new hire assistant in Mule. It runs as an **agent**, an AI powered service that carries out tasks. The company also has a separate payroll agent.

- The new hire agent must **take tasks** from the company's HR portal agent.
- It must **delegate** the pay setup part of each task to the payroll agent.
- It should find out what the payroll agent offers before it sends anything.

All of this uses **A2A** (Agent2Agent), which is how agents discover each other and delegate tasks. The **A2A Connector** adds an A2A server, an A2A client or both to a Mule app. An **agent card** is the document an agent serves to describe itself to other agents.

**Questions**
1. Which side of the connector takes tasks in, and which side delegates them?
2. Can one Mule app do both?
3. How does the new hire agent find out what the payroll agent offers?
`,
  answerTemplate: `## Taking tasks and delegating tasks

## Both in one app

## Finding out what an agent offers
`,
  keyPoints: [
    'A2A (Agent2Agent) is how agents discover each other and delegate tasks.',
    'The server side exposes an endpoint so that a Mule agent can receive and respond to A2A requests.',
    'The client side initiates requests to A2A servers.',
    'One Mule app can act as an A2A server and an A2A client.',
    'An agent serves an agent card, and an A2A client can fetch it with the Get Card operation.',
    'A client delegates with Send Message, and can follow or stop the work with Get Task and Cancel Task.',
  ],
  solution: `
**Taking tasks and delegating tasks**
| Need | Side of the connector | What it uses |
|---|---|---|
| Take tasks from the HR portal agent | Server | \`A2A Server - Task Listener\` starts a flow for each incoming request |
| Find out what the payroll agent offers | Client | \`A2A Client - Get Card\` |
| Delegate pay setup | Client | \`A2A Client - Send Message\` |
| Follow the delegated work | Client | \`A2A Client - Get Task\` |

**Both in one app:** yes. The connector works as an A2A server and an A2A client inside one Mule app. The new hire agent is a server to the HR portal agent and a client of the payroll agent.

**Finding out what an agent offers:** capability discovery is part of A2A. The client connection takes the base URL of the target agent and uses it to discover the agent card at \`/.well-known/agent-card.json\`. On the server side, you supply your own card in the configuration, as a JSON string or from a JSON file.
`,
  followUps: [
    {
      q: 'What does a client need to reach a remote agent?',
      a: 'A client configuration with a connection to the target agent. Its Agent Url setting is the base URL of that agent, which is also used to discover the agent card.',
    },
    {
      q: 'Can the client get updates as the work moves on, without asking again?',
      a: 'Yes. `A2A Client - Send Stream Message` sends a message and opens an SSE stream for real time updates. SSE (server sent events) keeps a connection open so the server can push updates.',
    },
    {
      q: 'What if the remote agent runs on a platform that does not speak A2A?',
      a: 'That is what A2A Bridge is for. It runs on Omni Gateway and presents an A2A compliant front for a source agent such as Agentforce, and the source agent does not change.',
    },
  ],
}
