export default {
  id: 'dw-154',
  category: 'dataweave',
  title: 'Load Parcels onto Pallets with First Fit Decreasing',
  level: 'EXPERT',
  tags: ['bin-packing', 'reduce', 'accumulator', 'orderBy', 'filter', 'logistics', 'interview-classic', 'json'],
  estMinutes: 35,
  description: `
Kingsbridge Distribution sends parcels to its regional depots on pallets. Each pallet may carry at most \`palletMaxKg\`. The warehouse system asks the integration for a loading plan before the trucks are booked, and fewer pallets means fewer trucks.

Use the **first fit decreasing** rule:

1. Leave out any parcel heavier than \`palletMaxKg\` and list it in \`tooHeavy\`, in input order. It must go by freight.
2. Sort the other parcels from heaviest to lightest. No two parcels in a feed weigh the same.
3. Take each parcel in that order. Put it on the **first** pallet, in the order the pallets were opened, that still has room. A pallet has room when its load plus the parcel is at most \`palletMaxKg\`.
4. If no pallet has room, open a new one.

Output:

- \`pallets\`: in the order they were opened, each with \`pallet\` (1, 2, 3 and so on), \`parcels\` (ids in the order loaded), \`kg\` and \`spareKg\`
- \`tooHeavy\`: the ids left out
`,
  inputs: [
    {
      name: 'payload',
      mime: 'application/json',
      content: `{
  "palletMaxKg": 100,
  "parcels": [
    { "id": "PCL-01", "kg": 45 },
    { "id": "PCL-02", "kg": 70 },
    { "id": "PCL-03", "kg": 20 },
    { "id": "PCL-04", "kg": 35 },
    { "id": "PCL-05", "kg": 25 },
    { "id": "PCL-06", "kg": 120 },
    { "id": "PCL-07", "kg": 10 }
  ]
}`,
    },
  ],
  expected: {
    mime: 'application/json',
    content: `{
  "pallets": [
    { "pallet": 1, "parcels": ["PCL-02", "PCL-05"], "kg": 95, "spareKg": 5 },
    { "pallet": 2, "parcels": ["PCL-01", "PCL-04", "PCL-03"], "kg": 100, "spareKg": 0 },
    { "pallet": 3, "parcels": ["PCL-07"], "kg": 10, "spareKg": 90 }
  ],
  "tooHeavy": ["PCL-06"]
}`,
  },
  starterCode: `%dw 2.0
output application/json
var maxKg = payload.palletMaxKg
---
{
  pallets: [{ pallet: 1, parcels: payload.parcels map $.id, kg: sum(payload.parcels map $.kg), spareKg: 0 }],
  tooHeavy: []
}
`,
  hints: [
    'Split the parcels first: those over the limit go to `tooHeavy`, the rest are sorted with `orderBy -$.kg`.',
    'Use `reduce` with a list of pallets as the accumulator, starting from `[]`. Each pallet only needs `parcels` and `kg` while you build.',
    'To find the first pallet with room, pair each pallet with its index and filter: `(acc map (p, i) -> { i: i, kg: p.kg }) filter ($.kg + parcel.kg <= maxKg)`.',
    'If that list is empty, add a new pallet at the end. Otherwise rebuild the list with `map (p, i)` and change only the pallet at the first index.',
    'Add `pallet` and `spareKg` at the end, once every parcel is placed.',
  ],
  solution: `%dw 2.0
output application/json
var maxKg = payload.palletMaxKg
var fitting = payload.parcels filter ($.kg <= maxKg)
var tooHeavy = payload.parcels filter ($.kg > maxKg)

fun place(pallets, parcel) = do {
  var withRoom = (pallets map (p, i) -> { i: i, kg: p.kg }) filter ($.kg + parcel.kg <= maxKg)
  ---
  if (isEmpty(withRoom)) pallets ++ [{ parcels: [parcel.id], kg: parcel.kg }]
  else pallets map (p, i) ->
    if (i == withRoom[0].i) { parcels: p.parcels ++ [parcel.id], kg: p.kg + parcel.kg }
    else p
}

var pallets = (fitting orderBy -$.kg) reduce ((parcel, acc = []) -> place(acc, parcel))
---
{
  pallets: pallets map (p, i) -> {
    pallet: i + 1,
    parcels: p.parcels,
    kg: p.kg,
    spareKg: maxKg - p.kg
  },
  tooHeavy: tooHeavy map $.id
}`,
  explanation: `
**Bin packing.** Fitting items into the fewest bins is a classic hard problem: trying every arrangement takes far too long for a real feed. First fit decreasing is a well known shortcut that gives a good plan quickly, which is why it often comes up in interviews.

**Why heaviest first.** Big parcels are the hardest to place. Putting them down first leaves the small ones to fill the gaps. In the sample, PCL-05 at 25 kg fills pallet 1 to 95 kg, and PCL-03 at 20 kg fills pallet 2 to exactly 100 kg.

**reduce builds the pallets.** The accumulator is the list of pallets so far. \`place\` adds one parcel and returns the new list. DataWeave values cannot be changed in place, so the list is rebuilt with \`map\`, and only the chosen pallet gets a new value.

**The first pallet with room.** Pairing each pallet with its index and filtering keeps the order, so \`withRoom[0]\` is the earliest pallet that fits. "At most the limit" uses \`<=\`, so a pallet can be loaded to exactly 100 kg.

**Too heavy is not an error.** A parcel over the limit can never fit, and opening a pallet for it would break the rule. Listing it apart lets the warehouse book freight for it.
`,
  tests: [
    {
      name: 'Everything fits on one pallet',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "palletMaxKg": 500, "parcels": [{ "id": "A1", "kg": 120 }, { "id": "A2", "kg": 300 }, { "id": "A3", "kg": 80 }] }' }],
      expected: '{ "pallets": [{ "pallet": 1, "parcels": ["A2", "A1", "A3"], "kg": 500, "spareKg": 0 }], "tooHeavy": [] }',
    },
    {
      name: 'A light parcel goes back to an earlier pallet',
      inputs: [
        {
          name: 'payload',
          mime: 'application/json',
          content: '{ "palletMaxKg": 50, "parcels": [{ "id": "B1", "kg": 30 }, { "id": "B2", "kg": 40 }, { "id": "B3", "kg": 25 }, { "id": "B4", "kg": 15 }] }',
        },
      ],
      expected:
        '{ "pallets": [{ "pallet": 1, "parcels": ["B2"], "kg": 40, "spareKg": 10 }, { "pallet": 2, "parcels": ["B1", "B4"], "kg": 45, "spareKg": 5 }, { "pallet": 3, "parcels": ["B3"], "kg": 25, "spareKg": 25 }], "tooHeavy": [] }',
    },
    {
      name: 'No parcels',
      inputs: [{ name: 'payload', mime: 'application/json', content: '{ "palletMaxKg": 100, "parcels": [] }' }],
      expected: '{ "pallets": [], "tooHeavy": [] }',
    },
  ],
  followUps: [
    {
      q: 'Does first fit decreasing always find the fewest pallets?',
      a: 'No. It is a shortcut and can use a few more pallets than the best plan in some cases. It is fast and usually close, which is why it is used when a perfect answer would take too long.',
    },
    {
      q: 'Pallets also have a height limit. What changes?',
      a: 'Each pallet tracks two loads, weight and height, and a parcel fits only when both stay within their limits. The sort can use the larger share of either limit.',
    },
    {
      q: 'Two parcels can weigh the same. How do you keep the plan the same on every run?',
      a: 'Sort with a second key, such as the id, so ties always come out in one order. Then the same feed always gives the same plan.',
    },
  ],
}
