import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-025',
  category: 'logging',
  title: "Fields Splunk Can Search",
  level: 'INTERMEDIATE',
  tags: ["logging","splunk","structured-logging"],
  estMinutes: 15,
  quiz: fromLogging(["log-025","log-071","log-212","log-218","log-316","log-047"]),
  description: `
Your team searches logs in Splunk. Write lines with named fields and the same names everywhere, so one search finds every case.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "key=value pairs or one JSON object per line can be searched by field.",
    "Use the same field name for the same thing in every flow.",
    "One event per line: a message over several lines breaks into several events.",
  ],
}
