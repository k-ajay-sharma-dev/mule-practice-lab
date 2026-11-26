export default {
  id: 'ms-214',
  category: 'mulesoft',
  title: 'Parse Template and Dynamic Evaluate: Templates as Files and Scripts as Data',
  level: 'INTERMEDIATE',
  tags: ['parse-template', 'dynamic-evaluate', 'dataweave', 'components', 'security', 'travel'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'A travel company sends a booking confirmation email. Its HTML is long and the marketing team edits it often. Only a few values change per booking. Which component builds the email body?',
      options: [
        'Transform Message, writing the whole HTML as one long String with the values joined in',
        'Dynamic Evaluate, pointing at an HTML file with `#[...]` expressions for the values',
        'Parse Template, pointing at an HTML file with `#[...]` expressions for the values',
        'Transform Message with `readUrl` of the HTML file, which fills in each `#[...]` value',
      ],
      answer: 2,
      explain: 'Parse Template reads a text file, evaluates the expressions written inside it against the current event, and returns the result. The HTML stays a normal file that people can edit.',
    },
    {
      type: 'single',
      prompt: 'The template has `<p>Dear #[payload.firstName],</p>`. A booking arrives with `firstName` set to "Ana". What does that line become?',
      options: [
        '`<p>Dear #[payload.firstName],</p>`, as expressions run only in a `.dwl` file',
        '`<p>Dear Ana,</p>`',
        '`<p>Dear "Ana",</p>`, as the value is written as a JSON String with quotes',
        'An error, as the template needs an `output text/html` line before any expression',
      ],
      answer: 1,
      explain: 'Each `#[...]` in the template is a DataWeave expression. It is run against the current event, and its result replaces it in the output.',
    },
    {
      type: 'single',
      prompt: 'Each travel partner has its own commission rule, written as a short DataWeave script and kept in a database table. Rules change weekly without a redeploy. Which component runs the right rule?',
      options: [
        'Parse Template, with the rule from the table passed in as the template text',
        'Transform Message, with the script from the table placed in a variable',
        'A Choice router with one route per partner, each holding the partner rule',
        'Dynamic Evaluate, with the expression set to the script read from the table',
      ],
      answer: 3,
      explain: 'Dynamic Evaluate takes an expression whose result is a DataWeave script, then runs that script. That is what lets a script stored as data change without a new release.',
    },
    {
      type: 'single',
      prompt: 'The commission scripts need the booking total and the partner tier. How does Dynamic Evaluate pass them in?',
      options: [
        'Through its parameters, which the script reads by name',
        'Through system properties, which the script reads with `p()`',
        'Through attributes, which Dynamic Evaluate fills from its inputs',
        'Through its target variable, which holds the inputs for the script',
      ],
      answer: 0,
      explain: 'Dynamic Evaluate has a parameters section. Each parameter has a name, and the script uses that name. The script can also read the payload and variables of the event.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A developer proposes letting partners send their own commission script in the request body, to be run with Dynamic Evaluate. What is the main problem?',
      options: [
        'Dynamic Evaluate reads scripts from files only, not from a body',
        'The script could not read variables, so the commission would fail',
        'Callers could run any code they like inside your app',
        'The script is compiled at deploy time, so new ones are ignored',
      ],
      answer: 2,
      explain: 'A script from a caller is code from outside your control. It could read variables, call Java or loop forever. Only run scripts that your own team stores and reviews.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the component that fits it.',
      pairs: [
        ['Fixed mapping from a booking to a partner format', 'Transform Message'],
        ['A long HTML or text document with a few values filled in', 'Parse Template'],
        ['A rule written as a script that changes without a release', 'Dynamic Evaluate'],
      ],
      explain: 'Transform Message is the default for logic known at build time. Parse Template keeps a document as a file. Dynamic Evaluate is for the rare case where the script itself is data.',
    },
  ],
  description: `
A travel company's booking app has two new needs:

- **Confirmation emails.** The marketing team owns a long HTML email. A few values change per booking, such as the name, the dates and the booking reference. Today the HTML sits inside a Transform Message as one String, and every wording change needs a developer.
- **Partner commission.** Each of 30 partners has its own commission rule. The finance team wants to change a rule without waiting for a release. They suggest storing each rule as a short DataWeave script in a database table.

**Questions**
1. How would you build the email so that marketing can edit the HTML?
2. How would you run a commission rule that is stored as a script?
3. What are the risks of running scripts from data, and how do you limit them?
`,
  answerTemplate: `## The confirmation email

## Running a stored rule

## Risks and limits
`,
  keyPoints: [
    'Parse Template reads a text file, evaluates the `#[...]` expressions in it and returns the filled-in text.',
    'The template file usually lives in `src/main/resources` and is set with the `location` attribute.',
    'Dynamic Evaluate runs a DataWeave script that is itself the result of an expression, such as a value read from a database.',
    'Parameters on Dynamic Evaluate pass named values into the script.',
    'Never run a script that a caller can supply. Store scripts where only your team can change them, and review them.',
    'Transform Message stays the default for logic that is known at build time.',
  ],
  solution: `
**1. The confirmation email.** Move the HTML into \`src/main/resources/templates/booking-confirmation.html\` and use **Parse Template** with \`location\` set to that path. Inside the HTML, write expressions where the values go, such as \`#[payload.bookingRef]\`. The result becomes the payload, or a variable if you set a target, and goes to the email step. Marketing edits a plain HTML file, and the flow does not change.

**2. Running a stored rule.**
\`\`\`
 Database Select: rule script for partnerId  ─► vars.ruleScript
 Dynamic Evaluate
   expression: #[vars.ruleScript]
   parameters: total = payload.total, tier = vars.partnerTier
\`\`\`
The script in the table reads \`total\` and \`tier\` by name and returns the commission. Cache the scripts, for example in an Object Store with a time to live, so the table is not read on every booking.

**3. Risks and limits.**
| Risk | Limit |
|---|---|
| A script runs code nobody tested | Store scripts in a table only finance and the integration team can change, and test each rule before it is saved |
| A caller supplies the script | Never take a script from a request or a header |
| A broken script fails bookings | Wrap Dynamic Evaluate in a Try and fall back to a default rule, then alert |
| Nobody knows which rule ran | Store a version with each script and log it with the result |
`,
  followUps: [
    {
      q: 'Could the commission rules be data instead of scripts?',
      a: 'Often, yes. If every rule is a rate and a cap, store those two numbers per partner and keep one fixed Transform. Scripts as data are only worth the risk when the rules really differ in shape.',
    },
    {
      q: 'Can Parse Template build things other than HTML?',
      a: 'Yes. It works on any text, such as an XML request with a fixed shape, a plain text message or a SQL report layout. The expressions are filled in the same way.',
    },
    {
      q: 'How would you test a template?',
      a: 'In MUnit, run the flow with a known payload and assert on parts of the output, such as the booking reference appearing in the HTML. Keep one test per template so a wording change that breaks an expression is caught.',
    },
  ],
}
