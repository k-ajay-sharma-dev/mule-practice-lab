export default {
  id: 'ms-211',
  category: 'mulesoft',
  title: 'Choice Router: Order of Routes, Otherwise and Conditions That Fail',
  level: 'BEGINNER',
  tags: ['choice', 'routers', 'dataweave', 'error-handling', 'insurance'],
  estMinutes: 10,
  quiz: [
    {
      type: 'single',
      prompt: 'An insurer routes claims with a Choice router. Route 1 has `#[payload.amount > 1000]` and sends the claim to manual review. Route 2 has `#[payload.amount > 50000]` and sends it to the fraud team. Where does a claim of 80,000 go?',
      options: [
        'To both teams, because both conditions are true',
        'To the fraud team, because its condition is the stricter one',
        'To manual review only, because the first true route wins',
        'Nowhere, because two true conditions raise a routing error',
      ],
      answer: 2,
      explain: 'Choice checks the `when` routes from top to bottom and runs only the first one that is true. Put the most specific condition first, so the 50,000 rule must come before the 1,000 rule.',
    },
    {
      type: 'single',
      prompt: 'A Choice router has two `when` routes and no `otherwise`. A claim matches neither route. What happens next?',
      options: [
        'The flow stops and returns an empty response to the caller',
        'The event leaves the Choice unchanged and the next step runs',
        'The router raises an error because no route was found',
        'The router runs the last `when` route as a fallback',
      ],
      answer: 1,
      explain: 'In Mule 4, when no route matches and there is no `otherwise`, the event passes through the Choice as it came in. If that is not safe, add an `otherwise` that does something on purpose, such as raising an error.',
    },
    {
      type: 'single',
      prompt: 'Some claims arrive with no `amount` field. The Choice condition is `#[payload.amount > 1000]`. What is the safest fix?',
      options: [
        'Write `#[(payload.amount default 0) > 1000]`, or check for the field in an earlier step',
        'Wrap the Choice in a Try with On Error Continue, so a failed condition moves to the next route',
        'Write `#[payload.amount as String > "1000"]`, so a missing field compares as an empty String',
        'Leave it as it is, because a missing field makes the condition false and `otherwise` runs',
      ],
      answer: 0,
      explain: 'A missing field reads as `null`, and comparing `null` with a Number fails in DataWeave, so the condition raises an error. A default value, or a validation step before the Choice, keeps routing predictable.',
    },
    {
      type: 'match',
      prompt: 'Match each routing rule to the condition you would write in its `when` route.',
      pairs: [
        ['The claim type is MOTOR', '`#[payload.claimType == "MOTOR"]`'],
        ['The caller sent an x-priority header', '`#[attributes.headers."x-priority" != null]`'],
        ['An earlier step marked the customer as a VIP', '`#[vars.isVip == true]`'],
      ],
      explain: 'A condition is a DataWeave expression that returns true or false. It can read the payload, the attributes from the source, such as HTTP headers, and variables set by earlier steps.',
    },
    {
      type: 'single',
      prompt: 'Every route of a Choice ends with the same three steps: write an audit record, set a header and log. How should the flow be changed?',
      options: [
        'Keep the copies, as steps after a Choice run only when the `otherwise` route ran',
        'Move the three steps into `otherwise`, as it runs after whichever `when` route ran',
        'Replace the Choice with Scatter-Gather, so the shared steps run once for each route',
        'Move the three steps after the Choice, where every path reaches them',
      ],
      answer: 3,
      explain: 'After the Choice finishes, the flow carries on with the next step whatever route ran. Shared steps belong there. Copies in each route drift apart over time.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'A developer wants a Choice router to run both the email route and the SMS route when a customer wants both. What is the right advice?',
      options: [
        'Turn on the Choice setting that runs every matching route, in place of the first one',
        'Use Scatter-Gather, or two Choice routers in a row, one per channel',
        'Join both conditions with `or` in one `when` route, so that both channels then run',
        'Add a second `otherwise` route, as each `otherwise` can handle one more channel',
      ],
      answer: 1,
      explain: 'Choice always runs at most one route. Scatter-Gather sends a copy of the event to every route. Two separate Choice routers, one for email and one for SMS, also work and keep each decision simple.',
    },
  ],
  description: `
An insurer receives claims through a Mule API. A Choice router decides where each claim goes:

- Claims above 1,000 go to manual review.
- Claims above 50,000 go to the fraud team.
- Everything else is paid automatically.

Three problems came up in testing:

- A claim of 80,000 never reached the fraud team.
- A developer removed the \`otherwise\` route while debugging. Small claims then passed through the flow without being paid or reviewed, and no error was raised.
- A claim with no \`amount\` field made the flow fail with a DataWeave error.

**Questions**
1. How does the Choice router pick a route, and why did the 80,000 claim miss the fraud team?
2. What happens when no route matches, and how do you make that case safe?
3. Why did the missing \`amount\` cause an error, and how do you fix it?
`,
  answerTemplate: `## How Choice picks a route

## When no route matches

## The missing amount
`,
  keyPoints: [
    'Choice checks its `when` routes in order and runs only the first one that is true.',
    'Put the most specific condition first, or a broader one will catch its events.',
    'With no match and no `otherwise`, the event leaves the Choice unchanged.',
    'A condition that compares `null` with a Number fails. Use `default` or validate the payload first.',
    'Steps that every route needs belong after the Choice, not copied into each route.',
  ],
  solution: `
**1. How Choice picks a route.** The router reads the \`when\` routes from top to bottom and runs the first one whose condition is true. It never runs two routes. The 80,000 claim matched \`amount > 1000\` first, so it went to manual review and the fraud rule was never checked. Reorder the routes:

| Order | Condition | Route |
|---|---|---|
| 1 | \`payload.amount > 50000\` | Fraud team |
| 2 | \`payload.amount > 1000\` | Manual review |
| otherwise | | Automatic payment |

**2. When no route matches.** With no \`otherwise\`, the event leaves the Choice unchanged and the flow moves on. Nothing fails, which is why the small claims slipped through quietly. Put the \`otherwise\` back with the automatic payment in it. In a Choice where no default action is safe, make the \`otherwise\` raise an error on purpose, so an unexpected case is seen.

**3. The missing amount.** \`payload.amount\` is \`null\` when the field is missing, and \`null > 1000\` fails in DataWeave. Write \`(payload.amount default 0) > 1000\` only if a missing amount should be treated as zero. For claims it is better to validate the payload before the Choice and return a 400 to the caller.
`,
  followUps: [
    {
      q: 'Can a Choice condition call a function from a DataWeave module?',
      a: 'Yes. A `when` expression is DataWeave, so it can import a module from `src/main/resources` and call a function such as `isHighRisk(payload)`. That keeps long rules out of the XML.',
    },
    {
      q: 'Does the Choice router copy the event for the route it runs?',
      a: 'No. The chosen route works on the same event. Changes it makes to the payload and variables are still there after the Choice.',
    },
    {
      q: 'When would you use Validation module operations instead of a Choice?',
      a: 'When the goal is to stop bad input rather than pick a path. A validator such as `is-not-null` raises an error that an error handler turns into a clear response, which is cleaner than a Choice route that raises an error by hand.',
    },
  ],
}
