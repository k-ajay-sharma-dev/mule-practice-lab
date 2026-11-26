export default {
  id: 'ms-209',
  category: 'mulesoft',
  title: 'Inference Connector: Calling an LLM From a Mule Flow and Keeping Chat History',
  level: 'BEGINNER',
  tags: ['ai-agents', 'llm'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'A developer at a shipping company sets up the MCP Connector as a client, points it at the chat API of an LLM (large language model) provider, and tries to send a question. It does not work. What is the cause, and what fits?',
      options: [
        'The MCP client needs SSE, and the provider offers Streamable HTTP, so switch the transport',
        'The provider must be in Agent Registry first, and then the MCP client can send it prompts',
        'The MCP client sends tasks, not prompts, so the A2A Connector has to wrap the question',
        'An MCP client calls tools on MCP servers, and a chat API is not one, so use Inference Connector',
      ],
      answer: 3,
      explain: 'The MuleSoft Inference Connector gives a Mule app access to the inference APIs of LLM providers. MCP is for clients listing and calling tools on MCP servers, so a transport change or a registry entry does not turn a chat API into one. A2A is for agents delegating to agents, not for sending a prompt to a model.',
    },
    {
      type: 'single',
      prompt: 'A retail Mule flow asks an LLM (large language model) one standalone question for each request, and nothing from earlier requests matters. Which Inference Connector operation fits best?',
      options: [
        '`[Chat] Answer Prompt`, which takes one plain text prompt and returns an answer',
        '`[Chat] Completions`, which needs a stored history before it can give an answer',
        '`[Agent] Define Prompt Template`, which needs a template and instructions too',
        '`[Toxicity] Detection by Text`, which answers one plain text prompt with a score',
      ],
      answer: 0,
      explain: '`[Chat] Answer Prompt` is a single turn request with plain text in and a plain text answer out. It has no field for conversation history. A prompt template suits fixed instructions around changing data, which this flow does not need.',
    },
    {
      type: 'single',
      prompt: 'A bank chat assistant in Mule must let a customer ask follow up questions, and the LLM (large language model) must see what was said earlier. Which Inference Connector operation fits, and what does it take?',
      options: [
        '`[Chat] Answer Prompt`, with a session id that makes the LLM recall the chat',
        '`[Chat] Answer Prompt`, with the earlier messages sent in a separate request',
        '`[Chat] Completions`, with a session id that makes the LLM recall the chat',
        '`[Chat] Completions`, with a messages array that holds the conversation so far',
      ],
      answer: 3,
      explain: '`[Chat] Completions` takes the conversation history as a JSON array of messages. That array is how the model sees the earlier turns.',
    },
    {
      type: 'single',
      prompt: 'A Mule chat flow calls `[Chat] Completions` on each new customer message. After a redeploy, and between messages, where should the earlier conversation be kept?',
      options: [
        'Inside the Inference Connector, which saves each exchange by itself',
        'In an Object Store or a database, read and passed in on each call',
        'At the LLM provider, which recalls each customer without being sent anything',
        'In a flow variable, which stays in place from one request to the next',
      ],
      answer: 1,
      explain: 'The connector does not hold the history for you. An Object Store or any database can hold the earlier conversation, and the flow passes it in the Messages field on each call. A flow variable lives only for one event.',
    },
    {
      type: 'single',
      prompt: 'An HR Mule flow sends employee feedback to an LLM (large language model). Each call must use a fixed role and output format, set goals, and the feedback text as separate inputs. Which Inference Connector operation is built for that?',
      options: [
        '`[Chat] Answer Prompt`, which keeps role, goals and text in separate fields',
        '`[Toxicity] Detection by Text`, which applies a role and goals to the text',
        '`[Agent] Define Prompt Template`, which takes a template, instructions and data',
        '`[Tools] Native Template`, which sends the text to a list of feedback tools',
      ],
      answer: 2,
      explain: '`[Agent] Define Prompt Template` has separate Template, Instructions and Data fields, so the fixed parts stay apart from the data that changes on each call.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each need in a Mule app to the Inference Connector operation that meets it.',
      pairs: [
        ['Let the LLM use tools hosted on MCP servers', '`[MCP] Tooling`'],
        ['Let the LLM choose from tools you list as a JSON array', '`[Tools] Native Template`'],
        ['Score text for harmful content', '`[Toxicity] Detection by Text`'],
        ['Hold a conversation over several turns', '`[Chat] Completions`'],
      ],
      explain: 'MCP (Model Context Protocol) is how an AI client lists and calls tools, and `[MCP] Tooling` works with MCP client configurations. `[Tools] Native Template` takes its tools as a JSON array. Toxicity detection returns a flag and scores, not an answer.',
    },
  ],
  description: `
A shipping company wants a help assistant inside its customer portal. Behind it is a Mule app that calls an **LLM** (large language model), an AI model that reads and writes text.

- **Quick answers:** one question in, one answer out, with no memory of earlier requests.
- **Chat:** a customer asks about a parcel, then asks "and when will it arrive?". The LLM must see the earlier messages to make sense of that.

The **MuleSoft Inference Connector** talks directly to inference provider APIs from a Mule app. It has operations for chat, prompt templates, tools and toxicity detection. Which operations work depends on the provider and model. Some operations are built for **agents**, AI powered services that carry out tasks. Others use **MCP** (Model Context Protocol), which is how an AI client lists and calls tools.

**Questions**
1. Which operation fits quick answers, and which fits chat?
2. Where does the chat history live?
3. What does the Mule app send on each chat turn?
`,
  answerTemplate: `## Operation for each need

## Where the chat history lives

## What each chat turn sends
`,
  keyPoints: [
    'An LLM (large language model) is an AI model that reads and writes text.',
    'The Inference Connector talks directly to inference provider APIs from a Mule app.',
    '`[Chat] Answer Prompt` is a single turn: a plain text prompt in, and a plain text answer out.',
    '`[Chat] Completions` takes a JSON array of messages, so the conversation history goes in on each call.',
    'The connector does not keep the history. An Object Store or a database can hold it.',
    '`[Agent] Define Prompt Template` separates the template, the instructions and the data.',
    'Operation support varies by provider and model.',
  ],
  solution: `
**Operation for each need**
| Need | Operation | Why |
|---|---|---|
| Quick answers | \`[Chat] Answer Prompt\` | Single turn, with a plain text prompt |
| Chat | \`[Chat] Completions\` | Takes the conversation as a messages array |

**Where the chat history lives:** in your app's storage, such as an Object Store or a database. The connector does not hold it for you.

**What each chat turn sends**
1. Read the earlier messages for this customer from the store.
2. Add the new customer message to the array.
3. Call \`[Chat] Completions\` with the whole array in the Messages field.
4. Save the new message and the reply back to the store.
5. Return the reply to the customer.

The working rule: the model sees only what the call sends it, so anything it must remember has to be in the array.
`,
  followUps: [
    {
      q: 'Where does the answer appear after a chat operation?',
      a: 'Most text operations return a JSON object with a `response` field in the payload. Attributes carry extras such as `tokenUsage`, with input, output and total counts.',
    },
    {
      q: 'Why not hold the history in a flow variable?',
      a: 'A variable lives on one Mule event. Each chat message is a new request and a new event, so the variable from the last message is gone.',
    },
    {
      q: 'Does every operation work with every provider?',
      a: 'No. The docs list support by provider and model. Chat has many providers, while moderation, vision and image generation have fewer, so check before you pick a provider.',
    },
  ],
}
