export default {
  id: 'ms-037',
  category: 'mulesoft',
  title: 'Calling Java from Mule 4: Java Module and DataWeave Java Interop',
  level: 'INTERMEDIATE',
  tags: ['java-module', 'java', 'dataweave', 'extensibility'],
  estMinutes: 15,
  quiz: [
    {
      type: 'single',
      prompt: 'The developer copied `acme-crypto-2.4.jar` into `src/main/resources/lib` and gets `ClassNotFoundException`. What is the correct fix?',
      options: [
        'Move it to `src/main/resources/classes`',
        'Install/publish the jar to a Maven repository (Nexus, Artifactory or Exchange) and add it as a dependency in `pom.xml`',
        'Reference it with `readUrl("classpath://lib/acme-crypto-2.4.jar")`',
        'Add the path to `mule-artifact.json` as a resource',
      ],
      answer: 1,
      explain: 'Jars in `src/main/resources` are only resources, not class-path libraries. A Maven dependency puts it on the class path and keeps the CI build reproducible.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'How do you call the static `Checksum.luhnCheckDigit` from DataWeave?',
      options: [
        '`import java!com::acme::crypto::Checksum` then `Checksum::luhnCheckDigit($.number)`',
        '`import com.acme.crypto.Checksum` then `Checksum.luhnCheckDigit($.number)`',
        '`java("com.acme.crypto.Checksum", "luhnCheckDigit", $.number)`',
        'It is not possible; only the Java module can call Java',
      ],
      answer: 0,
      explain: 'DataWeave Java interop uses the `java!` prefix with `::` separators and can call **static** methods.',
    },
    {
      type: 'single',
      needsScenario: true,
      prompt: 'Can DataWeave create a `Signer` and call its instance method `sign`?',
      options: [
        'Yes, with `new Signer(alias).sign(payload)`',
        'No — DataWeave calls static methods (and reads fields); use the Java module New and Invoke operations for instances',
        'Yes, if the class is a Spring bean',
        'Only in DataWeave 1.0',
      ],
      answer: 1,
      explain: 'DataWeave can instantiate a class (`Signer::new(...)`) and read its fields, but it cannot call instance methods such as `sign`. `java:new` creates the instance and `java:invoke` calls the method on it.',
    },
    {
      type: 'single',
      prompt: 'A Mule app calls the instance method `sign` of a Java class `Signer` on every request, and a `Signer` is expensive to construct. How should the app get its `Signer` object?',
      options: [
        'Create a new instance per message, so threads never share it',
        'Keep it in `src/main/resources` as a serialized file',
        'Create it once in DataWeave and call `sign` from there',
        'Create it once, for example as a singleton Spring bean',
      ],
      answer: 3,
      explain: 'Constructing per request wastes CPU, so create the object once, for example as a singleton Spring bean or in an initialisation flow. A shared instance is called by several threads at once, so it must be thread-safe. DataWeave can instantiate a class but cannot call instance methods.',
    },
    {
      type: 'single',
      detail: true,
      prompt: 'In `java:invoke-static ... args="#[{ accountNumber: vars.account }]"`, how are argument keys determined?',
      options: [
        'By position only — keys are ignored',
        'They are the parameter names; if the class was compiled without parameter-name metadata, they are `arg0`, `arg1`, ...',
        'They must match the JSON field names of the payload',
        'They are always `param1`, `param2`, ...',
      ],
      answer: 1,
      explain: 'Arguments are a map keyed by parameter name. The method signature (e.g. `luhnCheckDigit(String)`) resolves overloads.',
    },
    {
      type: 'single',
      prompt: 'A teammate wants to call Java to build a JSON response from the order fields. What is the best reply?',
      options: [
        'Good idea — Java is always faster than DataWeave',
        'That is a smell — plain mapping belongs in DataWeave; use Java for genuinely Java-shaped logic like crypto or existing SDKs',
        'Use a Groovy script instead, it is the recommended approach',
        'Fine, as long as it is a static method',
      ],
      answer: 1,
      explain: 'Java for mapping hides logic from the flow and complicates testing. Groovy works but adds a dynamic language and is usually slower.',
    },
  ],
  description: `
A bank provides an in-house jar \`acme-crypto-2.4.jar\` with:

\`\`\`java
package com.acme.crypto;

public class Checksum {
  public static String luhnCheckDigit(String accountNumber) { ... }
}

public class Signer {
  public Signer(String keyAlias) { ... }
  public String sign(String payload) { ... }   // instance method, expensive to construct
}
\`\`\`

The Mule app must:
- compute a check digit for each account in a list
- sign the outgoing JSON once per request

So far:
- A developer copied the jar into \`src/main/resources/lib\` and gets \`ClassNotFoundException\` at runtime.
- Another suggestion is to use a Groovy script instead.

**Questions**
1. How do you add the jar to the project correctly?
2. How do you call the static method from DataWeave and from the Java module?
3. How do you create the Signer once and reuse it, and call the instance method?
4. How are arguments passed to Java methods, and what errors should you expect?
5. When is calling Java appropriate, and when is it a smell?
`,
  answerTemplate: `## Adding the jar

## Static method calls

## Instances and instance methods

## Arguments and errors

## When to use Java
`,
  keyPoints: [
    'Java code must be on the application class path: a Maven dependency in pom.xml (installed/published to a repository) or source in src/main/java.',
    'DataWeave can call static methods with import java!com::acme::crypto::Checksum then Checksum::luhnCheckDigit(x).',
    'The Java module provides New, Invoke (instance), Invoke static and Validate type operations; arguments are passed as a map keyed by parameter name.',
    'Expensive objects should be created once — e.g. a Spring bean or an instance stored at startup — not per message.',
    'Java is for logic that is genuinely Java-shaped (crypto, existing libraries); plain mapping belongs in DataWeave.',
  ],
  solution: `
**Adding the jar:** jars in \`src/main/resources\` are only resources, not classpath libraries. Install/publish the jar to a Maven repository (corporate Nexus/Artifactory, or Exchange) and add it as a dependency in \`pom.xml\`. For your own classes, put the source in \`src/main/java\`. This also makes the CI build reproducible.

**Static method — DataWeave**
\`\`\`dataweave
%dw 2.0
import java!com::acme::crypto::Checksum
output application/json
---
payload.accounts map {
  account: $.number,
  checkDigit: Checksum::luhnCheckDigit($.number)
}
\`\`\`
DataWeave Java interop calls **static** methods; it can also instantiate a class with \`::new\` and read its fields, but it cannot call instance methods.

**Static method — Java module**
\`\`\`xml
<java:invoke-static class="com.acme.crypto.Checksum"
    method="luhnCheckDigit(String)"
    args="#[{ accountNumber: vars.account }]"/>
\`\`\`
The method signature includes parameter types to resolve overloads. Argument keys are the parameter names; if the class was compiled without parameter-name metadata, they are \`arg0\`, \`arg1\`, ...

**Instances**
\`\`\`xml
<java:new class="com.acme.crypto.Signer" constructor="Signer(String)"
          args="#[{ keyAlias: p('signing.alias') }]" target="signer"/>
<java:invoke instance="#[vars.signer]" class="com.acme.crypto.Signer"
             method="sign(String)" args="#[{ payload: write(payload, 'application/json') }]"/>
\`\`\`
Constructing an expensive object per request wastes CPU. Create it once, for example as a singleton **Spring bean** (Spring module) or cache it in an initialisation flow. Make sure it is thread-safe, because many events use it concurrently.

**Errors:** wrong signature or class → configuration/runtime errors from the Java module (its own \`JAVA:\` error types); exceptions thrown by the method surface as errors whose \`error.cause\` is the Java exception. Handle them like any other error type.

**When to use Java:** wrapping existing, tested libraries (crypto, proprietary SDKs, complex algorithms). It is a smell when used for mapping, string building or HTTP calls that DataWeave or connectors already handle — it hides logic from the flow and complicates testing. Groovy via the Scripting module works but adds a dynamic language and is usually slower; prefer DataWeave or compiled Java.
`,
  followUps: [
    {
      q: 'Why must Java objects shared across events be thread-safe?',
      a: 'Mule processes many events concurrently on shared thread pools, so a single instance (bean) may be called by several threads at once.',
    },
    {
      q: 'How do you check the type of a Java object in a flow?',
      a: 'The Java module has a validate-type operation, and DataWeave can check with the is operator for basic types.',
    },
  ],
}
