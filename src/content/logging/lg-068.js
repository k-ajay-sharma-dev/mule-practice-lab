import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-068',
  category: 'logging',
  title: "CSV Rows That Will Not Parse",
  level: 'BEGINNER',
  tags: ["logging","csv","files"],
  estMinutes: 15,
  quiz: fromLogging(["log-3036","log-3037","log-3038","log-3039","log-3040"]),
  description: `
Ashgrove Logistics loads delivery CSV files from its partners. Some rows are bad, and sometimes the whole file cannot be read. Log each case so support can fix it.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "A rejected row is logged by file, row, column and reason, never by its text.",
    "A summary line with loaded and rejected counts shows how big the gap is.",
    "A file that cannot be parsed at all, with nothing loaded, is ERROR.",
  ],
}
