// The sample application of the db-pool lab. Imports only platform-log.js, so the engine can load it without a cycle.
import { muleError, needs } from '../platform-log.js'

// Each call of the lab stands for 10 real requests, so a few calls a minute give a real sale load
export const SCALE = 10
const QUERY_MS = 400 // the Select of an order with its lines
const at = { flow: 'get:\\orders', file: 'orders-sapi-sql', at: 1, name: 'Select orders', dsl: '<db:select doc:name="Select orders" config-ref="SqlServer_Config" queryTimeout="${db.query.timeout}">' }
const body500 = '{"message":"Internal server error"}'

// a stable choice per call, so the same state gives the same answers
const pick = (t) => ((Math.floor(t / 7) * 2654435761) >>> 0) / 4294967296

// How many connections one replica needs at once: requests a second times the seconds each query holds a connection
export function poolNeed({ app }, perMinute) {
  return ((perMinute * SCALE) / 60 / Math.max(1, app.replicas)) * (QUERY_MS / 1000)
}

export const PACKAGES = {
  'orders-sapi-sql': {
    note: 'An orders API on SQL Server. Its pooling profile reads maxPoolSize from db.pool.max and maxWait (seconds) from db.pool.maxWait. The Select reads queryTimeout (seconds) from db.query.timeout, where 0 means no timeout.',
    sample: { method: 'GET', path: '/orders' },
    boot: needs('db.host', 'db.pool.max', 'db.pool.maxWait'),
    handle(ctx, req) {
      const { props, now, perMinute } = ctx
      if (!/^\/orders(\/[\w-]+)?$/.test(req.path.split('?')[0])) return { status: 404, ms: 10, error: 'APIKIT:NOT_FOUND', flow: 'orders-sapi-sql-main', body: '{"message":"Resource not found"}' }
      const timeout = Number(props['db.query.timeout'] ?? 0)
      if (timeout > 0 && timeout * 1000 < QUERY_MS) {
        const error = { ...at, type: 'DB:QUERY_EXECUTION', message: 'com.microsoft.sqlserver.jdbc.SQLServerException: The query has timed out.' }
        return { status: 500, ms: timeout * 1000 + 30, error: error.type, flow: at.flow, log: [muleError(error)], body: body500 }
      }
      const pool = Math.max(1, Number(props['db.pool.max']) || 5)
      const wait = Math.max(1, Number(props['db.pool.maxWait']) || 10) * 1000
      const use = poolNeed(ctx, perMinute) / pool
      const ok = { status: 200, flow: at.flow, body: '[{"orderId":"O-5001","status":"PAID","total":64.9}]' }
      if (use <= 0.7) return { ...ok, ms: 60 + QUERY_MS }
      // calls queue for a free connection: the closer the pool is to full, the longer the wait
      if (use < 1) return { ...ok, ms: Math.round(60 + QUERY_MS + (QUERY_MS * (use - 0.7)) / (1 - use)) }
      // more queries than connections: the pool serves what it can, the rest waits maxWait and fails
      if (pick(now + (req.offset ?? 0)) < 1 / use) return { ...ok, ms: Math.round(wait * 0.8 + QUERY_MS) }
      const error = { ...at, type: 'DB:CONNECTIVITY', message: 'Could not obtain connection from data source. Caused by: java.sql.SQLException: An attempt by a client to checkout a Connection has timed out.' }
      return { status: 500, ms: wait + 20, error: error.type, flow: at.flow, log: [muleError(error)], body: body500 }
    },
  },
}
