export default {
  id: 'ms-210',
  category: 'mulesoft',
  title: 'Toxicity Checks and Prompt Templates in a Mule Flow That Calls an LLM',
  level: 'INTERMEDIATE',
  tags: ['ai-agents', 'llm', 'security'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A retail support flow sends customer messages to an LLM (large language model, an AI model that reads and writes text). Abusive messages must never reach the LLM. Where does `[Toxicity] Detection by Text` belong?',
      options: [
        'After the LLM call, scoring the customer message once the reply has come back',
        'Before the LLM call, with a Choice that stops the message when it is flagged',
        'In a scheduled flow that scores all of the stored messages once a day',
        'After the LLM call, scoring the reply in place of the customer message',
      ],
      answer: 1,
      explain: 'Toxic input detection blocks harmful user input before it is sent to the LLM. The check has to run first, and the flow has to act on its result. A check after the call is too late for this goal.',
    },
    {
      type: 'single',
      prompt: 'A bank chat flow screens every customer message for toxicity. Even so, a customer receives an offensive reply from the LLM (large language model). What is the right change?',
      options: [
        'Run the input check twice, as one pass can miss text that the LLM reacts to',
        'Lower the number of messages in the array, as less history gives safer replies',
        'Also run the toxicity check on the LLM reply, before returning it to the customer',
        'Move the input check after the LLM call, so that one check covers both sides',
      ],
      answer: 2,
      explain: 'The operation scores harmful content from the user or the LLM. Input screening says nothing about what the model writes, so filtering responses needs a separate check on the reply.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A Mule flow runs `[Toxicity] Detection by Text`, and the next step is a Choice. What does the result give the Choice to route on?',
      options: [
        'A rewritten copy of the text with the harmful words removed',
        'A `flagged` true or false value, plus scores for each category',
        'A single word from the provider, such as `allow` or `block`',
        'An error raised by the connector whenever the text is harmful',
      ],
      answer: 1,
      explain: 'The operation returns JSON with a `flagged` boolean and `categories` that hold a score for each category, such as harassment or violence. It reports. It does not block by itself, so the flow must act on the result.',
    },
    {
      type: 'match',
      prompt: 'A returns flow uses `[Agent] Define Prompt Template` to sort customer feedback. Match each part of the prompt to the field it belongs in.',
      pairs: [
        ['You are a returns agent. Reply as JSON with a type of positive or negative.', 'Template'],
        ['Open a case and apologize for negative feedback. Thank the customer for positive feedback.', 'Instructions'],
        ['The feedback text the customer sent today', 'Data'],
      ],
      explain: 'The template sets the role and output format. The instructions give the goals of the task. The data is what the provider evaluates using the other two, and it is the part that changes on each call.',
    },
    {
      type: 'single',
      prompt: 'A shipping flow builds one long LLM prompt by joining the output format, the rules and the customer message in a single expression. A small format change broke the flow, and the expression is hard to review. What is the best redesign?',
      options: [
        'Move the whole joined string into a variable, so that the expression is out of sight',
        'Ask the customer to send the format and the rules along with each message',
        'Switch to `[Chat] Completions`, so that the model works out the format for itself',
        'Use a prompt template, keeping format and rules apart from the customer data',
      ],
      answer: 3,
      explain: '`[Agent] Define Prompt Template` separates the template, the instructions and the data. The fixed parts can then be reviewed and changed without touching the data that arrives on each call.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A Mule flow has a working Inference Connector text generation configuration. A developer adds `[Toxicity] Detection by Text` and cannot use it with that configuration. What is the likely cause?',
      options: [
        'The operation belongs to a moderation configuration, and fewer providers support it',
        'The operation runs only inside a flow that has no LLM call in it at all',
        'The operation needs a database connection before any text can be scored',
        'The operation works only on replies, and this flow passes it customer input',
      ],
      answer: 0,
      explain: 'Toxicity detection is listed under the connector\'s moderation configuration, and it has its own short list of supported providers. A provider that handles chat may not handle moderation.',
    },
  ],
  description: `
A retailer runs a returns assistant. A Mule flow takes a customer message, calls an **LLM** (large language model, an AI model that reads and writes text) through the **Inference Connector**, and returns the reply. The assistant works as an **agent**, an AI powered service that carries out tasks.

Two problems reached the support lead this month:

- **Incident 1:** abusive messages went straight to the LLM, and staff had to read them in the logs.
- **Incident 2:** one reply used wording that offended a customer.

The prompt is also one long string, built in a single expression. It mixes the output format, the rules and the customer message.

The connector offers \`[Toxicity] Detection by Text\`, which scores harmful content, and \`[Agent] Define Prompt Template\`, which takes a template, instructions and data.

**Questions**
1. Where do the toxicity checks go in the flow, and what happens when one is flagged?
2. What does the toxicity operation return?
3. How do you split the prompt?
`,
  answerTemplate: `## Toxicity checks in the flow

## What the operation returns

## Splitting the prompt
`,
  keyPoints: [
    '`[Toxicity] Detection by Text` classifies and scores harmful content from the user or the LLM.',
    'To keep toxic input away from the LLM, the check must run before the call.',
    'To filter harmful replies, a second check must run on the response before it is returned.',
    'The operation returns a `flagged` value and category scores, and the flow must route on them.',
    'A prompt template separates the template, the instructions and the data.',
    'The moderation operation has its own configuration and a shorter list of providers than chat.',
  ],
  solution: `
**Toxicity checks in the flow**
\`\`\`
 HTTP Listener
   ─► [Toxicity] Detection by Text   (customer message)
   ─► Choice: flagged?
        yes ─► Polite refusal, no LLM call
        no  ─► [Agent] Define Prompt Template
               ─► [Toxicity] Detection by Text   (LLM reply)
               ─► Choice: flagged?
                    yes ─► Safe fallback message
                    no  ─► Return the reply
\`\`\`
The two checks answer the two incidents. The first keeps abusive input away from the LLM. The second stops a harmful reply from reaching the customer.

**What the operation returns:** a JSON payload with a \`flagged\` boolean and \`categories\`, which hold a score for each category, such as harassment, hate or violence. The docs example does not define a scale or a cutoff, so route on \`flagged\` unless you have tested a rule of your own.

**Splitting the prompt**
| Field | Holds | Changes on each call? |
|---|---|---|
| Template | The role and the output format | No |
| Instructions | The goals of the task | No |
| Data | The customer message | Yes |

The format and the rules can now be reviewed on their own, and a change to one no longer risks the others.
`,
  followUps: [
    {
      q: 'Does a toxicity check stop every kind of risky prompt?',
      a: 'No. It scores harmful content. Treat it as one control. On a model proxy, Rogue Agent Detection is a separate policy that has rules for PII Leak, Privilege Escalation and Prompt Injection.',
    },
    {
      q: 'Which categories does the result score?',
      a: 'The docs example shows categories such as harassment, hate, sexual, violence, self-harm and illicit, with subcategories such as harassment/threatening.',
    },
    {
      q: 'Can the data field default to the payload?',
      a: 'Yes, Data defaults to the payload. Template and Instructions are required, and you set them on the operation.',
    },
  ],
}
