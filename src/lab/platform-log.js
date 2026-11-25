// Log lines and start-up rules that the sample applications share.
export const line = (level, text, logger = 'org.mule.runtime.core.internal.processor.LoggerMessageProcessor') => ({ level, text, logger })
export const info = (text, logger) => line('INFO', text, logger)
export const warn = (text, logger) => line('WARN', text, logger)

const STARS = '*'.repeat(80)
// The shape of the error block Mule 4 writes to the log
export const muleError = ({ message, type, flow, file, at, name, dsl }) =>
  line(
    'ERROR',
    [
      '',
      STARS,
      `Message               : ${message}`,
      `Element               : ${flow}/processors/${at} @ ${file}:${file}.xml:${18 + at * 6} (${name})`,
      `Element DSL           : ${dsl}`,
      `Error type            : ${type}`,
      `FlowStack             : at ${flow}(${flow}/processors/${at} @ ${file}:${file}.xml:${18 + at * 6} (${name}))`,
      '  (set debug level logging or -Dmule.verbose.exceptions=true for everything)',
      STARS,
    ].join('\n'),
    'org.mule.runtime.core.internal.exception.OnErrorPropagateHandler',
  )

const missing = (props, names) => names.filter((n) => !String(props[n] ?? '').trim())
// the application starts only when each of these properties has a value
export const needs =
  (...names) =>
  ({ props }) => {
    const gone = missing(props, names)
    return gone.length ? `Couldn't find configuration property value for key \${${gone[0]}} from properties provider "Environment properties"` : null
  }
