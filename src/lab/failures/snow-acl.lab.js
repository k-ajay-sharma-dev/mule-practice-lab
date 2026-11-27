// The guided lab snow-acl. See platform-labs.js for the shape of a lab.
import { at, callApi, mark, newApp, newPlatform } from '../platform.js'
import { app, ask, change, OPS, until } from '../platform-kit.js'
import { addUser, canField, explore, groupId, INSTANCE_URL, newServicenow, REST_ROLE, rowsOf, saveAcl, updateSelected, userOf, WIDE_ROLES } from '../platform-servicenow.js'
import { missingOf, POS, POS_ALERT } from './snow-acl.pkg.js'

const SVC = 'svc_pos_alerts'
const OPEN = ['1', '2', '3']
const NEW_ALERT = '{"ci":"STORE-0042-POS","check":"cash_drawer","summary":"STORE-0042-POS cash drawer does not open"}'
const y = (s) => s.servicenow
const svc = (s) => userOf(y(s), SVC)
const mine = (s) => rowsOf(y(s), 'incident').filter((r) => r.sys_created_by === SVC)
const unassigned = (s) => mine(s).filter((r) => !r.assignment_group && OPEN.includes(r.state))
const canRead = (s) => Boolean(svc(s)) && canField(y(s), svc(s), 'cmdb_ci', 'support_group', 'read')
const narrow = (s) => Boolean(svc(s)) && !svc(s).roles.some((r) => WIDE_ROLES.includes(r))
const loud = (s) => app(s, POS)?.status === 'Running' && missingOf(app(s, POS).props) === 'fail'

function instance(now) {
  const x = newServicenow(now)
  addUser(x, { user_name: SVC, first_name: 'Harbor', last_name: 'POS Alerts', roles: [REST_ROLE, 'sn_incident_write', 'cmdb_read'], pw: 'Pos-Harbor-2611', web_service_access_only: true }, now)
  // last week security made the support group of a CI readable for fulfillers only (change SEC-0412)
  x.acls.push({ sys_id: 'c0ffee00a1b2c3d4e5f6a7b8c9d0a412', type: 'record', name: 'cmdb_ci.support_group', operation: 'read', roles: ['itil'], active: true, description: 'Support groups are for IT staff (change SEC-0412)' })
  return x
}

const lab = {
  id: 'p-snow-acl',
  group: 'HR, ITSM and CRM',
  title: 'Incidents from the stores land in no queue',
  minutes: 25,
  scenario: `${POS} turns alerts of the store device monitor into ServiceNow incidents on ${INSTANCE_URL}, routed to the support group of the device in the CMDB. It worked for a year. Since this morning every new incident from it has an empty Assignment group, so no team sees them, and a store has had a dead receipt printer for hours. The app logs no error and ServiceNow answers 201. Last week security tightened some ACLs in the CMDB.`,
  start() {
    const s = newPlatform({
      clock: at(1, 8),
      apps: [newApp(POS, { props: { 'snow.instance': INSTANCE_URL, 'snow.username': SVC, 'ci.missingGroup': 'empty' }, secrets: { 'snow.password': 'Pos-Harbor-2611' }, store: {} })],
      traffic: [
        { app: POS, env: 'Sandbox', method: 'POST', path: '/alerts', body: POS_ALERT, perMinute: 1, every: 5 },
        { app: POS, env: 'Sandbox', method: 'POST', path: '/alerts', body: '{"ci":"EDGE-RTR-07","check":"packet_loss","summary":"EDGE-RTR-07 packet loss above 5 percent"}', perMinute: 1, every: 7 },
        { app: POS, env: 'Sandbox', method: 'POST', path: '/alerts', body: '{"ci":"WMS-APP-01","check":"queue_depth","summary":"WMS-APP-01 pick queue depth above 500"}', perMinute: 1, every: 11 },
      ],
      servicenow: instance(at(1, 8)),
      mail: [
        {
          t: at(1, 9, 5),
          to: OPS,
          subject: 'Unassigned incidents from the store monitor',
          body: 'Hello. Store 0042 has had no receipt printer since 08:05. The incident exists, but it has no assignment group, so it sat in nobody\'s queue. The router and WMS alerts of this morning look the same. Before today these always had the group of the device. Harbor service desk',
          source: 'Harbor service desk',
        },
      ],
    })
    return until(s, at(1, 9, 10))
  },
  steps: [
    {
      title: 'Find the unassigned incidents',
      how: 'ServiceNow from the console menu, Incident, All. Add the filter conditions Assignment group is empty and Created by is svc_pos_alerts, and Run. Open one: Configuration item is set, Assignment group is not.',
      done: (s) => Boolean(s.seen['snow:list:incident']),
    },
    {
      title: 'Read the CI as the integration user',
      how: `REST API Explorer. GET on table cmdb_ci, sysparm_query name=STORE-0042-POS, sysparm_fields sys_id,name,support_group. Send it once as harbor.admin and once with Run as ${SVC}. Compare the two answers.`,
      done: (s) => (y(s)?.tx ?? []).some((e) => e.src === 'REST API Explorer' && e.user === SVC && e.url.startsWith('/api/now/table/cmdb_ci')),
    },
    ask(
      'Why the value is empty and the call is a 200',
      `Why does ${POS} write an empty Assignment group without any error?`,
      [
        'The CI lost its support group this morning',
        `A field ACL denies ${SVC} read on cmdb_ci.support_group. The Table API leaves a field the user cannot read out of the answer and still says 200, so the app reads nothing and writes an empty group`,
        'The POST to incident failed and ServiceNow made an empty incident',
        'sysparm_display_value must be true to get references',
      ],
      1,
      'ACLs in ServiceNow filter quietly. A row the user may not read is left out of a list, a field the user may not read is left out of the record, and a field the user may not write is ignored on insert and update. None of them is an error. Test integrations as the integration user, not as an admin who passes every ACL.',
    ),
    {
      title: 'Find the ACL',
      how: 'System Security, Access Control (ACL). Filter on cmdb_ci. The read ACL cmdb_ci.support_group asks for role itil. Note its description.',
      done: (s) => Boolean(s.seen['snow:acl']),
    },
    {
      title: 'Grant read on the field, and nothing more',
      how: `In the ACL cmdb_ci.support_group (read), pick the role cmdb_read, which ${SVC} has, and press Add. Do not give ${SVC} itil or admin.`,
      done: (s) => canRead(s) && narrow(s),
    },
    ask(
      'Where the fix belongs',
      'A colleague says: give the integration user admin and the problem is gone. Why not?',
      [
        'Admin is slower',
        `Admin passes every ACL, so a leaked password of ${SVC} opens the whole instance, and admin hides the next ACL change instead of showing it. itil would also work but is a fulfiller license. The least change is to let the role that is meant for reading the CMDB read this field`,
        'Admin cannot call the REST API',
        'Admin users cannot be web service access only',
      ],
      1,
      'An integration user gets the smallest set of roles for its job, here REST access, incident writer and CMDB reader. When security tightens an ACL, add the reading role to that ACL with the security team, or ask for a scoped role, instead of widening the user.',
    ),
    {
      title: 'Fail loudly on a missing group',
      how: `Runtime Manager, ${POS}, Settings, Properties. Set ci.missingGroup to fail and Apply Changes. A CI without a group then raises APP:CI_WITHOUT_GROUP, counts as an error, and the caller retries, instead of an incident nobody owns.`,
      done: loud,
    },
    {
      title: 'Prove a new alert is routed',
      how: `API client, application ${POS}, POST /alerts with body ${NEW_ALERT}. The answer is 201. In the incident list the new incident has Assignment group Store Systems.`,
      done: (s) => canRead(s) && mine(s).some((r) => r.correlation_id === 'STORE-0042-POS:cash_drawer' && r.assignment_group === groupId(y(s), 'Store Systems')),
    },
    {
      title: 'Route the incidents of this morning',
      how: 'Incident list with Assignment group is empty and Created by svc_pos_alerts. Open each one and set Assignment group to the support group of its CI (Store Systems, Network, Warehouse Systems), then Update. Or select those of one CI and use Update selected.',
      done: (s) => mine(s).length >= 3 && unassigned(s).length === 0,
    },
  ],
  why: 'ServiceNow ACLs do not fail a REST call. A field the user may not read is left out of the answer, and a field the user may not write is ignored, and both come with 200 or 201. So a tightened ACL turns into quiet empty values downstream. Check what the integration user sees by testing as that user, read the field ACLs (table.field) that apply, and fix with the least change: add the reading role to the ACL, never admin on the integration user. Make the app treat a missing required value as an error, so the next change shows up as a failure and not as data nobody owns. In the lab the REST API Explorer can run as another user; in an instance an admin impersonates that user first.',
  docs: 'https://docs.mulesoft.com/http-connector/latest/',
  solve(start) {
    let s = mark(start, 'snow:list:incident')
    s = explore(s, { as: SVC, method: 'GET', table: 'cmdb_ci', params: { sysparm_query: 'name=STORE-0042-POS', sysparm_fields: 'sys_id,name,support_group' } }).state
    s = mark(s, 'snow:acl')
    s = saveAcl(s, 'c0ffee00a1b2c3d4e5f6a7b8c9d0a412', { roles: ['itil', 'cmdb_read'] }).state
    s = change(s, POS, { props: { ...app(s, POS).props, 'ci.missingGroup': 'fail' } })
    s = callApi(s, { env: 'Sandbox', app: POS, method: 'POST', path: '/alerts', body: NEW_ALERT }).state
    const byCi = { 'STORE-0042-POS': 'Store Systems', 'EDGE-RTR-07': 'Network', 'WMS-APP-01': 'Warehouse Systems' }
    for (const [ci, group] of Object.entries(byCi)) {
      const ids = unassigned(s)
        .filter((r) => String(r.correlation_id).startsWith(`${ci}:`))
        .map((r) => r.sys_id)
      if (ids.length) s = updateSelected(s, 'incident', ids, { assignment_group: groupId(y(s), group) }).state
    }
    return s
  },
  answers: { 2: 1, 5: 1 },
}

export const LABS = [lab]
