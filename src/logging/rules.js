// Shared pieces of the Logging Lab: the levels, the kinds of exercise, and the rules many write exercises use.
// A rule is { must: RegExp, say } (fails when the message does not match) or { not: RegExp, say } (fails when it
// does). `say` tells the learner what to change.

export const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR']

export const KINDS = {
  level: 'Pick the level',
  choice: 'Best wording',
  multi: 'Spot the problems',
  write: 'Write the logger',
}

export const corr = { must: /\bcorrelationId\b/, say: 'Add the correlation ID (correlationId). It joins every line of one request, across apps.' }
// payload on its own; payload.orderId, payload[0] and sizeOf(payload), a count, are fine
export const noPayload = {
  not: /(?<![.\w])(?<!sizeOf\(\s*)payload\b(?!\s*[.[])/,
  say: 'Do not log the whole payload. Pick the fields you need, such as payload.orderId.',
}
export const noSecrets = {
  not: /password|passwd|secret|token|authorization|cvv|cardNumber|card\.number|\bpan\b/i,
  say: 'Never log passwords, tokens or card data, not even at DEBUG.',
}
export const noPersonal = {
  not: /email|phone|mobile|address\b|dateOfBirth|\bdob\b|\bssn\b/i,
  say: 'Leave out personal data such as email, phone or address. Log an ID instead.',
}
export const noVague = {
  not: /error occurred|something went wrong|\bhere\b|\binside\b|\bstep \d|\btest(ing)?\b|"\s*(done|ok|success|error|failed)\s*[!.]*\s*"/i,
  say: "Say exactly what happened. 'Error occurred', 'here' or 'done' tell the reader nothing.",
}
export const labelled = (key, example = `${key}=$(...)`) => ({
  must: new RegExp(`${key}\\s*"?\\s*[=:]`, 'i'),
  say: `Label the value, such as ${example}, so it can be searched.`,
})
export const says = (re, what) => ({ must: re, say: `Start with what happened, such as '${what}'.` })
export const errorFacts = {
  must: /error\.(errorType|description|detailedDescription)/,
  say: 'Add what went wrong: error.errorType and error.description.',
}
