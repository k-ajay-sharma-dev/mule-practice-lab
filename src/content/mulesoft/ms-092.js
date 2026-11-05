export default {
  id: 'ms-092',
  category: 'mulesoft',
  title: 'MUnit Mocking and Spying in Practice: Targeted Mocks, then-call, Target Variables and Matchers',
  level: 'ADVANCED',
  tags: ['munit', 'testing', 'mocking', 'spy', 'assertions'],
  estMinutes: 35,
  quiz: [
    {
      type: 'single',
      prompt: 'The suite has one `mock-when processor="http:request"` with no `with-attributes`. The flow makes carrier calls and a separate FX call. Why does the test give unrealistic results?',
      options: [
        'With no attribute filter the mock applies to any `http:request`, so carrier calls and the FX call all receive the same canned response',
        'A mock without attributes is ignored, so both calls go to the real systems',
        'Only the first `http:request` in the flow is mocked',
        'MUnit rejects the suite because `with-attributes` is mandatory',
      ],
      answer: 0,
      explain: 'The `processor` attribute names the processor type and `with-attribute` narrows it, for example by `config-ref`, `path` or `method`. The mock page does not spell out the no-filter case, but the spy page describes the same form as matching "any Http Request", and the error cookbook mocks `http:request` that way.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'Each carrier is called inside a For Each and must return a different rate. What is the documented way to mock that?',
      options: [
        '`then-call` a test flow whose Choice evaluates `vars.counter` and sets a different payload per iteration',
        'Three `then-return` blocks inside one `mock-when`, used in turn',
        'A `spy` that overwrites the payload after each call',
        'Three separate tests, each with one fixed `then-return`',
      ],
      answer: 0,
      explain: '`then-return` gives a static value. `then-call` invokes a flow, which suits values that change over time or by input. A spy could not help, because its changes do not persist.',
    },
    {
      type: 'single',
      prompt: 'The FX request uses `target="fx"`. The test mocks it with a `then-return` payload, yet `vars.fx` is wrong in the next Transform Message. How should the mock be written?',
      options: [
        'Define the target variable in the mock: `then-return` with `munit-tools:variables` and a `munit-tools:variable key="#[\'fx\']"`',
        'Keep the payload mock, because MUnit copies it into the target variable',
        'Mock the Transform Message that reads `vars.fx`',
        'Remove `target="fx"` from the flow while testing',
      ],
      answer: 0,
      explain: 'The docs say that when you mock a processor that stores its result in a target variable, you define that variable value in the mock configuration. They add that you assert the variable rather than the payload.',
    },
    {
      type: 'multi',
      prompt: 'A tester writes an MUnit test and wants to replace every processor in a flow with a mock, a configured fake response. Which two processors **cannot** be mocked?',
      options: [
        'Logger',
        'Transform Message',
        '`http:request`',
        '`anypoint-mq:publish`',
        'A Flow Reference (`flow-ref`)',
      ],
      answer: [0, 1],
      explain: 'Logger and Transform Message cannot be mocked, so a DataWeave mapping always runs in a test. Flow references can be mocked, which also means a mocked `flow-ref` skips the logic behind it.',
    },
    {
      type: 'single',
      prompt: 'A `spy` on the MQ publish sets `vars.quoteChecked` inside `before-call`, and the next processor reads it. What does it see?',
      options: [
        'The variable is not there, because changes made inside a spy do not persist outside it',
        'The variable, because `before-call` runs first',
        'The variable, but only when the processor is also mocked',
        'An error, because `set-variable` is not allowed inside a spy',
      ],
      answer: 0,
      explain: 'A spy does not modify the original Mule event. Use it to verify or assert, and use mocks or `set-event` to shape the event.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each `verify-call` setting to what it proves.',
      pairs: [
        ['No count attribute at all', 'Called exactly once, because `times` defaults to 1'],
        ['`atLeast="1"`', 'Called one or more times'],
        ['`atMost="3"`', 'Called no more than three times'],
        ['`processor=".*:request"`', 'A processor named `request` in any namespace, using a Java regular expression'],
      ],
      explain: '`times`, `atLeast` and `atMost` are mutually exclusive. Verify works on real or mocked processors, so it needs no mock of its own.',
    },
    {
      type: 'match',
      prompt: 'Match each requirement to the `assert-that` matcher.',
      pairs: [
        ['The cheapest rate is under the 500 ceiling', '`MunitTools::lessThan(500)`'],
        ['Exactly three carrier rates were collected', '`MunitTools::hasSize(3)`'],
        ['The response contains a `carrier` key', '`MunitTools::hasKey(\'carrier\')`'],
        ['The surcharge is null or zero', '`MunitTools::either(MunitTools::nullValue(), MunitTools::equalTo(0))`'],
      ],
      explain: 'Assert That evaluates `expression` and passes the value to the matcher in `is`. A failed assertion throws `MUNIT-TOOLS:ASSERTION_ERROR`, and the optional `message` makes the report readable.',
    },
  ],
  description: `
A freight forwarder is hardening the MUnit suite for its quote API (about 40,000 quotes per day, three carrier APIs, one FX service). Your colleague has written one test. It passes, but reviewers do not trust it.

\`\`\`text
freight-quote-flow  (HTTP Listener POST /quotes)
 ├─ Transform Message "Build carrier list"
 ├─ For Each carrier
 │    ├─ Flow Reference "call-carrier"     (sub-flow: HTTP Request, config-ref carrierApi)
 │    └─ Transform Message "Collect rate"
 ├─ HTTP Request GET /fx-rates             (config-ref fxApi, target="fx")
 ├─ Transform Message "Pick cheapest, convert to EUR"
 ├─ Logger
 └─ Anypoint MQ Publish "quote-issued"
\`\`\`

What the reviewers found:
- One \`mock-when\` on \`http:request\` with no attributes, so carriers and FX share a response.
- The test cannot give each carrier a different rate, so "pick the cheapest" is never really exercised.
- \`vars.fx\` is wrong because the mock sets a payload, not the target variable.
- The only assertion is \`payload != null\`.
- Someone tried to mock the "Pick cheapest" Transform Message to make the test simpler.

**Questions**
1. How do you target a mock at one specific call, and which attributes can you match on?
2. How do you return a different value per carrier?
3. How do you mock a processor that uses a target variable?
4. What can you not mock, and what does that mean for your test?
5. What do \`spy\`, \`verify-call\`, \`assert-that\` and \`set-event\` each add? Write the improved test.
`,
  answerTemplate: `## Targeting a mock

## Different value per carrier

## Target variables

## What cannot be mocked

## Improved test
`,
  keyPoints: [
    'mock-when intercepts a processor and returns a configured response; narrow it with with-attribute (config-ref, path, method, operation, doc:name, name for a flow-ref).',
    'then-return gives a static payload, attributes, variables or error. then-call invokes a flow for values that vary by input or over time, such as per For Each iteration using vars.counter.',
    'For a processor with a target variable, define the variable in then-return and assert the variable.',
    'Logger and Transform Message cannot be mocked. Mocks are applied after the app initialises, so some connectors still need configuration or credentials to start.',
    'A spy runs assertions before and after a processor and never changes the event; anything it sets does not persist.',
    'verify-call counts calls with times (default 1), atLeast or atMost, which are mutually exclusive; the processor name accepts Java regular expressions.',
    'assert-that uses MUnit matchers and throws MUNIT-TOOLS:ASSERTION_ERROR on failure. set-event defines payload, attributes and variables for the flow under test.',
  ],
  solution: `
**Targeting a mock.** \`processor\` names the type and \`with-attribute\` narrows it. The docs use attributes such as \`method\`, \`path\`, \`config-ref\`, \`operation\`, \`doc:name\`, and \`name\` for a flow reference. Here the two HTTP calls use different configurations, so \`config-ref\` separates them cleanly.

**Different value per carrier.** Mock the \`flow-ref\` and use \`then-call\`. The called flow reads the For Each counter:
\`\`\`xml
<flow name="mock-carrier-rates">
  <choice>
    <when expression="#[vars.counter == 1]">
      <set-payload value='#[{ carrier: "NORTHLINE", rate: 410 }]'/>
    </when>
    <when expression="#[vars.counter == 2]">
      <set-payload value='#[{ carrier: "BLUEFREIGHT", rate: 355 }]'/>
    </when>
    <otherwise>
      <set-payload value='#[{ carrier: "ROADSTAR", rate: 480 }]'/>
    </otherwise>
  </choice>
</flow>
\`\`\`

**Target variables.** The FX request stores its result in \`vars.fx\`, so the mock must set that variable, which is the pattern the docs give.

**What cannot be mocked.** Logger and Transform Message. That is good news: "Pick cheapest" always runs, so the test can prove it works, provided it feeds in distinct rates and asserts the winner.

**Improved test**
\`\`\`xml
<munit:test name="quote-picks-cheapest-carrier" description="Cheapest carrier wins and one quote is published">
  <munit:behavior>
    <munit:set-event>
      <munit:payload value="#[readUrl('classpath://sample_data/quoteRequest.dwl')]" mediaType="application/json"/>
      <munit:attributes value="#[{ method: 'POST', queryParams: { currency: 'EUR' } }]"/>
    </munit:set-event>

    <munit-tools:mock-when processor="mule:flow-ref">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="name" whereValue="#['call-carrier']"/>
      </munit-tools:with-attributes>
      <munit-tools:then-call flow="mock-carrier-rates"/>
    </munit-tools:mock-when>

    <munit-tools:mock-when processor="http:request">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="config-ref" whereValue="#['fxApi']"/>
      </munit-tools:with-attributes>
      <munit-tools:then-return>
        <munit-tools:variables>
          <munit-tools:variable key="#['fx']" value='#[{ "EUR": 1 }]'/>
        </munit-tools:variables>
      </munit-tools:then-return>
    </munit-tools:mock-when>

    <munit-tools:mock-when processor="anypoint-mq:publish">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="doc:name" whereValue="#['quote-issued']"/>
      </munit-tools:with-attributes>
    </munit-tools:mock-when>

    <munit-tools:spy processor="anypoint-mq:publish">
      <munit-tools:before-call>
        <munit-tools:assert-that expression="#[payload.carrier]" is="#[MunitTools::equalTo('BLUEFREIGHT')]"/>
      </munit-tools:before-call>
    </munit-tools:spy>
  </munit:behavior>

  <munit:execution>
    <flow-ref name="freight-quote-flow"/>
  </munit:execution>

  <munit:validation>
    <munit-tools:assert-that expression="#[payload.rate]" is="#[MunitTools::lessThan(500)]"
                             message="The quoted rate should stay under the ceiling"/>
    <munit-tools:verify-call processor="mule:flow-ref" times="3">
      <munit-tools:with-attributes>
        <munit-tools:with-attribute attributeName="name" whereValue="#['call-carrier']"/>
      </munit-tools:with-attributes>
    </munit-tools:verify-call>
    <munit-tools:verify-call processor="anypoint-mq:publish"/>
  </munit:validation>
</munit:test>
\`\`\`

**What each tool adds**
- \`set-event\`: the input, including attributes and variables that the flow reads from the listener.
- \`mock-when\`: isolation from carriers, FX and the broker.
- \`spy\`: a check on the event at a point in the middle of the flow. The docs do not describe a spy and a mock on the same processor, so make an assertion fail once to confirm that it fires.
- \`verify-call\`: proof of how many times something ran. \`verify-call\` with no count means exactly once.
- \`assert-that\`: the final result, with a readable \`message\`.
`,
  followUps: [
    {
      q: 'Everything is mocked, so why does the app still fail to start in the test?',
      a: 'Mocking happens after the Mule app initialises. Some connectors need credentials or configuration to start even when their processors are mocked, so supply test values for those properties.',
    },
    {
      q: 'How do you mock file:list or ftp:list?',
      a: 'They return a collection of Mule messages, so the mock payload is built with MunitTools::createMessage, one entry per file with its payload and attributes.',
    },
    {
      q: 'Why does verify-call work without a mock?',
      a: 'It only counts calls to a processor. The processor may be real or mocked, which is why it can confirm that an unmocked Set Payload ran, for example.',
    },
    {
      q: 'When is cloneOriginalEvent on set-event useful?',
      a: 'When you want to start from the event your code produced rather than from an empty one. It clones that event, and the default is false.',
    },
  ],
}
