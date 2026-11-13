import { fromLogging } from '../../logging/quiz.js'

export default {
  id: 'lg-081',
  category: 'logging',
  title: "SAP Sales Orders by BAPI",
  level: 'INTERMEDIATE',
  tags: ["logging","sap","bapi"],
  estMinutes: 15,
  quiz: fromLogging(["log-4026","log-4027","log-4028","log-4029","log-4030"]),
  description: `
Fernhill Tools creates sales orders in SAP with a BAPI. The BAPI can fail through its RETURN table without a Mule error. Log every outcome clearly.

Answer every question, then press **Check answers**. The rules for good log lines are at the top of the Logging Lab page.
`,
  keyPoints: [
    "Check the RETURN table before you log success.",
    "Log your order ID next to the SAP document number.",
    "Never log the RFC credentials from the connector config.",
  ],
}
