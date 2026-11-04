import { createFlow, createNode, createRoute } from './model.js'

// Compact helpers for writing reference designs in problem files, e.g.
//   design(
//     flow('orders-api', source('http-listener', { path: '/orders' }),
//       [step('logger'), scope('until-successful', { maxRetries: 3 }, [step('http-request')])],
//       [handler('on-error-propagate', { type: 'HTTP:CONNECTIVITY' })]),
//     subFlow('audit', [step('mq-publish')]),
//   )

const withConfig = (node, config) => ({ ...node, config: { ...node.config, ...config } })

export const step = (type, config = {}) => withConfig(createNode(type), config)
export const source = step

export function scope(type, config = {}, steps = [], extra = {}) {
  return { ...withConfig(createNode(type), config), steps, ...extra }
}

export function route(config = {}, steps = []) {
  return { config, steps }
}

// routes: [route(...)]; for Choice pass the default branch as `otherwise`; for Batch Job pass `onComplete`.
export function router(type, config = {}, routes = [], extra = {}) {
  const node = withConfig(createNode(type), config)
  node.routes = routes.map((r) => {
    const base = createRoute(type)
    return { ...base, config: { ...base.config, ...r.config }, steps: r.steps }
  })
  return { ...node, ...extra }
}

export const handler = (type, config = {}, steps = []) => ({ ...withConfig(createNode(type), config), steps })

export function flow(name, src = null, steps = [], errorHandlers = []) {
  return { ...createFlow('flow', name), source: src, steps, errorHandlers }
}

export function subFlow(name, steps = []) {
  return { ...createFlow('sub-flow', name), steps }
}

export const design = (...flows) => ({ flows })
