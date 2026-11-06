// Shared rules for problem files, so the same idea is checked the same way everywhere.
export const HANDLERS = ['on-error-propagate', 'on-error-continue']

// An error handler for this error type sets this HTTP status. `status` is a where value, such as '404' or { oneOf: [...] }.
export function handlerStatus(type, status) {
  const place = { within: HANDLERS, withinWhere: { type } }
  return {
    type: 'any',
    rules: [
      { type: 'inside', component: 'set-variable', where: { value: status }, ...place },
      { type: 'inside', component: 'transform', where: { variableName: 'status', script: status }, ...place },
    ],
  }
}

// An error handler for this error type builds a response body.
export function handlerBody(type, handlers = HANDLERS) {
  return { type: 'inside', component: ['set-payload', 'transform'], within: handlers, withinWhere: { type } }
}
