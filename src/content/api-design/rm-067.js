export default {
  id: 'rm-067',
  category: 'api-design',
  title: 'Shopping Basket API: The Right Status for Every Outcome',
  level: 'INTERMEDIATE',
  tags: ['raml', 'api-design', 'status-codes', 'nested-resources', 'request-body', 'errors', 'retail'],
  estMinutes: 20,
  description: `
A grocery chain runs its web shop and mobile app on one basket API. On a Saturday morning it handles about 600 basket changes a second. The front ends show a different message for each outcome, so the contract must give each outcome its own status.

Products have 8-digit SKUs such as \`40012345\`. A shopper can hold 1 to 10 of one product. Stock is checked when an item is added or its quantity goes up, and there may not be enough.

The outcomes to cover:
- an item is added: **201** with \`Location\` and the new line in the body,
- a quantity is changed: **200** with the updated line,
- an item is removed: **204** with no body,
- the body breaks the type: **400**,
- the basket or the line does not exist: **404**,
- not enough stock: **409**.

Setting a quantity of 0 is not how an item is removed. Removal is a \`delete\`, so the quantity in a change must still be from 1 to 10.

**Requirements**
- A type \`NewItem\` with a required \`sku\` of exactly 8 digits and a required integer \`quantity\` from 1 to 10.
- A type \`QuantityChange\` with only a required integer \`quantity\` from 1 to 10.
- A type \`BasketItem\` with a required \`sku\`, a required integer \`quantity\`, and required numbers \`unitPrice\` and \`lineTotal\`.
- A type \`Error\` with a required \`code\` that allows only \`INVALID_REQUEST\`, \`NOT_FOUND\` and \`OUT_OF_STOCK\`, and a required string \`message\`.
- \`POST /baskets/{basketId}/items\` takes \`NewItem\` and returns 201 with \`Location\` and a \`BasketItem\`, 400, 404, and 409 with an \`Error\`.
- \`PATCH /baskets/{basketId}/items/{sku}\` takes \`QuantityChange\` and returns 200 with a \`BasketItem\`, 404, and 409 with an \`Error\`.
- \`DELETE /baskets/{basketId}/items/{sku}\` returns 204 with no body, or 404.
`,
  starter: `#%RAML 1.0
title: Shopping Basket API
mediaType: application/json

types:
  BasketItem:
    type: object
    properties:
      sku: string
      quantity: integer

/baskets:
  /{basketId}:
    /items:
      post:
        body:
          type: BasketItem
        responses:
          200:
            body:
              type: BasketItem
`,
  ramlChecks: [
    {
      label: 'NewItem has an 8-digit sku and a quantity from 1 to 10',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'NewItem', prop: 'sku', want: { type: 'string', required: true, pattern: { accepts: ['40012345', '00000001'], rejects: ['4001234', '400123456', '4001234A'] } } },
          { type: 'prop', typeName: 'NewItem', prop: 'quantity', want: { type: 'integer', required: true, minimum: 1, maximum: 10 } },
        ],
      },
    },
    {
      label: 'QuantityChange holds only a quantity from 1 to 10',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'QuantityChange', prop: 'quantity', want: { type: 'integer', required: true, minimum: 1, maximum: 10 } },
          { type: 'noProp', typeName: 'QuantityChange', prop: 'sku' },
        ],
      },
    },
    {
      label: 'BasketItem has unitPrice and lineTotal as numbers',
      rule: {
        type: 'all',
        rules: [
          { type: 'prop', typeName: 'BasketItem', prop: 'unitPrice', want: { type: 'number', required: true } },
          { type: 'prop', typeName: 'BasketItem', prop: 'lineTotal', want: { type: 'number', required: true } },
        ],
      },
    },
    { label: 'Error code allows only INVALID_REQUEST, NOT_FOUND and OUT_OF_STOCK', rule: { type: 'prop', typeName: 'Error', prop: 'code', want: { required: true, enum: { exactly: ['INVALID_REQUEST', 'NOT_FOUND', 'OUT_OF_STOCK'] } } } },
    { label: 'POST /baskets/{basketId}/items takes a NewItem', rule: { type: 'body', path: '/baskets/{}/items', method: 'post', typeIs: 'NewItem' } },
    { label: 'POST returns 201 with Location and a BasketItem', rule: { type: 'response', path: '/baskets/{}/items', method: 'post', status: '201', typeIs: 'BasketItem', header: 'Location' } },
    {
      label: 'POST returns 400, 404, and 409 with an Error',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/baskets/{}/items', method: 'post', status: '400' },
          { type: 'response', path: '/baskets/{}/items', method: 'post', status: '404' },
          { type: 'response', path: '/baskets/{}/items', method: 'post', status: '409', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'PATCH one item takes a QuantityChange and returns a BasketItem',
      rule: {
        type: 'all',
        rules: [
          { type: 'body', path: '/baskets/{}/items/{}', method: 'patch', typeIs: 'QuantityChange' },
          { type: 'response', path: '/baskets/{}/items/{}', method: 'patch', status: '200', typeIs: 'BasketItem' },
        ],
      },
    },
    {
      label: 'PATCH returns 404, and 409 with an Error when stock runs out',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/baskets/{}/items/{}', method: 'patch', status: '404' },
          { type: 'response', path: '/baskets/{}/items/{}', method: 'patch', status: '409', typeIs: 'Error' },
        ],
      },
    },
    {
      label: 'DELETE one item returns 204 with no body, or 404',
      rule: {
        type: 'all',
        rules: [
          { type: 'response', path: '/baskets/{}/items/{}', method: 'delete', status: '204', noBody: true },
          { type: 'response', path: '/baskets/{}/items/{}', method: 'delete', status: '404' },
        ],
      },
    },
  ],
  referenceRaml: `#%RAML 1.0
title: Shopping Basket API
mediaType: application/json

types:
  Sku:
    type: string
    pattern: ^[0-9]{8}$
  Quantity:
    type: integer
    minimum: 1
    maximum: 10
  NewItem:
    type: object
    properties:
      sku: Sku
      quantity: Quantity
    example:
      sku: "40012345"
      quantity: 2
  QuantityChange:
    type: object
    properties:
      quantity: Quantity
    example:
      quantity: 3
  BasketItem:
    type: object
    properties:
      sku: Sku
      quantity: Quantity
      unitPrice: number
      lineTotal: number
    example:
      sku: "40012345"
      quantity: 2
      unitPrice: 1.85
      lineTotal: 3.70
  Error:
    type: object
    properties:
      code:
        type: string
        enum: [ INVALID_REQUEST, NOT_FOUND, OUT_OF_STOCK ]
      message: string
    example:
      code: OUT_OF_STOCK
      message: Only 1 of SKU 40012345 is left at your store.

/baskets:
  /{basketId}:
    /items:
      post:
        description: Add a product to the basket.
        body:
          type: NewItem
        responses:
          201:
            headers:
              Location:
                type: string
            body:
              type: BasketItem
          400:
            body:
              type: Error
          404:
            description: No basket has this id.
            body:
              type: Error
          409:
            description: Not enough stock for this quantity.
            body:
              type: Error
      /{sku}:
        patch:
          description: Change how many of a product are in the basket.
          body:
            type: QuantityChange
          responses:
            200:
              body:
                type: BasketItem
            400:
              body:
                type: Error
            404:
              description: The basket or this line does not exist.
              body:
                type: Error
            409:
              description: Not enough stock for the new quantity.
              body:
                type: Error
        delete:
          description: Remove a product from the basket.
          responses:
            204:
              description: The line was removed.
            404:
              description: The basket or this line does not exist.
              body:
                type: Error
`,
  keyPoints: [
    'Give each outcome its own status, so the front end can react without reading the message text.',
    'The request type and the response type differ: the caller sends sku and quantity, the API adds prices.',
    'A named Quantity type keeps the 1 to 10 rule the same in every place that uses it.',
    'Removal is a delete with 204. Using quantity 0 to remove an item hides a delete inside a patch.',
    'One Error type with a code enum lets every client branch on the same few codes.',
  ],
  solution: `
The design splits the input from the output. \`NewItem\` holds only what the shopper chooses. \`BasketItem\` adds \`unitPrice\` and \`lineTotal\`, which the API works out from the price list, so a caller can never send its own price.

\`QuantityChange\` has only \`quantity\`, because the SKU is already in the URL. Its range starts at 1. A quantity of 0 would be a second way to delete, and the API would need extra rules to tell the two apart.

The statuses each mean one thing. 201 and \`Location\` say a new line exists. 200 on \`patch\` returns the changed line with its new total. 204 on \`delete\` has nothing to return. 400 is a bad body, 404 is a missing basket or line, and 409 with \`OUT_OF_STOCK\` is the case where the request is fine but the shelf is empty.
`,
  followUps: [
    {
      q: 'What should POST do if the SKU is already in the basket?',
      a: 'Pick one rule and document it. Either add to the existing quantity and return 200, or return 409 and ask the caller to use PATCH.',
    },
    {
      q: 'Why use PATCH and not PUT for the quantity change?',
      a: 'PUT replaces the whole resource, so the caller would send sku and prices too. PATCH changes only the fields sent, which here is the quantity.',
    },
    {
      q: 'Is 409 the only fair status for no stock?',
      a: 'Some teams use 422 for business rule failures. 409 fits because the request conflicts with the current stock level, and the code OUT_OF_STOCK removes any doubt.',
    },
    {
      q: 'Why is the SKU a string when it holds only digits?',
      a: 'SKUs can start with 0, and an integer would drop that digit. An id is not a number you do sums with.',
    },
  ],
}
