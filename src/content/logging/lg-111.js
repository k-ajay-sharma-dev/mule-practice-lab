import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-111',
  category: 'logging',
  title: "Parallel Price Updates",
  level: 'INTERMEDIATE',
  tags: ["logging","parallel-for-each"],
  estMinutes: 15,
  quiz: fromLogging(["log-6026","log-6027","log-6028","log-6029","log-6030"]),
  description: `
The Maplewood Price API pushes new prices to 40 stores at once with a Parallel For Each. Log each store while you troubleshoot, and sum up the run for production.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Lines inside a Parallel For Each are DEBUG and can come in any order.",
    "Variables set before the scope can be read in every route.",
    "After the scope, log one line with the counts and the failed stores.",
  ],
}
