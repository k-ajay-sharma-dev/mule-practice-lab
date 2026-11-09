export default {
  id: 'cs-103',
  category: 'case-studies',
  title: 'University Connecting Its LMS to 30 EdTech Tools and Passing Grades Back to the SIS',
  level: 'INTERMEDIATE',
  tags: ['education', 'lti', 'saas-integration', 'oauth2', 'security', 'pii', 'idempotency', 'governance'],
  estMinutes: 40,
  quiz: [
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Faculties want 30 tools (proctoring, plagiarism checks, publisher courseware) to open from inside LMS courses with the student already signed in. What is the best standard approach?',
      options: [
        'Give each tool vendor a nightly CSV of students and courses from the SIS',
        'Use LTI 1.3 launches configured in the LMS, so the LMS passes a signed identity and course context to each tool',
        'Build a MuleSoft Experience API per tool that returns the student\'s password hash for single sign-on',
        'Ask each vendor to call the SIS database directly to check enrolments',
      ],
      answer: 1,
      explain: 'LTI 1.3 is the standard for launching tools from an LMS. The LMS signs a token with the user, role and course, so the tool needs no roster file and no direct access to university systems.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Final grades must reach the SIS, the record of transcripts, after an instructor approves them in the LMS. Which design fits best?',
      options: [
        'Every tool writes grades straight into the SIS through its own integration',
        'The LMS gradebook is the single source for course grades; when an instructor releases final grades, a Process API reads them from the LMS and posts them to the SIS through a System API, keyed by course section and student id',
        'The registrar exports grades from the LMS as a spreadsheet and imports them into the SIS each term',
        'A database trigger in the LMS vendor\'s database pushes every grade change to the SIS',
      ],
      answer: 1,
      explain: 'Tools return scores to the LMS gradebook (LTI Assignment and Grade Services). Only instructor-approved final grades move to the SIS, through one Process API. Keying on section and student makes a resend safe.',
    },
    {
      type: 'multi',
      needsScenario: true,
      prompt: 'Which controls protect student data when a new tool is connected? (choose all that apply)',
      options: [
        'A data protection review and contract with the vendor before the tool is enabled',
        'LTI settings that share only the claims the tool needs (for example no email address for an anonymous survey tool)',
        'Enabling the tool for every course at once so faculties do not need to request it',
        'An inventory of tools, the data each receives and the owner who approved it',
        'Giving each tool the LMS administrator API key so it can read what it needs',
      ],
      answer: [0, 1, 3],
      explain: 'Review, minimal claims and an inventory with owners keep student data under control. Enabling everywhere and sharing an admin key give tools far more data and power than they need.',
    },
    {
      type: 'order',
      prompt: 'Put the steps for releasing final grades to the SIS in order.',
      items: [
        'Instructor approves and releases final grades in the LMS',
        'The LMS sends a "grades released" event to the integration',
        'The Process API reads the section\'s final grades from the LMS',
        'The Process API validates each grade against the SIS grading scheme',
        'Grades are posted to the SIS through its System API',
        'Rejected grades are reported to the instructor and the registrar',
      ],
      explain: 'The instructor\'s approval starts the flow. Validation against the SIS scheme (for example, letter grades only) happens before posting, so the SIS never holds half a section, and rejects go back to people who can fix them.',
    },
    {
      type: 'match',
      prompt: 'Match each need to the most suitable mechanism.',
      pairs: [
        ['Open a publisher tool from a course with the student signed in', 'LTI 1.3 launch'],
        ['A plagiarism tool returns a score to the gradebook', 'LTI Assignment and Grade Services'],
        ['A tool needs the full class list for group work', 'LTI Names and Role Provisioning Services'],
        ['Course sections and enrolments created in the LMS each term', 'Roster sync from the SIS through MuleSoft'],
      ],
      explain: 'LTI covers what a tool needs at launch and afterwards. The roster sync from the SIS is a separate integration that creates courses and enrolments before any tool is used.',
    },
    {
      type: 'single',
      prompt: 'Two weeks after grades were posted, the registrar finds 40 grades missing in the SIS for one section. Which design choice makes this quickest to fix safely?',
      options: [
        'Re-running the whole term\'s grade posting for every section',
        'A posting log per section with each grade\'s outcome, and idempotent posting keyed by section and student so the section can be resent',
        'Asking the instructor to enter the 40 grades in the SIS by hand',
        'Turning off validation so no grade is ever rejected again',
      ],
      answer: 1,
      explain: 'A per-section log shows which grades failed and why. Idempotent posting means the section can be sent again without creating duplicate or conflicting grades.',
    },
  ],
  description: `
**Context.** A university with 38,000 students runs a cloud LMS for 9,000 course sections a term. Faculties use about 30 third-party tools inside courses: online proctoring, plagiarism detection, publisher courseware, video, surveys and lab simulations. The student information system (SIS) holds the official record: enrolments, final grades and transcripts. MuleSoft already syncs rosters from the SIS to the LMS.

**The problem today.**
- Each tool was connected differently. Some receive nightly CSV roster files by email, some ask students to create accounts, and one has a service account with read access to the whole LMS.
- Final grades are exported from the LMS by instructors and uploaded to the SIS by registrar staff. In the last term 2% of grades had to be corrected after transcripts were issued.

**Goals**
- Tools open from inside courses with no separate login and no roster files.
- Tools return scores to the LMS gradebook.
- Final grades reach the SIS after instructor approval, with no re-keying.
- The university knows which tool receives which student data, and why.

**Constraints**
| Item | Detail |
|---|---|
| Standards | The LMS supports LTI 1.3, Assignment and Grade Services and Names and Role Provisioning Services |
| Volume | About 220,000 final grades a term, mostly in a 10-day window |
| SIS | Accepts grades through a REST API per section; rejects grades that do not fit the course's grading scheme |
| Privacy | Student records are protected by education privacy law; new vendors need a data protection review |
| Governance | An IT governance board approves new tools; faculties often buy tools themselves |

**Your task.** Answer the questions about tool connections, grade passback and governance.
`,
  answerTemplate: `## Connecting tools

## Scores and the gradebook

## Final grades to the SIS

## Student data and vendor governance

## Fixing errors
`,
  keyPoints: [
    'LTI 1.3 is the standard for launching tools from an LMS; it removes roster files and separate logins.',
    'Tools return scores to the LMS gradebook through LTI services; the LMS is the source for course grades and the SIS is the record for final grades.',
    'A Process API moves instructor-approved final grades to the SIS through a System API, validates them first and keys each grade on section and student.',
    'Each tool shares only the claims it needs, after a data protection review, and is recorded in a tool inventory with an owner.',
    'A per-section posting log and idempotent posting make corrections quick and safe.',
  ],
  solution: `
**Tools.** Every tool is registered in the LMS as an LTI 1.3 tool. The LMS signs launch tokens with the user, role and course. Tools that need class lists use Names and Role Provisioning Services; tools that grade use Assignment and Grade Services. Roster files and shared admin keys are retired.

**Grades.** The LMS gradebook holds course grades. When an instructor releases final grades, the LMS sends an event (or a scheduled job checks released sections every 15 minutes). \`prc-final-grades\` reads the section's grades from the LMS, checks them against the SIS grading scheme, posts them through \`sys-sis-grades-api\` and records each outcome in a posting log. Posts are keyed on section and student id, so resending a section is safe. Rejected grades go back to the instructor and the registrar.

**Governance.** New tools go through the governance board: data protection review, contract, list of LTI claims shared, owner and review date. The inventory is published to faculties so they can see what is approved.

**Peak.** 220,000 grades in 10 days is about 22,000 a day, well inside the SIS limits when posted per section.
`,
  followUps: [
    { q: 'Why not let tools write final grades into the SIS themselves?', a: 'The SIS would receive grades from 30 sources without instructor approval. One Process API after approval keeps the SIS consistent and auditable.' },
    { q: 'What does LTI 1.3 give you that a CSV roster file does not?', a: 'A signed launch with the current user, role and course at the moment of use. No file of all students has to be sent to the vendor.' },
    { q: 'How do you limit what a survey tool learns about students?', a: 'Configure the tool to receive only the claims it needs, for example an opaque user id without name or email.' },
  ],
}
