export default {
  id: 'ms-231',
  category: 'mulesoft',
  title: 'Anypoint Code Builder or Anypoint Studio: Choosing an IDE for a New Team',
  level: 'BEGINNER',
  tags: ['anypoint-code-builder', 'anypoint-studio', 'ide', 'vs-code', 'project-structure', 'fundamentals', 'insurance'],
  estMinutes: 12,
  quiz: [
    {
      type: 'single',
      prompt: 'A new team already works in Visual Studio Code every day and wants to build and debug Mule flows without a second editor. What fits?',
      options: [
        'Anypoint Studio, added to VS Code as a plugin',
        'The DataWeave extension for VS Code, on its own',
        'Anypoint Code Builder, installed in VS Code',
        'Design Center flow designer, opened inside VS Code',
      ],
      answer: 2,
      explain: 'Anypoint Code Builder is built on Visual Studio Code, as a desktop extension and as a cloud IDE. Anypoint Studio is built on Eclipse and is a separate desktop application. The DataWeave extension helps with scripts, but it does not build or debug Mule flows. Flow designer runs in Design Center in the browser.',
    },
    {
      type: 'single',
      prompt: 'A contractor works on a locked-down laptop where she cannot install desktop software. Which option may still let her build Mule apps?',
      options: [
        'Anypoint Studio, run in a browser tab',
        'The Code Builder cloud IDE, if the organisation has it',
        'Runtime Manager, which can edit app flows',
        'None, Mule apps need a desktop IDE',
      ],
      answer: 1,
      explain: 'Anypoint Code Builder comes as a desktop VS Code extension and as a cloud IDE in the browser. Studio is a desktop application.',
    },
    {
      type: 'multi',
      prompt: 'Half of a team works in Studio and half in Code Builder, on the same projects and the same CI pipeline. Which statements are true?',
      options: [
        'It is a Maven project with a pom.xml and a mule-artifact.json',
        'It should live in Git, not only inside the IDE workspace',
        'A CI pipeline can build and deploy it with Maven without any IDE',
        'Code Builder projects need a different packaging in the pom.xml than Studio projects',
        'The CI build reads the Studio .project and .classpath files to find dependencies',
        'The runtime version picked in each IDE decides which runtime the CI build targets',
      ],
      answer: [0, 1, 2],
      explain: 'Both IDEs work on the same project shape: a Maven project with a pom.xml and a mule-artifact.json, so the packaging is the same mule-application in both. Kept in Git, it is one shared source for both halves of the team. The CI build runs Maven from the pom.xml without any IDE. It does not read the Eclipse .project or .classpath files, which are only IDE settings. The runtime the app targets comes from the project and the deployment settings, not from the runtime each developer picked in the IDE.',
    },
    {
      type: 'single',
      prompt: 'Does the IDE a developer used change what runs on CloudHub?',
      options: [
        'Yes, Code Builder apps run on a different runtime',
        'No, the platform deploys both the same way',
        'Yes, Studio apps need a special worker type',
        'Yes, Code Builder apps need a newer Java version',
      ],
      answer: 1,
      explain: 'The deployable artifact is a Mule application built from the project. The runtime does not know which editor wrote the XML.',
    },
    {
      type: 'single',
      prompt: 'Which is a fair reason for an existing team to stay on Anypoint Studio for now?',
      options: [
        'Studio is the only IDE that can run apps locally',
        'The team knows it and its guides are built around it',
        'Studio projects cannot be opened in other IDEs',
        'Code Builder has no way to debug a flow',
      ],
      answer: 1,
      explain: 'Skills, guides and habits are real costs. A move can be planned project by project without changing the apps themselves.',
    },
    {
      type: 'order',
      prompt: 'Order the steps to move one existing project from Studio to Code Builder.',
      items: [
        'Make sure the project is committed to Git with its pom.xml',
        'Open the project folder in Code Builder',
        'Let it resolve the Maven dependencies and fix any build errors',
        'Run the app locally and call its endpoints',
        'Run the MUnit tests before you push changes',
      ],
      explain: 'The project is the same files, so the move is mostly opening it and proving it still builds, runs and passes its tests.',
    },
  ],
  description: `
Ridgeway Insurance is growing its integration team from four to ten developers. The four existing developers use Anypoint Studio. Some new hires have used Visual Studio Code for years and ask to use Anypoint Code Builder. The team lead must decide before onboarding starts.

**Questions**
1. What are the two IDEs, and how do they differ?
2. Do they produce different kinds of Mule apps?
3. What should the team standardise on, whatever IDE each person uses?
4. How would you move existing projects if the team changes IDE?
`,
  answerTemplate: `## The two IDEs

## What they produce

## What to standardise

## Moving projects
`,
  keyPoints: [
    'Anypoint Studio is a desktop IDE built on Eclipse.',
    'Anypoint Code Builder is built on VS Code, as a desktop extension and as a cloud IDE.',
    'Both work on standard Mule 4 Maven projects.',
    'The deployed app is the same whichever IDE wrote it.',
    'Standardise the build, Git, code style and tests, not only the editor.',
    'Check the current feature list, since Code Builder changes often.',
  ],
  solution: `
**1. The two IDEs.** Anypoint Studio is the long-standing desktop IDE, built on Eclipse, with a visual flow canvas and the Mule debugger. Anypoint Code Builder is the newer IDE, built on Visual Studio Code. It comes as a desktop VS Code extension pack and as a cloud IDE that runs in a browser. It covers API design and app development in one tool. Features change with each release, so check the current documentation before you compare details.

**2. What they produce.** Both work on a Mule 4 project: Maven, a \`pom.xml\`, \`mule-artifact.json\` and the flow XML. The runtime runs the built application, and it does not care which editor wrote the files. A project can usually be opened in either IDE.

**3. What to standardise.** The pipeline builds with Maven, so the IDE is a personal tool as long as the shared parts are fixed: the Git repository and branch rules, the parent POM and plugin versions, the Mule runtime version, the code style for flows and DataWeave, and MUnit tests that must pass in CI. Pick one IDE for training material and pair sessions, so new hires get consistent help.

**4. Moving projects.** Commit the project to Git, open the folder in the other IDE, let it resolve dependencies, then run the app and its tests. Move one low-risk project first and write down what needed fixing before you move the rest.
`,
  followUps: [
    {
      q: 'Can two developers on one project use different IDEs?',
      a: 'Usually yes, because the files are the same. Agree on formatting and do not commit IDE settings folders, so each change only shows real edits.',
    },
    {
      q: 'What would make you choose the cloud IDE over the desktop one?',
      a: 'Locked-down laptops, short onboarding, or contractors who should not keep code on their own machines. Check network rules and what the cloud IDE can reach, such as internal databases.',
    },
    {
      q: 'Does the IDE choice affect MUnit tests?',
      a: 'The tests are part of the project and run with Maven in CI. Each IDE can run them locally, but the pipeline result is the one that counts.',
    },
  ],
}
