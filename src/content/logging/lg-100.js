import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-100',
  category: 'logging',
  title: "Patient Data and GDPR",
  level: 'BEGINNER',
  tags: ["gdpr","personal-data","healthcare"],
  estMinutes: 10,
  quiz: fromLogging(["log-5046","log-5047","log-5048","log-5049","log-5050"]),
  description: `
Fjordvik Clinics books appointments and honours erasure requests. Log bookings and erasures in a way the data protection officer accepts.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Log a reference, never names, birth dates or contact details.",
    "GDPR covers logs at every level.",
    "An erasure line proves it ran without saying whose data it was.",
  ],
}
