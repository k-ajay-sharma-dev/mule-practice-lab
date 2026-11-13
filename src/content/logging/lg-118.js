import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-118',
  category: 'logging',
  title: "When the Transform Fails",
  level: 'ADVANCED',
  tags: ["logging","dataweave","errors"],
  estMinutes: 15,
  quiz: fromLogging(["log-6061","log-6062","log-6063","log-6064","log-6065"]),
  description: `
A partner sends catalog updates to the Fellstone Catalog API. Sometimes a value breaks the DataWeave mapping and the Transform raises MULE:EXPRESSION. Log it so the partner can fix the data, without dumping the input.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A mapping failure caused by the caller data is WARN with a 400.",
    "Log the error type and the record ID, not error.detailedDescription.",
    "A DEBUG line before the Transform can show the type of a value.",
  ],
}
