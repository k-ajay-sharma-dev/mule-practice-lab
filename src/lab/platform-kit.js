// Helpers that the guided labs of the Anypoint console share.
import { advance, appNamed, at, callApi, deployApp, eventsOf, finishDeploys, MINUTE } from './platform.js'
import { defaultSettings } from './policies.js'

export const OPS = 'ops@harbor.example'
export const app = (s, name) => appNamed(s, name, 'Sandbox')
export const sawLogs = (name) => ({ title: `Open the logs of ${name}`, how: `Runtime Manager, Applications, ${name}, Logs.`, done: (s) => Boolean(s.seen[`logs:${name}`]) })
export const ask = (title, question, options, right, reason) => ({ title, ask: question, options, right, reason })
export const change = (state, name, patch) => {
  const a = appNamed(state, name)
  return finishDeploys(deployApp(state, { name, pkg: a.pkg, replicas: a.replicas, vCores: a.vCores, model: a.model, version: a.version, ...patch, editing: true }).state)
}
export const withProp = (state, name, key, value) => change(state, name, { props: { ...appNamed(state, name).props, [key]: value } })
export const withSecret = (state, name, key, value) => change(state, name, { secrets: { ...appNamed(state, name).secrets, [key]: value } })
// plays the platform from an earlier day up to the morning the learner arrives
export const until = (state, clock) => advance(state, clock - state.clock)

export const asset = (assetId, name, raml, version = '1.0.0') => ({ assetId, name, version, apiVersion: 'v1', lifecycle: 'stable', raml, t: at(0, 10) })
export const policy = (type, settings = {}) => ({ id: `lab-${type}`, type, settings: { ...defaultSettings(type), ...settings } })
export const creds = (s, env) => ({ props: { 'anypoint.platform.client_id': s.creds[env].id }, secrets: { 'anypoint.platform.client_secret': s.creds[env].secret } })

export const CLIENTS = [
  { name: 'Mobile App', clientId: 'mob-71c2', clientSecret: 'mob-secret-19' },
  { name: 'Partner Portal', clientId: 'par-5e90', clientSecret: 'par-secret-44' },
]
export const call = (state, name, client, path = '/shipments', method = 'GET', body = '') => callApi(state, { env: state.env, app: name, method, path, body, client: client?.name, clientId: client?.clientId, clientSecret: client?.clientSecret })
export const called = (s, name, status, method, path) => (s.lastCalls ?? []).some((c) => c.app === name && c.status === status && (!method || c.method === method) && (!path || path.test(c.path)))
export const recent = (s, name, minutes) => eventsOf(s, { app: name, env: 'Sandbox' }, s.clock - minutes * MINUTE, s.clock).filter((e) => e.k === 'in')

export const propsValue = (a, key) => ({ ...a?.props, ...a?.secrets })[key]
