import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-065',
  category: 'logging',
  title: "Batch Steps and Accept Policies",
  level: 'INTERMEDIATE',
  tags: ["logging","batch","accept-policy"],
  estMinutes: 15,
  quiz: fromLogging(["log-3021","log-3022","log-3023","log-3024","log-3025"]),
  description: `
Bluewater Insurance renews 50,000 policies each night in a Batch Job with three steps. The last step takes only failed records. Log each step at the right level.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Failed records skip later steps unless a step uses ONLY_FAILURES or ALL.",
    "A step that gets only failures can log each one at WARN, because the volume is small.",
    "Per-record lines in a normal step belong at DEBUG.",
  ],
}
