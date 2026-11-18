import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-138',
  category: 'logging',
  title: "Feature Flags and Configuration Reloads",
  level: 'INTERMEDIATE',
  tags: ["logging","configuration","feature-flags","operations"],
  estMinutes: 20,
  quiz: fromLogging(["log-10011","log-10012","log-10013","log-10014","log-10015"]),
  description: `
Driftwood Travel changes app behaviour with feature flags and reloads its configuration every few minutes. Log what changed and when, without dumping the configuration and its secrets.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log each flag change with the flag, old value, new value and who changed it.",
    "Never log the whole configuration. Log the version, environment and flags by name.",
    "When a reload fails, say which version is still in use.",
  ],
}
