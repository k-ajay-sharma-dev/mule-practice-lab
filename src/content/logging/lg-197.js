import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-197',
  category: 'logging',
  title: "Split Exports",
  level: 'ADVANCED',
  tags: ["logging","myproject","large-files","split","control-file","planning-platform"],
  estMinutes: 25,
  quiz: fromLogging(["log-16031","log-16032","log-16033","log-16034","log-16035"]),
  description: `
Thornbury Freight splits large exports into parts with a control file. Log each part and the finished set.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log rows and size for each part.",
    "Log the set with totals and the control file name.",
    "Write the control file last.",
  ],
}
