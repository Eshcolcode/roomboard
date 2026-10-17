// The real property and room details (no guest data). Every fact here comes from Donald or from a source listed
// in docs/PROPERTY-DATA.md. Anything not found is left out and listed in `todo` ("details to come"), never guessed.
import type { Bath, Photo, Property, Room, Unit } from './core';

const ph = (name: string, alt: string): Photo => ({ src: `img/${name}.webp`, alt });
const AREA = 'Breasclete, Isle of Lewis';

export const PROPERTIES: Property[] = [
  {
    id: 'p-lr',
    name: 'Loch Roag Guest House',
    short: 'Loch Roag',
    contracted: true,
    checkout: '10:00',
    checkin: '15:00',
    area: AREA,
    address: '22A Breasclete, Isle of Lewis HS2 9EF',
    blurb:
      'Family-run guest house overlooking Loch Roag, close to the Callanish Standing Stones. 9 bedrooms: Rooms 1–5 upstairs and 6–9 downstairs, with two kitchens and a large games room and lounge. Most bedrooms look across Loch Roag towards Callanish and the hills of Uig and Harris.',
    features: ['9 bedrooms', 'Two kitchens', 'Large games room & lounge', 'Free parking', 'Free Wi-Fi'],
    website: 'https://lochroag.com/',
    todo: ['Photos', 'Bed sizes per room'],
  },
  {
    id: 'p-es',
    name: 'Eshcol Worker Accommodation',
    short: 'Eshcol',
    contracted: true,
    checkout: '10:00',
    checkin: '15:00',
    area: AREA,
    address: 'Formerly Eshcol Guest House, 21 Breasclete, Isle of Lewis HS2 9ED',
    blurb:
      'A newly renovated 10-bedroom property for worker stays: private rooms, modern shower rooms, useful shared spaces and a separate downstairs flat with its own kitchen.',
    photo: 'img/eshcol-exterior.webp',
    photos: [
      ph('eshcol-exterior', 'Eshcol from outside, with the landscape around it'),
      ph('eshcol-kitchen', 'Shared kitchen and dining area'),
      ph('eshcol-lounge', 'Lounge'),
      ph('eshcol-games', 'Games room with pool table'),
      ph('eshcol-deck', 'Outdoor deck seating'),
      ph('eshcol-flat-kitchen', 'Downstairs flat kitchen'),
      ph('eshcol-entrance', 'Entrance'),
    ],
    features: [
      'Parking',
      'High-speed Wi-Fi',
      'Laundry',
      'Shared kitchen',
      'Lounge',
      'Games room',
      'Outdoor deck',
      'Flat with its own kitchen',
    ],
    mapUrl: 'https://maps.app.goo.gl/mvJ8TRz1fuh4FGsX9',
    credit: "Photos and room details: Donald's Eshcol share page (July 2026)",
    todo: ['Confirm the street address (from an old directory listing)', 'Bed sizes per room'],
  },
  {
    id: 'p-pod1',
    brand: 'Hebridean Holiday Cabins',
    name: 'Uig View pod',
    short: 'Uig View',
    contracted: false,
    checkout: '10:00',
    checkin: '16:00',
    area: AREA,
    address: '2A Breasclete, Isle of Lewis HS2 9ED',
    blurb:
      'Self-catering pod in an elevated spot in Breasclete, with views of the mountains of Lewis and Harris. Double bed and a pull-out sofa bed, en-suite with a powerful electric shower, a kitchenette and a dining table for four.',
    beds: '1 bedroom · double bed + sofa bed',
    sleeps: '2 adults + 2 children',
    photo: 'img/pod-exterior.webp',
    photos: [
      ph('pod-exterior', 'A Hebridean Holiday Cabins pod'),
      ph('pod-inside', 'Inside the pod: sofa, bed and kitchenette'),
      ph('pod-bed', 'Double bed'),
      ph('pod-kitchen', 'Kitchenette and dining table'),
      ph('pod-shower', 'En-suite shower room'),
      ph('pod-view', 'View from the pod door'),
    ],
    features: ['En-suite shower', 'Kitchenette', 'Free Wi-Fi', 'Off-road parking', 'TV', 'Decking', 'Linen & towels'],
    website: 'https://hebrideanholidaycabins.co.uk/accommodation/',
    credit: 'Photos and details: hebrideanholidaycabins.co.uk (photos may show either pod)',
    todo: ['Which pod is Pod 1 and which is Pod 2', 'Photos of this pod only'],
  },
  {
    id: 'p-pod2',
    brand: 'Hebridean Holiday Cabins',
    name: 'Harris View pod',
    short: 'Harris View',
    contracted: false,
    checkout: '10:00',
    checkin: '16:00',
    area: AREA,
    address: '2A Breasclete, Isle of Lewis HS2 9ED',
    blurb:
      'The second self-catering pod, beside Uig View. Double bed and a pull-out sofa bed, en-suite with a powerful electric shower, a kitchenette and a dining table for four.',
    beds: '1 bedroom · double bed + sofa bed',
    sleeps: '2 adults + 2 children',
    photo: 'img/pod-inside.webp',
    photos: [
      ph('pod-inside', 'Inside the pod: sofa, bed and kitchenette'),
      ph('pod-exterior', 'A Hebridean Holiday Cabins pod'),
      ph('pod-bed', 'Double bed'),
      ph('pod-kitchen', 'Kitchenette and dining table'),
      ph('pod-shower', 'En-suite shower room'),
    ],
    features: ['En-suite shower', 'Kitchenette', 'Free Wi-Fi', 'Off-road parking', 'TV', 'Decking', 'Linen & towels'],
    website: 'https://hebrideanholidaycabins.co.uk/accommodation/',
    credit: 'Photos and details: hebrideanholidaycabins.co.uk (photos may show either pod)',
    todo: ['Which pod is Pod 1 and which is Pod 2', 'Photos of this pod only'],
  },
  {
    id: 'p-lodge',
    name: 'The Lodge',
    short: 'Lodge',
    contracted: false,
    area: AREA,
    address: '',
    blurb: '2-bedroom lodge, both bedrooms ensuite.',
    beds: '2 bedrooms · both ensuite',
    features: ['2 ensuite bedrooms'],
    todo: ['Name and address', 'Description', 'Photos', 'Kitchen and other facilities', 'Check-in and check-out times'],
  },
  {
    id: 'p-cottage',
    name: 'Abhainn Cottage',
    short: 'Cottage',
    contracted: false,
    area: AREA,
    address: 'Breasclete, Isle of Lewis HS2 9ED',
    blurb:
      'Completely renovated cottage with a garden and decking overlooking the river. Marketed as 2 bedrooms plus an office: a king-size bedroom with an en-suite spa bathroom (spa bath, rain shower and infrared sauna), a double bedroom with an en-suite shower room, and a third room with a sofa bed and desk that is reached through another room. Fully equipped kitchen and dining room, and a lounge with an open peat fire.',
    beds: '2 bedrooms + office (sofa bed)',
    sleeps: '6',
    photo: 'img/cottage-exterior.webp',
    photos: [
      ph('cottage-exterior', 'Abhainn Cottage from the garden'),
      ph('cottage-lounge', 'Lounge with open fire'),
      ph('cottage-kitchen', 'Kitchen and dining room'),
      ph('cottage-bed1', 'King-size bedroom'),
      ph('cottage-spa', 'Spa bathroom'),
      ph('cottage-bed2', 'Double bedroom'),
      ph('cottage-room3', 'Third room with sofa bed and desk'),
    ],
    features: ['2 ensuite bedrooms', 'Office / 3rd room', 'Full kitchen', 'Open fire', 'Wi-Fi', 'Garden & decking'],
    website: 'https://luxuryhebrideancottage.co.uk/self_catering.php',
    credit: 'Photos and details: luxuryhebrideancottage.co.uk',
    todo: ['Confirm this is the 3-bed cottage', 'Check-in and check-out times'],
  },
  {
    id: 'p-monadh',
    brand: 'Whitefalls Spa Lodges',
    name: 'Monadh',
    short: 'Monadh',
    contracted: false,
    checkout: '10:00',
    checkin: '16:00',
    area: AREA,
    address: 'Whitefalls, Breasclete, Isle of Lewis HS2 9ED',
    blurb:
      'One of the two Whitefalls lodges, with its own private indoor spa suite (double-ended whirlpool bath, infrared sauna and monsoon shower). Open-plan living space with high ceilings and picture windows, a fully equipped kitchen and dining area, and a utility area with a washer/dryer.',
    beds: 'Super-king bed (can be set up as twin)',
    sleeps: 'Up to 4',
    photo: 'img/whitefalls-exterior.webp',
    photos: [
      ph('whitefalls-exterior', 'The Whitefalls lodges'),
      ph('whitefalls-lounge', 'Living room with big windows'),
      ph('whitefalls-kitchen', 'Open-plan kitchen and dining area'),
      ph('whitefalls-bedroom', 'Bedroom'),
      ph('whitefalls-spa', 'Private spa suite'),
    ],
    features: ['Private spa suite', 'Full kitchen', 'Washer/dryer', 'Wi-Fi', 'Parking'],
    website: 'https://www.whitefalls.co.uk/book-now/',
    credit: 'Photos and details: whitefalls.co.uk (photos may show either lodge)',
    todo: ['Your description for worker stays', 'Photos of Monadh only'],
  },
];

export const UNITS: Unit[] = [
  { id: 'un-lr-up', propertyId: 'p-lr', name: 'Upstairs · Rooms 1–5' },
  { id: 'un-lr-down', propertyId: 'p-lr', name: 'Downstairs · Rooms 6–9' },
  { id: 'un-es-main', propertyId: 'p-es', name: 'Main house · Rooms 1–7' },
  { id: 'un-es-flat', propertyId: 'p-es', name: 'Downstairs flat · Rooms 8–10' },
  { id: 'un-pod1', propertyId: 'p-pod1', name: 'Uig View pod' },
  { id: 'un-pod2', propertyId: 'p-pod2', name: 'Harris View pod' },
  { id: 'un-lodge', propertyId: 'p-lodge', name: 'The Lodge' },
  { id: 'un-cottage', propertyId: 'p-cottage', name: 'Abhainn Cottage' },
  { id: 'un-monadh', propertyId: 'p-monadh', name: 'Monadh' },
];

// Eshcol room lines from the share page; Loch Roag from Donald.
const ES_DESC = [
  'Private bedroom with an allocated shower room, accessed separately.',
  'Furnished room with its own ensuite shower room.',
  'Freshly finished bedroom with an ensuite.',
  'Private room with a modern ensuite shower room.',
  'Room with an assigned private shower room.',
  'Modern room with its own ensuite shower room.',
  'Bright bedroom with a compact ensuite shower room.',
  'Flat bedroom sharing a private shower room with Room 9.',
  'Flat bedroom sharing the same private shower room with Room 8.',
  'Flat bedroom with its own ensuite shower room.',
];
const ES_BATH: Bath[] = [
  'private',
  'ensuite',
  'ensuite',
  'ensuite',
  'private',
  'ensuite',
  'ensuite',
  'shared',
  'shared',
  'ensuite',
];

export const ROOMS: Room[] = [
  ...Array.from({ length: 9 }, (_, k): Room => {
    const i = k + 1;
    const bath: Bath = i === 2 || i === 3 ? 'shared' : i === 8 ? 'private' : 'ensuite';
    return {
      id: `lr-${i}`,
      propertyId: 'p-lr',
      unitId: i <= 5 ? 'un-lr-up' : 'un-lr-down',
      floor: i <= 5 ? 'Upstairs' : 'Downstairs',
      name: `Room ${i}`,
      bath,
      note:
        bath === 'shared'
          ? `Shares a shower room with Room ${i === 2 ? 3 : 2}`
          : bath === 'private'
            ? 'Private shower room (not ensuite)'
            : 'Ensuite',
    };
  }),
  ...Array.from({ length: 10 }, (_, k): Room => {
    const i = k + 1;
    const bath = ES_BATH[k];
    return {
      id: `es-${i}`,
      propertyId: 'p-es',
      floor: i <= 7 ? 'Main house' : 'Downstairs flat',
      unitId: i <= 7 ? 'un-es-main' : 'un-es-flat',
      name: `Room ${i}`,
      bath,
      photo: `img/eshcol-room${i}.webp`,
      desc: ES_DESC[k],
      photos: [
        ph(`eshcol-room${i}`, `Room ${i} bedroom`),
        i === 8 || i === 9
          ? ph('eshcol-flat-shower', 'Shower room shared by Rooms 8 and 9')
          : ph(`eshcol-room${i}-bath`, `Room ${i} ${bath === 'ensuite' ? 'ensuite' : 'private shower room'}`),
      ],
      note:
        bath === 'private'
          ? 'Allocated private shower room, accessed separately'
          : bath === 'shared'
            ? `Shares flat shower room with Room ${i === 8 ? 9 : 8}`
            : undefined,
    };
  }),
  // Each extra property is booked whole, as one unit.
  ...(
    [
      ['x-pod1', 'p-pod1', 'un-pod1', 'Whole pod'],
      ['x-pod2', 'p-pod2', 'un-pod2', 'Whole pod'],
      ['x-lodge', 'p-lodge', 'un-lodge', 'Whole lodge'],
      ['x-cottage', 'p-cottage', 'un-cottage', 'Whole cottage'],
      ['x-monadh', 'p-monadh', 'un-monadh', 'Whole lodge'],
    ] as const
  ).map(([id, propertyId, unitId, name]): Room => ({ id, propertyId, unitId, name, bath: 'ensuite' })),
];
