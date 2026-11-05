export default {
  id: 'inc-096',
  category: 'incidents',
  title: 'All SSO Users Lose Their Teams After the SAML Identity Provider Is Deleted and Recreated',
  level: 'INTERMEDIATE',
  tags: ['security', 'access-management', 'sso', 'saml', 'identity-provider', 'teams', 'audit'],
  estMinutes: 25,
  investigation: {
    logs: [
      { text: 'Fri 18:04:51 audit product=Access Management type=Identity Provider action=Delete object=corp-saml user=a.morel', relevant: true, why: 'The change that started it: the IdP configuration was deleted, not updated.' },
      { text: 'Fri 18:04:52 audit product=Access Management type=Team action=Update object=API Developers user=a.morel', relevant: true, why: 'Deleting an IdP also deletes the external team or role group mappings associated with it.' },
      { text: 'Fri 18:09:33 audit product=Access Management type=Identity Provider action=Create object=corp-saml user=a.morel', relevant: true, why: 'Same name and metadata, but Anypoint Platform treats this as a new identity provider.' },
      { text: 'Fri 18:15:00 audit product=Runtime Manager type=Application action=Restart object=orders-api user=ci-connected-app', relevant: false },
      { text: 'Mon 08:31:12 audit product=Access Management type=User action=Create object=j.lindqvist user=sso', relevant: true, why: 'A user who already existed is created again, tied to the new IdP. These are the duplicates.' },
      { text: 'Mon 08:33:40 audit product=Exchange type=Asset action=Read object=sys-orders-api user=j.lindqvist', relevant: false },
      { text: 'Mon 08:40:02 audit product=API Manager type=Policy action=Update object=api-20117342 user=ci-connected-app', relevant: false },
    ],
    questions: [
      {
        type: 'single',
        prompt: 'Why did users lose their access?',
        options: [
          'A recreated IdP is a new IdP: users sign in as new users tied to it, and deleting the old IdP deleted its group mappings',
          'The SAML certificate expired',
          'MFA was reset for all users',
          'The business group was removed',
        ],
        answer: 0,
        explain: 'Two documented behaviours combine here. The SSO limitations describe the new IdP and duplicate users, and the IdP page says that external team or role group mappings are deleted with the IdP.',
      },
      {
        type: 'single',
        prompt: 'Why do automation scripts that call the Access Management API for this IdP also fail?',
        options: [
          'The API endpoints associated with a deleted IdP are no longer supported',
          'Connected apps are deleted with the IdP',
          'The API is only available to SSO users',
          'All tokens expire when an IdP is created',
        ],
        answer: 0,
        explain: 'The page lists three effects of deleting an IdP: users can no longer use it to sign in, its mappings are deleted, and its API endpoints are no longer supported.',
      },
      {
        type: 'single',
        prompt: 'What restores permissions fastest for most users?',
        options: [
          'Add the group mappings again on each team under External IdP Groups, selecting the new provider',
          'Invite every user again',
          'Delete the IdP and create it a third time',
          'Give all users Organization Administrator until it is sorted out',
        ],
        answer: 0,
        explain: 'Mappings apply only to the IdP they were configured for, so they must be added for the new one. Inviting users would store them with the Anypoint identity provider instead.',
      },
      {
        type: 'multi',
        prompt: 'Which belong in prevention?',
        options: [
          'Update an existing SAML provider instead of deleting it, and never change Issuer or Audience casually, as that effectively switches to a different IdP',
          'Keep a record of team and group mappings, so they can be rebuilt',
          'Keep at least one administrator who can sign in without SSO',
          'Require a change record for identity provider changes',
          'Rely on Anypoint Platform to merge duplicate users automatically',
        ],
        answer: [0, 1, 2, 3],
        explain: 'Users with the same username but different IdPs co-exist and are managed independently, so duplicates must be cleaned up by hand.',
      },
      {
        type: 'order',
        prompt: 'Order the recovery.',
        items: [
          'Use the audit log to confirm that the IdP was deleted and recreated',
          'List the team to group mappings from the last known record',
          'Add the mappings again for the new identity provider',
          'Ask a sample of users to sign in, and confirm their permissions',
          'Remove the old duplicate user accounts tied to the deleted IdP',
          'Update scripts that used the old IdP endpoints',
        ],
        explain: 'Restore access for people first, then clean up the duplicates and the automation.',
      },
    ],
  },
  description: `
## Symptoms
- Monday 08:30: developers sign in to Anypoint Platform through SSO as usual, but see **no environments or APIs**. Only what the root team grants is available.
- In **Users**, many names now appear **twice**.
- Deployments from CI still work.
- An identity sync script gets errors from the Access Management API.

## Change / Context
- On Friday evening a platform administrator had to fix a SAML setting. A previous attempt to edit it failed, so the administrator **deleted the SAML identity provider** and added it again with the same metadata.
- 240 staff use SSO. Their permissions come from IdP groups mapped to 18 teams.
- CI pipelines use connected apps.

## Logs
\`\`\`
Fri 18:04:51 audit type=Identity Provider action=Delete object=corp-saml user=a.morel
Fri 18:09:33 audit type=Identity Provider action=Create object=corp-saml user=a.morel
Mon 08:31:12 audit type=User action=Create object=j.lindqvist user=sso
\`\`\`

## Your tasks
1. What is the most likely root cause?
2. What do you do right now?
3. What is the permanent fix?
4. How do you stop this class of issue happening again?
`,
  answerTemplate: `## Diagnosis

## Immediate mitigation

## Root cause

## Permanent fix

## Prevention
`,
  keyPoints: [
    'Deleting a SAML IdP and recreating it with the same configuration creates a new IdP. Users are tied to the new one, and duplicates appear.',
    'Deleting an IdP deletes its external team or role group mappings and ends support for its API endpoints.',
    'Mappings apply only to the IdP they were configured for, so they must be added again.',
    'Users with the same username co-exist and are managed separately. Old accounts must be removed by hand.',
    'Update an IdP rather than delete it. Changing Issuer or Audience effectively switches to a different IdP.',
    'Connected apps do not depend on the SSO IdP, which is why CI kept working.',
    'Audit logs show who did it and when.',
  ],
  solution: `
**Diagnosis.** The audit log shows a delete and a create on Friday. The symptoms match the docs: users signing in are associated with the new IdP, existing accounts stay tied to the deleted one, so duplicates appear. The new accounts have no team membership from groups, as the mappings were deleted with the old IdP. They only have what the root team **Everyone at <Root Organization>** grants.

**Immediate mitigation.**
- For each of the 18 teams: **Access Management > Teams > External IdP Groups**, then add the group, with the new provider and type **Member**.
- Check a sample of users. Do not invite users by hand, since those accounts would be stored with the Anypoint identity provider.

**Root cause.** A destructive change was used for a configuration fix, with no understanding of what is tied to the identity provider. The docs warn that before deleting an IdP you must ensure that credentials and permission structures are configured with another one.

**Permanent fix.**
- Finish the mappings for the new IdP, from a saved record if there is one. If there is none, see what the audit log shows and confirm the mappings with the team owners.
- Remove old duplicate accounts tied to the deleted IdP, after checking that nothing they own is lost. Review any connected apps they created, as ownership moves to the root organization owner when a creator is removed, and rotate those secrets.
- Update scripts to use the endpoints of the new IdP.

**Prevention.**
- Use **Update** on the provider. The SAML page warns that changing \`Issuer\` or \`Audience\` effectively switches to a different IdP, which can cause unwanted user duplication.
- Keep team and group mappings in version control, or export them through the API.
- Treat identity provider changes as high-risk: a change record, a second reviewer, and a window with staff on hand.
- Keep an administrator account that can sign in without SSO for such recoveries. Accounts from before federation sign in through the Anypoint Platform page.
`,
  followUps: [
    {
      q: 'Why could the CI pipelines still deploy?',
      a: 'They use connected apps with their own client credentials and scopes, so they do not depend on the SAML identity provider.',
    },
    {
      q: 'What if the user in the IdP had been deleted instead?',
      a: 'The docs say that deleting a user from your identity provider does not remove them from Anypoint Platform: you must also delete the user manually from the organization.',
    },
    {
      q: 'How do you rotate a SAML signing certificate without this risk?',
      a: 'Edit the existing SAML provider instead of deleting it. For the keys Anypoint Platform uses to sign its requests, you can store up to three and designate a primary. So add the new key and reassign the primary only after the IdP can use it.',
    },
  ],
}
