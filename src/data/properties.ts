// The real property and room details (no guest data). Every fact here comes from Donald or from a source listed
// in docs/PROPERTY-DATA.md. Anything not found is left out and listed in `todo` ("details to come"), never guessed.
import type { Bath, Photo, Property, Room, Unit } from './core';

const ph = (name: string, alt: string): Photo => ({ src: `img/${name}.webp`, alt });
const AREA = 'Breasclete, Isle of Lewis';
// Public booking pages from Donald (18 Oct 2026), tracking/date query strings removed. Not iCal feeds.
const POD_BOOKING =
  'https://booking-directly.com/widgets/AFdwunTlQtRXLGG59glXBg6bzyX2zGOL7uVYq3BXiXjQVNUL0wvLZtXa9p9Fd/properties';

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
    photo: 'img/lr-room3.webp',
    photos: [
      ph('lr-room3', 'Room 3, with windows looking out over Loch Roag'),
      ph('lr-room1', 'Room 1'),
      ph('lr-room6-7', 'Downstairs bedroom (Rooms 6 and 7)'),
      ph('lr-room8', 'Room 8'),
      ph('lr-room9-bath', 'Room 9 ensuite shower'),
    ],
    website: 'https://lochroag.com/',
    credit: "Room photos: Donald's Google Photos albums (October 2026)",
    todo: ['Photos of Room 4', 'Outside and shared-space photos (kitchens, games room, lounge)'],
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
  },
  // Pods: Donald, 18 Oct 2026: the pod once called "Pod 1" is Harris View, the other is Uig View. Shown as Harris
  // and Uig. The website photos may show either pod (they are the same design).
  {
    id: 'p-pod1',
    brand: 'Hebridean Holiday Cabins',
    name: 'Harris',
    short: 'Harris',
    contracted: false,
    checkout: '10:00',
    checkin: '16:00',
    area: AREA,
    address: '2A Breasclete, Isle of Lewis HS2 9ED',
    blurb:
      'Harris View: a self-catering pod in an elevated spot in Breasclete, with views of the mountains of Lewis and Harris. One bedroom and a pull-out sofa bed, an en-suite with a powerful electric shower, a kitchenette and a dining table for four.',
    beds: '1 bedroom + sofa bed',
    sleeps: '2 adults + 2 children',
    photo: 'img/pod-exterior.webp',
    photos: [
      ph('pod-exterior', 'A Hebridean Holiday Cabins pod'),
      ph('pod-inside', 'Inside the pod: sofa, bed and kitchenette'),
      ph('pod-bed', 'Bedroom'),
      ph('pod-kitchen', 'Kitchenette and dining table'),
      ph('pod-shower', 'En-suite shower room'),
      ph('pod-view', 'View from the pod door'),
    ],
    features: ['En-suite shower', 'Kitchenette', 'Free Wi-Fi', 'Off-road parking', 'TV', 'Decking', 'Linen & towels'],
    website: 'https://hebrideanholidaycabins.co.uk/accommodation/',
    bookingUrl: POD_BOOKING,
    credit:
      'Photos and details: hebrideanholidaycabins.co.uk (the two pods are the same design; photos may show either)',
  },
  {
    id: 'p-pod2',
    brand: 'Hebridean Holiday Cabins',
    name: 'Uig',
    short: 'Uig',
    contracted: false,
    checkout: '10:00',
    checkin: '16:00',
    area: AREA,
    address: '2A Breasclete, Isle of Lewis HS2 9ED',
    blurb:
      'Uig View: the second self-catering pod, beside Harris. One bedroom and a pull-out sofa bed, an en-suite with a powerful electric shower, a kitchenette and a dining table for four.',
    beds: '1 bedroom + sofa bed',
    sleeps: '2 adults + 2 children',
    photo: 'img/pod-inside.webp',
    photos: [
      ph('pod-inside', 'Inside the pod: sofa, bed and kitchenette'),
      ph('pod-exterior', 'A Hebridean Holiday Cabins pod'),
      ph('pod-bed', 'Bedroom'),
      ph('pod-kitchen', 'Kitchenette and dining table'),
      ph('pod-shower', 'En-suite shower room'),
    ],
    features: ['En-suite shower', 'Kitchenette', 'Free Wi-Fi', 'Off-road parking', 'TV', 'Decking', 'Linen & towels'],
    website: 'https://hebrideanholidaycabins.co.uk/accommodation/',
    bookingUrl: POD_BOOKING,
    credit:
      'Photos and details: hebrideanholidaycabins.co.uk (the two pods are the same design; photos may show either)',
  },
  // Donald, 18 Oct 2026: the 3-bedroom cottage is Abhainn Cottage.
  {
    id: 'p-cottage',
    name: 'Abhainn Cottage',
    short: 'Abhainn Cottage',
    contracted: false,
    area: AREA,
    address: 'Breasclete, Isle of Lewis HS2 9ED',
    blurb:
      'Completely renovated three-bedroom cottage with a garden and decking overlooking the river. Bedroom 1 has an en-suite spa bathroom (spa bath, rain shower and infrared sauna), Bedroom 2 has an en-suite shower room, and the third room has a sofa bed and a desk and is reached through another room. Fully equipped kitchen and dining room, and a lounge with an open peat fire.',
    beds: '3 bedrooms',
    sleeps: '6',
    photo: 'img/cottage-exterior.webp',
    photos: [
      ph('cottage-exterior', 'Abhainn Cottage from the garden'),
      ph('cottage-lounge', 'Lounge with open fire'),
      ph('cottage-kitchen', 'Kitchen and dining room'),
      ph('cottage-bed1', 'Bedroom 1'),
      ph('cottage-spa', 'Spa bathroom'),
      ph('cottage-bed2', 'Bedroom 2'),
      ph('cottage-room3', 'Third room with sofa bed and desk'),
    ],
    features: ['2 ensuite bedrooms', 'Third room with desk', 'Full kitchen', 'Open fire', 'Wi-Fi', 'Garden & decking'],
    website: 'https://luxuryhebrideancottage.co.uk/self_catering.php',
    bookingUrl:
      'https://booking-directly.com/widgets/Zi8g2tHyjcHeV1rY7shfws1inCMurecf736nZuRt2Q5ApN9GLY9lBQDGnSivz/properties/17285/unit-selection',
    credit: 'Photos and details: luxuryhebrideancottage.co.uk',
    todo: ['Check-in and check-out times'],
  },
  // Donald, 18 Oct 2026: "The Lodge" is Monadh, the only Whitefalls lodge offered. Description is Donald's, word
  // for word. Website photos may be used.
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
      'Monadh is a self-catering lodge at Whitefalls Spa Lodges in Breasclete on the Isle of Lewis. It has an open-plan living and dining area, a fully equipped kitchen, and a private indoor spa suite with a RiverBath whirlpool bath, infrared sauna and monsoon shower.',
    sleeps: 'up to 4',
    photo: 'img/whitefalls-exterior.webp',
    photos: [
      ph('whitefalls-exterior', 'Monadh from outside'),
      ph('whitefalls-lounge', 'Living room with big windows'),
      ph('whitefalls-kitchen', 'Open-plan kitchen and dining area'),
      ph('whitefalls-bedroom', 'Bedroom'),
      ph('whitefalls-spa', 'Private spa suite'),
    ],
    features: ['Private spa suite', 'Full kitchen', 'Washer/dryer', 'Wi-Fi', 'Parking'],
    website: 'https://www.whitefalls.co.uk/luxury-selfcatering-hebrides/',
    bookingUrl: 'https://secure.supercontrol.co.uk/availability/availability_search.asp?ownerID=859&siteID=10573',
    credit: 'Photos: whitefalls.co.uk',
  },
];

export const UNITS: Unit[] = [
  { id: 'un-lr-up', propertyId: 'p-lr', name: 'Upstairs · Rooms 1–5' },
  { id: 'un-lr-down', propertyId: 'p-lr', name: 'Downstairs · Rooms 6–9' },
  { id: 'un-es-main', propertyId: 'p-es', name: 'Main house · Rooms 1–7' },
  { id: 'un-es-flat', propertyId: 'p-es', name: 'Downstairs flat · Rooms 8–10' },
  { id: 'un-pod1', propertyId: 'p-pod1', name: 'Harris' },
  { id: 'un-pod2', propertyId: 'p-pod2', name: 'Uig' },
  { id: 'un-cottage', propertyId: 'p-cottage', name: 'Abhainn Cottage' },
  { id: 'un-monadh', propertyId: 'p-monadh', name: 'Monadh' },
];

// Loch Roag room photos from Donald's Google Photos room albums (18 Oct 2026), assigned by album (folder) name.
// Two photos sit in two albums each and are kept in both rooms, as supplied: the Rooms 2 & 3 shower room and a
// bedroom photo in the Room 6 and Room 7 albums. There is no Room 4 album yet.
const LR_PHOTOS: Record<number, Photo[]> = {
  1: [ph('lr-room1', 'Room 1 bedroom')],
  2: [ph('lr-room2', 'Room 2 bedroom'), ph('lr-room2-3-shower', 'Shower room shared by Rooms 2 and 3')],
  3: [
    ph('lr-room3', 'Room 3 bedroom'),
    ph('lr-room3-b', 'Room 3 bedroom, another view'),
    ph('lr-room2-3-shower', 'Shower room shared by Rooms 2 and 3'),
  ],
  5: [ph('lr-room5', 'Room 5 bedroom')],
  6: [ph('lr-room6-7', 'Room 6 bedroom')],
  7: [
    ph('lr-room6-7', 'Room 7 bedroom'),
    ph('lr-room7', 'Room 7 bedroom, another view'),
    ph('lr-room7-bath', 'Room 7 ensuite'),
  ],
  8: [
    ph('lr-room8', 'Room 8 bedroom'),
    ph('lr-room8-b', 'Room 8 bedroom, another view'),
    ph('lr-room8-bath', 'Room 8 private bathroom'),
  ],
  9: [ph('lr-room9', 'Room 9 bedroom'), ph('lr-room9-bath', 'Room 9 ensuite')],
};

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
      ...(LR_PHOTOS[i] ? { photo: LR_PHOTOS[i][0].src, photos: LR_PHOTOS[i] } : {}),
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
      ['x-cottage', 'p-cottage', 'un-cottage', 'Whole cottage'],
      ['x-monadh', 'p-monadh', 'un-monadh', 'Whole lodge'],
    ] as const
  ).map(([id, propertyId, unitId, name]): Room => ({ id, propertyId, unitId, name, bath: 'ensuite' })),
];
