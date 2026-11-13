import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-115',
  category: 'logging',
  title: "Metrics Hidden in Logs",
  level: 'BEGINNER',
  tags: ["logging","metrics","splunk"],
  estMinutes: 10,
  quiz: fromLogging(["log-6046","log-6047","log-6048","log-6049","log-6050"]),
  description: `
The Cobalt Meter Readings API takes meter readings over HTTP. Operations want charts of counts, sizes and times, built from the log lines the API already writes.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Labelled numbers in one line per request make a metric.",
    "Count with sizeOf, never by writing the payload.",
    "Use one field name per fact in every flow.",
  ],
}
