import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-132',
  category: 'logging',
  title: "Retiring an API Version",
  level: 'INTERMEDIATE',
  tags: ["logging","versioning","api-lifecycle","clients"],
  estMinutes: 20,
  quiz: fromLogging(["log-9006","log-9007","log-9008","log-9009","log-9010"]),
  description: `
Cobalt Parcels will retire version 1 of its parcel API in 60 days. Log the clients that still call it, so the team can contact each one in time, and log the calls that arrive after it is gone.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log the client ID, path and retirement date for calls to the old version.",
    "Never log headers, as they carry the client secret.",
    "After retirement, log each rejected call with status 410 at WARN.",
  ],
}
