// The guided lab access-roles. See platform-labs.js for the shape of a lab.
import { at, mark, newPlatform } from '../platform.js'
import { ask, OPS } from '../platform-kit.js'
import { accessOf, addMember, can, checkAccess, createTeam, effectiveGrants, grant, grantsTo, isOrgAdmin, newAccess } from '../platform-access.js'

const DANA = 'dana.okafor'
const APP = 'promo-pricing-eapi'
// Dana deploys to Production through a team, holds no permission of her own and is not an administrator
const fixed = (s) =>
  can(s, DANA, 'Manage Applications', 'Production', 'ecom') &&
  !isOrgAdmin(s, DANA, 'ecom') &&
  grantsTo(s, `user:${DANA}`).length === 0 &&
  effectiveGrants(s, DANA).some((x) => x.to.startsWith('team:') && x.bg === 'ecom' && x.env === 'Production' && (x.perm === 'Manage Applications' || x.role === 'Runtime Manager Developer'))

const lab = {
  id: 'p-access-roles',
  group: 'Governance and access',
  title: 'Sandbox works, Production says 403',
  minutes: 15,
  scenario: `Dana Okafor deploys ${APP} to Sandbox in the Ecommerce business group every day. Today the release to Production is approved, and Runtime Manager answers 403 You do not have permission. Tom suggests making Dana an Organization Administrator. Find out what is missing and give Dana what the release needs, and no more.`,
  start() {
    const clock = at(1, 9, 5)
    const access = newAccess(clock, {
      audit: [
        { t: at(1, 8, 40), user: DANA, product: 'Runtime Manager', action: 'Manage Applications', type: 'Deploy', object: `${APP} in Ecommerce, Sandbox`, bg: 'ecom', env: 'Sandbox', result: 'Allowed' },
        { t: at(1, 8, 55), user: DANA, product: 'Runtime Manager', action: 'Manage Applications', type: 'Deploy', object: `${APP} in Ecommerce, Production`, bg: 'ecom', env: 'Production', result: 'Denied' },
      ],
    })
    const s = newPlatform({ clock, access })
    s.mail.push({
      t: at(1, 8, 58),
      to: OPS,
      subject: 'Cannot deploy promo pricing to Production',
      body: `Hi, the change for ${APP} is approved for 10:00. In Production, Runtime Manager says 403 You do not have permission to perform this action. Sandbox works as always. Tom says you can make me Organization Administrator so this never happens again. Thanks, Dana`,
      source: 'Dana Okafor, Ecommerce',
    })
    return s
  },
  steps: [
    { title: 'Read the mail from Dana', how: 'Open the Inbox from the menu under Lab tools.', done: (s) => Boolean(s.seen.inbox) },
    { title: 'Find the denied deploy in the audit log', how: 'Access Management, Audit Log. Compare the two deploys of Dana: Sandbox Allowed, Production Denied.', done: (s) => Boolean(s.seen['access:audit']) },
    { title: 'Read the permissions of Dana', how: `Access Management, Users, ${DANA}, Permissions. The matrix shows each permission per business group and environment, and where it comes from.`, done: (s) => Boolean(s.seen['access:users']) },
    ask(
      'Why Sandbox works and Production does not',
      'Dana has Manage Applications from the team Ecommerce Developers. Why is Production denied?',
      [
        'Production needs a second login',
        'Runtime Manager permissions are given per environment. The team has Manage Applications in Ecommerce Sandbox only, and in Production it has Read Applications, so Dana can look but not deploy',
        'Dana is in the wrong business group',
        'The application is locked in Production',
      ],
      1,
      'Runtime Manager and API Manager permissions are scoped to a business group and an environment. The same user can be a deployer in Sandbox and a reader in Production, which is often what you want.',
    ),
    ask(
      'Organization Administrator or less',
      'Tom says to make Dana an Organization Administrator. Why not?',
      [
        'An Organization Administrator cannot deploy apps',
        'It gives every permission in Brightmart and every business group below it: users, connected apps, all environments of Supply Chain too. Least privilege means the smallest permission that does the job, here deploy rights in Ecommerce Production',
        'Only one Organization Administrator is allowed',
        'It would remove her Sandbox access',
      ],
      1,
      'Least privilege limits what a mistake or a stolen login can do. An administrator account is a target; a deployer in one environment of one business group is a small risk.',
    ),
    {
      title: 'Give Production deploy rights through a team',
      how: `Access Management, Teams, Create Team: name it Ecommerce Release, business group Ecommerce. Open it, under Members add ${DANA}. Under Permissions add Manage Applications, Create Applications and Read Applications for business group Ecommerce and environment Production, or the role Runtime Manager Developer for Production. Give nothing to the user directly.`,
      done: fixed,
    },
    ask(
      'Teams or permissions per user',
      'Why give the permission to a team and not to Dana herself?',
      [
        'A permission on a user does not work in Production',
        'A team describes a job, such as release deployer. People join and leave the team, and the access follows; an audit reads the team and sees who can deploy. Permissions set on each user drift apart and stay behind when people change jobs',
        'Teams are faster at login',
        'A user can have only one permission',
      ],
      1,
      'Teams, often mapped to groups of the identity provider, keep access consistent. When Dana changes jobs, removing her from the team removes the access; nothing is left on her account.',
    ),
    {
      title: 'Check that Dana can deploy to Production',
      how: `Access Management, Users, ${DANA}. Under Check access (lab tool) pick Manage Applications, Ecommerce and Production and press Check access. It answers Allowed, and the audit log has a new line.`,
      done: (s) => fixed(s) && accessOf(s).audit.some((e) => e.type === 'Access check' && e.user === DANA && e.action === 'Manage Applications' && e.env === 'Production' && e.bg === 'ecom' && e.result === 'Allowed'),
    },
  ],
  why: 'In Anypoint Access Management a permission belongs to a business group and, for products such as Runtime Manager and API Manager, to one environment. A user gets permissions directly, from a role, or from the teams the user is in. A 403 You do not have permission in one environment while another works means the permission is missing in that environment. Fix it with the least permission for that business group and environment, given to a team that matches the job, not with Organization Administrator. In the lab the Check access panel is a lab tool that shows what the platform would answer.',
  docs: 'https://docs.mulesoft.com/access-management/',
  solve(start) {
    let s = mark(mark(mark(start, 'inbox'), 'access:audit'), 'access:users')
    s = createTeam(s, { name: 'Ecommerce Release', bg: 'ecom' })
    const team = accessOf(s).teams.find((t) => t.name === 'Ecommerce Release')
    s = addMember(s, team.id, DANA)
    for (const p of ['Manage Applications', 'Create Applications', 'Read Applications']) s = grant(s, `team:${team.id}`, p, 'ecom', 'Production')
    return checkAccess(s, DANA, 'Manage Applications', 'Production', 'ecom').state
  },
  answers: { 3: 1, 4: 1, 6: 1 },
}

export const LABS = [lab]
