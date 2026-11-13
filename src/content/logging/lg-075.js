import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-075',
  category: 'logging',
  title: "Reading the BatchJobResult",
  level: 'ADVANCED',
  tags: ["logging","batch","on-complete"],
  estMinutes: 10,
  quiz: fromLogging(["log-3071","log-3072","log-3073","log-3074","log-3075"]),
  description: `
Coral Bay Hotels loads room rates each night with a Batch Job. In On Complete the payload is the BatchJobResult. Pick the right fields for the summary line.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "The BatchJobResult holds counts and phase results, not records.",
    "Log the job ID, the counts and elapsedTimeInMillis in one line.",
    "An empty night is a normal outcome. Log it at INFO where the flow sees the empty input, not from the On Complete counts.",
  ],
}
