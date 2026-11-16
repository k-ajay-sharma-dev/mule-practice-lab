// The errors the flow simulator (src/sim) works with. Every part throws one of these, and the engine turns them into
// what a learner sees: a Mule error a handler can catch, or a plain note that the simulator cannot run something yet.

// A Mule error, as a handler sees it: error.errorType (NAMESPACE:IDENTIFIER) and error.description.
// extra holds what the connector would put on the error, such as { statusCode: 404 } for an HTTP request.
export class MuleError extends Error {
  constructor(type, description, extra = {}) {
    super(description)
    this.name = 'MuleError'
    this.type = type
    this.description = description
    this.extra = extra
  }
}

// A DataWeave script or expression failed while it ran, as it would in Mule. The engine raises MULE:EXPRESSION.
export class DwError extends Error {
  constructor(message) {
    super(message)
    this.name = 'DwError'
  }
}

// A SQL statement failed, as the database would refuse it. The engine raises DB:QUERY_EXECUTION.
export class SqlError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SqlError'
  }
}

// Something valid in Mule that the simulator does not run yet, such as a DataWeave function it has no copy of.
// This is the simulator's limit, not the learner's mistake, so the engine stops the run and says so plainly.
export class SimUnsupported extends Error {
  constructor(feature) {
    super(`The simulator does not run ${feature} yet.`)
    this.name = 'SimUnsupported'
    this.feature = feature
  }
}
