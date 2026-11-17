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
        'An empty object',
        'The same payload as before the component',
        'The value of the `patient` variable',
        'Null',
      ],
      answer: 1,
      explain: 'A Transform Message changes only what it has scripts for. With no payload script, the payload passes through as it was.',
    },
    {
      type: 'single',
      prompt: 'How does a later Logger read that variable?',
      options: ['`#[patient]`', '`#[payload.patient]`', '`#[attributes.patient]`', '`#[vars.patient]`'],
      answer: 3,
      explain: 'Variables live under `vars`, whichever component set them.',
    },
    {
      type: 'single',
      prompt: 'The payload script starts with `output application/xml`. What does that decide?',
      options: [
        'The format the new payload is written in, and its MIME type',
        'The format the script expects to read',
        'The Content-Type the HTTP Listener always sends, whatever happens later',
        'Nothing, because Mule picks the format from the next connector',
      ],
      answer: 0,
      explain: 'The output directive sets the format of the result. The input format comes from the MIME type of the incoming payload.',
    },
    {
      type: 'single',
      prompt: 'The team keeps the payload script in `src/main/resources/dwl/prescription-to-dispense.dwl`. How does the component point at it?',
      options: [
        'With `resource="dwl/prescription-to-dispense.dwl"` on the script element',
        'With `${dwl/prescription-to-dispense.dwl}` inside the script',
        'With an `import` line in an empty inline script',
        'It cannot, because Transform scripts must be inline',
      ],
      answer: 0,
      explain: 'A script can be inline or in a file under the resources folder, named with the `resource` attribute. A file can be reviewed and reused on its own.',
    },
    {
      type: 'multi',
      prompt: 'Which of these can one Transform Message set?',
      options: ['The payload', 'The attributes', 'One or more variables', 'The error object', 'The correlation id of the event'],
      answer: [0, 1, 2],
      explain: 'A Transform Message can set the payload, the attributes and any number of variables. The error and the correlation id are not set this way.',
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
