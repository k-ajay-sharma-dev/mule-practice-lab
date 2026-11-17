export default {
  id: 'rm-122',
  category: 'api-design',
  title: 'Recipe Content API: Accept-Language, Content-Language and a Fallback Language',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'headers', 'localisation', 'caching', 'media'],
  estMinutes: 20,
  description: `
A cooking website publishes recipes in English, French and German. A partner app shows them to its users. Today the app calls \`/recipes/{recipeId}?lang=fr\`, and three problems came up:

- The app does not know which language it got back when a recipe has no French version.
- A cache in front of the API served a German recipe to a French user.
- Translators have no way to send a new translation for one language.

HTTP has standard headers for this. The client sends **\`Accept-Language\`** with the languages it prefers. The server answers with **\`Content-Language\`**, the language it actually used. It also sends **\`Vary: Accept-Language\`**, which tells caches to keep one copy per language and not to share them.

A language tag here is two lower case letters, with an optional dash and two capital letters for the region: \`en\`, \`fr\`, \`fr-CA\`.

**Requirements**
- Title \`Recipe Content API\`, with JSON as the default media type.
- A type \`RecipeText\` with a required string \`title\` of at most 120 characters, and a required array of strings \`steps\` with at least 1 item.
- A type \`Recipe\` that inherits from \`RecipeText\` and adds a required string \`recipeId\`.
- \`GET /recipes/{recipeId}\`:
  - takes an optional string header \`Accept-Language\`
  - returns a \`Recipe\` with status 200, and the response headers \`Content-Language\` and \`Vary\`
  - returns 404 when the recipe does not exist
- Remove the \`lang\` query parameter, so there is one way to ask for a language.
- \`PUT /recipes/{recipeId}/translations/{language}\`:
  - \`language\` is a URI parameter with a pattern that accepts the language tags above
  - the body is a \`RecipeText\`
  - returns 204 when the translation is saved, and 404 when the recipe does not exist
`,
  starter: `#%RAML 1.0
title: Recipe Content API
mediaType: application/json

types:
  Recipe:
    type: object
    properties:
      recipeId: string
      title: string
      steps: string[]

/recipes:
  /{recipeId}:
    get:
      queryParameters:
        lang?: string
      responses:
        200:
          body:
            type: Recipe
`,
  ramlChecks: [
    {
      label: 'The title is Recipe Content API and JSON is the default',
      rule: { type: 'all', rules: [{ type: 'root', key: 'title', want: 'Recipe Content API' }, { type: 'root', key: 'mediaType', want: 'application/json' }] },
    },
    {
      label: 'RecipeText has a title of at most 120 characters and at least one step',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'RecipeText', prop: 'title', want: { type: 'string', required: true, maxLength: 120 } },
          { type: 'prop', typeName: 'RecipeText', prop: 'steps', want: { type: 'string[]', required: true, minItems: 1 } },
        ],
      },
    },
    {
      label: 'Recipe inherits from RecipeText and adds recipeId',
      rule: {
        type: 'all',
        rules: [
          { type: 'typeDecl', name: 'Recipe', extends: 'RecipeText' },
          { type: 'prop', typeName: 'Recipe', prop: 'recipeId', want: { type: 'string', required: true } },
        ],
      },
    },
    {
      label: 'GET /recipes/{recipeId} takes an optional Accept-Language header',
      rule: { type: 'param', path: '/recipes/{}', method: 'get', in: 'header', name: 'Accept-Language', want: { type: 'string', required: false } },
    },
    {
      label: 'The 200 returns a Recipe with Content-Language and Vary',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/recipes/{}', method: 'get', status: '200', typeIs: 'Recipe', header: 'Content-Language' },
          { type: 'response', path: '/recipes/{}', method: 'get', status: '200', header: 'Vary' },
        ],
      },
    },
    { label: 'GET /recipes/{recipeId} returns 404 for an unknown recipe', rule: { type: 'response', path: '/recipes/{}', method: 'get', status: '404' } },
    {
      label: 'language is a URI parameter that accepts en, fr and fr-CA',
      rule: {
        type: 'param',
        path: '/recipes/{}/translations/{}',
        in: 'uri',
        name: 'language',
        want: { pattern: { accepts: ['en', 'fr', 'fr-CA', 'de-AT'], rejects: ['EN', 'fra', 'fr_CA', 'fr-ca', 'f', 'fr-CAN'] } },
      },
    },
    {
      label: 'PUT a translation takes a RecipeText and returns 204 or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/recipes/{}/translations/{}', method: 'put', typeIs: 'RecipeText' },
          { type: 'response', path: '/recipes/{}/translations/{}', method: 'put', status: '204', noBody: true },
          { type: 'response', path: '/recipes/{}/translations/{}', method: 'put', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Recipe Content API
version: v1
baseUri: https://api.example.com/recipes/{version}
mediaType: application/json

types:
  RecipeText:
    type: object
    properties:
      title:
        type: string
        maxLength: 120
      steps:
        type: string[]
        minItems: 1
  Recipe:
    type: RecipeText
    properties:
      recipeId: string
    example:
      recipeId: R-2209
      title: Tarte aux pommes
      steps:
        - Préchauffer le four à 180 °C.
        - Étaler la pâte dans le moule.
  LanguageTag:
    type: string
    pattern: ^[a-z]{2}(-[A-Z]{2})?$

/recipes:
  /{recipeId}:
    get:
      headers:
        Accept-Language?:
          type: string
          description: The languages the caller prefers, such as fr-CA, fr;q=0.8, en;q=0.5
      responses:
        200:
          headers:
            Content-Language:
              type: LanguageTag
              description: The language of this response. It is the default language when none of the requested ones exist.
            Vary:
              type: string
              example: Accept-Language
          body:
            type: Recipe
        404:
          description: No recipe has this id.
    /translations:
      /{language}:
        uriParameters:
          language:
            type: LanguageTag
        put:
          body:
            type: RecipeText
          responses:
            204:
              description: The translation is saved.
            404:
              description: No recipe has this id.
`,
  keyPoints: [
    'Accept-Language is the standard request header for the languages a caller prefers, in order.',
    'Content-Language tells the caller which language it actually got, which matters when the server falls back.',
    'Vary: Accept-Language stops a shared cache from serving one language to a user who asked for another.',
    'Falling back to a default language, and saying so in Content-Language, is friendlier than refusing the request.',
    'A named LanguageTag type keeps the same pattern on the header and on the URI parameter.',
  ],
  solution: `
**Reading.** The app sends \`Accept-Language: fr-CA, fr;q=0.8, en;q=0.5\`, which means "Canadian French, then any French, then English". The API picks the best language it has. If none of them exist, it falls back to the default and says so in \`Content-Language\`. The app always knows what it got, which fixes the first problem. The \`lang\` query parameter goes, so callers have one way to ask and the API has one rule to apply.

**Caching.** \`Vary: Accept-Language\` tells any cache that the response depends on that header. The cache keeps one copy per language value instead of one per URL, which fixes the second problem.

**Writing.** A translation is a sub-resource of the recipe, one per language. \`PUT\` fits, because the caller names the language in the URL and sends the whole text. Sending it again gives the same result, so a translator's tool can retry safely.

\`LanguageTag\` is a named type, so the header and the URI parameter share one pattern. \`^[a-z]{2}(-[A-Z]{2})?$\` accepts \`fr\` and \`fr-CA\`, and refuses \`fr_CA\`, \`EN\` and three-letter codes.
`,
  followUps: [
    {
      q: 'When would you answer 406 Not Acceptable instead of falling back?',
      a: 'When content in another language would be wrong for the caller, such as legal text that must be shown in one language. For recipes, a fallback is more useful, as long as Content-Language says what was sent.',
    },
    {
      q: 'Is a lang query parameter ever the right choice?',
      a: 'It helps when a link must point at one language, for example in a shared URL or a sitemap. Some APIs support both: the query parameter wins when present, and Accept-Language is used otherwise. Keep Vary on the response either way.',
    },
    {
      q: 'Why not put Accept-Language in a trait?',
      a: 'If many resources return text, a trait such as localised with the header and the 200 response headers keeps them the same everywhere. With one resource, writing it inline is clearer.',
    },
  ],
}
