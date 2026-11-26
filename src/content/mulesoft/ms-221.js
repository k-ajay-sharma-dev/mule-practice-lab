export default {
  id: 'ms-221',
  category: 'mulesoft',
  title: 'Transform Message: Payload, Attributes and Variables from One Component',
  level: 'BEGINNER',
  tags: ['transform-message', 'dataweave', 'variables', 'mime-type', 'components', 'pharmacy'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A Transform Message holds only one script, which sets a variable called `patient`. What is the payload after the component?',
      options: [
        'An empty object, as a Transform with no payload script writes `{}`',
        'The same payload as before the component',
        'The value of `patient`, as the output of the last script becomes the payload',
        'Null, as a Transform clears the payload when it has no payload script',
      ],
      answer: 1,
      explain: 'A Transform Message changes only what it has scripts for. With no payload script, the payload passes through as it was.',
    },
    {
      type: 'single',
      prompt: 'A Transform sets the payload to a dispense request and the variable `patient` to `{ id: "P-17" }`. Next comes an HTTP Request to the shop system with no target. After it, a Logger prints `#[vars.patient.id]` and `#[payload]`. What does it show?',
      options: [
        'Null for `vars.patient.id`, as an operation clears the variables, and the shop response',
        '"P-17", and the response from the shop system, which replaced the dispense request',
        '"P-17", and the dispense request, as the payload of a Transform outlives a request',
        'The shop response for both, as the HTTP Request writes its result to every part',
      ],
      answer: 1,
      explain: 'Variables live under `vars` and stay on the event until something changes them, so `vars.patient.id` is still "P-17". An HTTP Request with no target writes its response to the payload, so the dispense request is gone. To keep it, set a target on the request or save the body in a variable first. An operation never clears variables, and its result goes only to the payload and attributes.',
    },
    {
      type: 'single',
      prompt: 'A prescription arrives as JSON. The payload script of a Transform starts with `output application/xml`. The next step is an HTTP Request to the shop system that sets no Content-Type header. What Content-Type does the shop system receive?',
      options: [
        '`application/json`, as Mule keeps the MIME type of the request that started the flow',
        '`text/plain`, as a payload written by a script is sent as text with no type',
        '`application/xml`, from the MIME type that the output directive set on the payload',
        '`application/java`, as the payload stays a Java object until a connector writes it',
      ],
      answer: 2,
      explain: 'The output directive sets the format of the new payload and its MIME type. The HTTP Request uses that MIME type as the Content-Type when no header overrides it. The incoming JSON type only told the script how to read its input. A script output is not untyped, and `application/java` applies only when the directive says so.',
    },
    {
      type: 'single',
      prompt: 'The team moves the payload script to `src/main/resources/dwl/prescription-to-dispense.dwl`, so it can be reviewed apart. The app must work the same in Studio and on CloudHub 2.0. Which reference should the script element use?',
      options: [
        '`resource="src/main/resources/dwl/prescription-to-dispense.dwl"`, the path from the project root',
        '`resource="dwl/prescription-to-dispense.dwl"`, the path inside the resources folder',
        'An inline script with an `import` of the file, so that its body runs as the script',
        'An inline script holding `${dwl/prescription-to-dispense.dwl}`, read at deploy time',
      ],
      answer: 1,
      explain: 'The `resource` attribute is read from the classpath, and `src/main/resources` is the root of it in the packaged app, so the path starts at `dwl`. The project folders are not in the deployed jar, so a path from the project root does not fit. An `import` brings in functions from a module, it does not run the file as the script. A `${...}` placeholder reads a property value, not a file.',
    },
    {
      type: 'multi',
      prompt: 'A flow has five steps: a Set Variable for the patient id, a Set Variable for the shop code, a Transform for the body, a Set Payload that only changes the MIME type, and a Logger. A reviewer wants one Transform Message to do the work of as many as it can. Which jobs can that one Transform take over? Choose all that apply.',
      options: [
        'Both Set Variable steps, as two variable scripts',
        'The body, as the payload script',
        'The MIME type change, through the output directive',
        'A custom error object for the flow error handler to read',
        'A new correlation id for the call to the shop system',
      ],
      answer: [0, 1, 2],
      explain: 'A Transform Message can set the payload, the attributes and any number of variables, each with its own script. The output directive of the payload script sets the MIME type, so the Set Payload is no longer needed. The error and the correlation id are not set this way. An error comes from Raise Error or a failing step, and the correlation id comes from the source of the event.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the component that fits it best.',
      pairs: [
        ['Put a fixed text such as OK in the payload', 'Set Payload'],
        ['Build a new JSON body from an XML payload', 'Transform Message'],
        ['Keep one value for later without touching the payload', 'Set Variable'],
      ],
      explain: 'All three can run DataWeave. Set Payload and Set Variable suit one short value. Transform Message suits real mapping work, and can also set variables in the same step.',
    },
  ],
  description: `
Brookvale Pharmacy runs 40 shops. When a doctor sends an electronic prescription, a Mule flow turns it into a dispense request for the shop's system. The flow needs the new body, and it also needs the patient id and the shop code later for logging and routing.

A new developer built it with five components in a row: a Set Variable for the patient id, a Set Variable for the shop code, a Transform for the body, a Set Payload to change the MIME type, and a Logger. A reviewer says one Transform Message can do most of this.

**Questions**
1. What can one Transform Message set, and what happens to the parts it has no script for?
2. How does the output directive decide the format and MIME type of the result?
3. When should a script live in a \`.dwl\` file instead of inline?
4. When are Set Payload and Set Variable still the better choice?
`,
  answerTemplate: `## What one Transform can set

## Format and MIME type

## Inline or in a file

## When the small components fit
`,
  keyPoints: [
    'One Transform Message can set the payload, the attributes and several variables.',
    'Parts with no script are left as they were. A Transform with only a variable script keeps the payload.',
    'Each script has its own output directive, which sets the format and MIME type of what it writes.',
    'A script can sit in a .dwl file under src/main/resources, named with the resource attribute.',
    'Later steps read the variables as vars.name.',
    'Set Payload and Set Variable suit one short value. Transform Message suits mapping work.',
  ],
  solution: `
**1. What one Transform can set.** A Transform Message has a part for the message, with a payload script and an optional attributes script, and a part for variables, with one script per variable. Here it can build the dispense request as the payload and set \`patientId\` and \`shopCode\` as variables in the same step. Anything without a script stays as it was.

**2. Format and MIME type.** Each script has its own \`output\` line. \`output application/json\` on the payload script writes JSON and marks the payload as JSON, so the extra Set Payload to change the MIME type is not needed. A variable script can have a different output, such as \`application/java\` for a plain value.

**3. Inline or in a file.** Keep a short script inline. Move a long mapping to \`src/main/resources/dwl/prescription-to-dispense.dwl\` and name it with \`resource\`. The file shows up as its own change in a code review, and the mapping is not buried in the flow XML.

**4. The small components.** Set Payload is clear for a fixed value such as an \`OK\` body. Set Variable is clear for one value read from the event. Use the Transform when there is real mapping, and let it set the variables it already has to hand.

The result is two components instead of five: one Transform Message and a Logger.
`,
  followUps: [
    {
      q: 'Can the payload script in a Transform read a variable that the same Transform sets?',
      a: 'Do not rely on it. If the payload script needs a value, work it out inside that script, or set the variable in an earlier step. Then the order of the scripts inside the component does not matter.',
    },
    {
      q: 'How would you keep the original prescription for an audit log?',
      a: 'Add a variable script that copies the payload, for example `vars.originalPrescription`, in the same Transform. The payload script then builds the dispense request, and the original is still there for the log.',
    },
    {
      q: 'Is it a problem to set many variables with large values?',
      a: 'Each variable keeps its value in memory for the rest of the flow. Keep only the fields you need, such as the patient id, instead of a copy of a large body.',
    },
  ],
}
