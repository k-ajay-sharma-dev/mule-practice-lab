export default {
  id: 'ms-105',
  category: 'mulesoft',
  title: 'Access Management: Business Groups, Environments, Teams, Roles and Audit Logs',
  level: 'INTERMEDIATE',
  tags: ['security', 'access-management', 'governance', 'business-groups', 'teams', 'roles', 'audit'],
  estMinutes: 30,
  quiz: [
    {
      type: 'single',
      prompt: 'Priya is Organization Administrator in BusinessGroupB. Can she grant a user access to APIs in BusinessGroupA, a sibling group?',
      options: [
        'No: permissions in one business group do not apply in another',
        'Yes: Organization Administrator is global',
        'Yes, if the user is in the root organization',
        'Only for read access',
      ],
      answer: 0,
      explain: 'The docs use this exact example. Permissions and roles assigned in one business group do not apply to that user\'s access in other business groups.',
    },
    {
      type: 'single',
      prompt: 'In Anypoint Platform, a business group can have child groups. A user gains Organization Administrator on a parent group after a child group was created. What does this give the user in that child group?',
      options: [
        'Nothing automatic, because the inheritance is not retroactive',
        'Organization Administrator, because it flows down to every child group',
        'Organization Administrator, once the child group owner accepts it',
        'Read-only access to the child group settings',
      ],
      answer: 0,
      explain: 'Users with Organization Administrator at a level get it automatically in child groups created within that level. The docs say this does not apply to users who gain the permission after the child group is created, so check existing child groups when you promote someone. Separately, the owner of a parent group keeps administrator permissions for its child groups, even if another administrator owns the child, and owners of child groups cannot view the parent group\'s client ID and client secret.',
    },
    {
      type: 'single',
      prompt: 'To let a QA group manage Runtime Manager apps in Sandbox but not in Production, what do you do?',
      options: [
        'Grant the product permission for the Sandbox environment through a team, since product permissions are environment-specific',
        'Add the users directly to the Sandbox environment',
        'Move the users into a child business group called Sandbox',
        'Give them the permission for all environments and rely on process',
      ],
      answer: 0,
      explain: 'You cannot grant users access to an environment directly. Default product permissions are environment-specific, so they are granted per environment.',
    },
    {
      type: 'single',
      prompt: 'A permission is added to the team **Everyone at <Root Organization>**. Who gets it?',
      options: [
        'Every user in the organization, because all users belong to this root team and child teams inherit from their parent',
        'Only users invited by email',
        'Only users in the root business group',
        'Only team maintainers',
      ],
      answer: 0,
      explain: 'All users who join by invitation or SSO are in the root team. The docs warn to assign there only what every user should have.',
    },
    {
      type: 'match',
      detail: true,
      prompt: 'Match each way of granting access to its description.',
      pairs: [
        ['Team', 'Hierarchical group of users with cascading permissions across business groups'],
        ['Role', 'Set of permissions for individual users, specific to a business group'],
        ['Direct user grant', 'A permission given to one user with no role or team'],
      ],
      explain: 'The roles page says to use Teams for an access solution that works across business groups. Default roles cannot be deleted; custom roles can.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'An environment was created as Sandbox by mistake and should be Production. What can you do?',
      options: [
        'Create a new Production environment, because the type cannot be changed after creation',
        'Edit the type in Access Management',
        'Ask each user to change it in their profile',
        'Rename it to "prod", which changes the type',
      ],
      answer: 0,
      explain: 'The environment page says the type cannot be changed after you create the environment.',
    },
    {
      type: 'multi',
      detail: true,
      prompt: 'Compliance needs platform changes kept for 3 years. Which statements about audit logs are correct?',
      options: [
        'The default retention for a new organization is one year',
        'Retention can be configured between 30 and 2190 days',
        'A new retention period takes effect at least seven days from the current date',
        'Logs can be viewed by users with Organization Administrator or Audit Log Viewer, and each user sees logs for their own business group',
        'Audit logs record every API request that passes through Mule Gateway',
      ],
      answer: [0, 1, 2, 3],
      explain: 'Audit logs record actions performed within Anypoint Platform, such as user interactions with objects. Setting retention needs Audit Log Config Manager, plus Organization Administrator when you use the UI. API traffic belongs to analytics and monitoring.',
    },
  ],
  description: `
A holding company with three subsidiaries (Retail, Finance, Logistics) uses one Anypoint Platform organization. Today everyone is an Organization Administrator "to avoid tickets". After an auditor's report, the company must:

- Keep each subsidiary's APIs, apps and client credentials apart.
- Let a central platform team support all subsidiaries.
- Let developers deploy to Sandbox but never to Production, while a small release team deploys to Production.
- Keep a record of who changed what for 3 years.

**Questions**
1. How do root organizations and business groups work, and what does a parent keep?
2. How do you assign access with teams, roles and permissions? When would you use each?
3. How do environments fit in?
4. What do audit logs give you, and how do you meet the 3-year requirement?
5. Sketch the target model for this company.
`,
  answerTemplate: `## Organizations and business groups

## Teams, roles and permissions

## Environments

## Audit logs

## Target model
`,
  keyPoints: [
    'A root organization holds the entitlements and can contain business groups in a hierarchy, up to 100. Business groups are not enabled by default in a new account.',
    'Permissions in one business group do not apply in another. A parent owner keeps admin rights over children; child owners cannot see the parent settings or client credentials.',
    'Organization Administrator flows down to child groups created at that level, but this is not retroactive.',
    'Teams are hierarchical and cascade permissions across business groups: up to 1000 teams, nested 10 levels, and a root team containing everyone.',
    'Roles are set for individual users and are specific to a business group. Default roles cannot be deleted; custom roles can.',
    'Product permissions are environment-specific. You cannot add a user to an environment directly, and the environment type cannot change after creation.',
    'Audit logs: default retention one year (six for organizations created before 10 July 2023), configurable from 30 to 2190 days, and business-group aware.',
  ],
  solution: `
**1. Structure.** The root organization is a single instance of Anypoint Platform holding all entitlements. Business groups form a hierarchy under it, with one parent each and up to 100 in total, and they must be activated by MuleSoft. Each business group has one owner, who needs the Organization Administrator permission. A parent owner keeps administrator permissions for children, but a child owner cannot reach the parent's settings or see its client ID and client secret. When creating a child, only redistributable entitlements such as VPCs and load balancers assigned to the parent can be allocated to it.

**2. Access.**
- **Teams** are the main tool. They form a hierarchy under **Everyone at <Root Organization>**, and each child team inherits its parent's permissions. A team can hold permissions in several business groups and environments, and team maintainers can manage members without being administrators. SSO groups can be mapped to teams.
- **Roles** are predefined or custom sets of permissions for individual users, specific to one business group.
- **Direct grants** are for exceptions.

**3. Environments.** You give access to an environment through permissions: default product permissions are environment-specific. Production and Sandbox are types, and the type is fixed at creation. A sandbox lets you add users without letting them near production.

**4. Audit logs.** They hold a queryable history of actions in the platform: time, product, type, action, object, user, and the connected app if one acted. Read them in **Access Management > Audit Logs** or through the Audit Log Query API, with Organization Administrator or Audit Log Viewer. They are business-group aware. For 3 years, set retention to at least 1095 days, as a new organization defaults to one year. This needs Audit Log Config Manager, and Organization Administrator when using the UI. The change takes effect at 00:00:00 UTC on a chosen date at least seven days ahead. With the required subscription, Telemetry Exporter can send logs to external tools, where \`mulesoft.audit.id\` removes duplicates.

**5. Target model.**
\`\`\`
Root organization (owners: 2 platform administrators)
 ├─ Retail BG      ├─ Finance BG      └─ Logistics BG
Teams
 ├─ Platform Support     read access across all business groups
 ├─ Retail Developers    Sandbox permissions in Retail BG
 ├─ Retail Release       Production permissions in Retail BG
 └─ (same for Finance and Logistics)
\`\`\`
Remove Organization Administrator from everyone else, and map teams to SSO groups.
`,
  followUps: [
    {
      q: 'What happens to the organization owner after a transfer of ownership?',
      a: 'The original owner keeps the Organization Administrator permission unless you explicitly revoke it, so remember to remove it.',
    },
    {
      q: 'Why do Anypoint Staff entries appear in the audit log?',
      a: 'They appear when the action was performed by someone outside your organization: routine internal processes, entitlement changes from license grants, or a MuleSoft employee acting on your behalf, for example for troubleshooting.',
    },
    {
      q: 'Are there limits on the team structure?',
      a: 'An organization can have up to 1000 teams, nested up to 10 levels including the root team, and team names must be unique across the organization. Teams can be moved within the hierarchy, and every child team inherits from its parent, so review what a new parent grants.',
    },
  ],
}
