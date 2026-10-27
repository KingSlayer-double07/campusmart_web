// The demo marketplace's people, stores and listings (demo-seed.ts writes them). Made up, apart
// from the listing photos and product names, which are the ones the original app design used.
import {
  ListingCategory,
  ProductCondition,
} from '../../src/generated/prisma/enums';

// A reserved domain (RFC 2606): nothing sent to it can reach anyone, and it marks every demo row
export const DEMO_DOMAIN = 'demo.campusmart.test';

// Halls, faculties and gates at the University of Lagos, for delivery (decision DF3). Edit these
// for another school.
export const DEMO_PLACES = [
  'Moremi Hall',
  'Madam Kofo Hall',
  'Jaja Hall',
  'Honours Hall',
  'Fagunwa Hall',
  'Mariere Hall',
  'Faculty of Engineering',
  'Faculty of Arts',
  'Senate Building',
  'Main Library',
];

// ₦500 for dispatch to a campus place, set only when the school has no fee yet (decision C10)
export const DEMO_DELIVERY_FEE_KOBO = 50_000;

export interface DemoPerson {
  key: string;
  firstName: string;
  lastName: string;
  joinedDaysAgo: number;
}

export interface DemoStore extends DemoPerson {
  storeName: string;
  bio: string;
  pickupArea: string;
  pickupAddress: string;
  allowsPickup: boolean;
  isOnline: boolean;
  bank: { name: string; code: string; last4: string } | null;
  verified: boolean;
}

export const DEMO_SELLERS: DemoStore[] = [
  {
    key: 'tolu',
    firstName: 'Tolulope',
    lastName: 'Adeyemi',
    joinedDaysAgo: 52,
    storeName: 'TrendHUB NG',
    bio: 'Streetwear and thrift finds for campus. New drops every Friday.',
    pickupArea: 'Moremi Hall',
    pickupAddress: 'Room 214, Block C, Moremi Hall',
    allowsPickup: true,
    isOnline: true,
    bank: { name: 'GTBank', code: '058', last4: '4821' },
    verified: true,
  },
  {
    key: 'ada',
    firstName: 'Adaeze',
    lastName: 'Okafor',
    joinedDaysAgo: 48,
    storeName: 'Glow by Ada',
    bio: 'Skincare that works in Lagos heat. Patch-test advice on every order.',
    pickupArea: 'Madam Kofo Hall',
    pickupAddress: 'Room 9, Wing B, Madam Kofo Hall',
    allowsPickup: true,
    isOnline: true,
    bank: { name: 'Access Bank', code: '044', last4: '1937' },
    verified: true,
  },
  {
    key: 'chi',
    firstName: 'Chiamaka',
    lastName: 'Nwosu',
    joinedDaysAgo: 45,
    storeName: "Mama Chi's Kitchen",
    bio: 'Home-cooked meals and party packs. Orders before 2pm are ready by 6.',
    pickupArea: 'Faculty of Arts',
    pickupAddress: 'Behind the Faculty of Arts car park, green canopy',
    allowsPickup: true,
    isOnline: true,
    bank: { name: 'Kuda', code: '50211', last4: '6605' },
    verified: true,
  },
  {
    key: 'emeka',
    firstName: 'Emeka',
    lastName: 'Obi',
    joinedDaysAgo: 50,
    storeName: 'Gadget Plug',
    bio: 'Study tech and accessories, tested before they leave. Dispatch only.',
    pickupArea: 'Jaja Hall',
    pickupAddress: 'Room 112, Jaja Hall',
    allowsPickup: false,
    isOnline: false,
    bank: { name: 'Zenith Bank', code: '057', last4: '3390' },
    verified: true,
  },
  {
    key: 'fisayo',
    firstName: 'Fisayo',
    lastName: 'Bello',
    joinedDaysAgo: 40,
    storeName: 'Inkwell Studio',
    bio: 'Hand-made prints, planners and custom pieces by a Fine Arts student.',
    pickupArea: 'Honours Hall',
    pickupAddress: 'Room 33, Honours Hall',
    allowsPickup: true,
    isOnline: true,
    bank: { name: 'First Bank', code: '011', last4: '7714' },
    verified: true,
  },
  {
    key: 'kemi',
    firstName: 'Kemi',
    lastName: 'Lawal',
    joinedDaysAgo: 38,
    storeName: "Kemi's Campus Services",
    bio: 'Laundry, braids and design tutoring. Book a slot and I’ll confirm.',
    pickupArea: 'Fagunwa Hall',
    pickupAddress: 'Laundry room, ground floor, Fagunwa Hall',
    allowsPickup: true,
    isOnline: false,
    bank: { name: 'UBA', code: '033', last4: '2058' },
    verified: true,
  },
  // Joined two days ago: no ID sent yet, so the listing stays a draft (the publish gate)
  {
    key: 'dami',
    firstName: 'Damilola',
    lastName: 'Ojo',
    joinedDaysAgo: 2,
    storeName: 'Dami Thrift',
    bio: 'Thrifted denim, coming soon.',
    pickupArea: 'Mariere Hall',
    pickupAddress: 'Room 7, Mariere Hall',
    allowsPickup: true,
    isOnline: false,
    bank: null,
    verified: false,
  },
];

export const DEMO_RIDERS: DemoPerson[] = [
  { key: 'musa', firstName: 'Musa', lastName: 'Bello', joinedDaysAgo: 36 },
  { key: 'grace', firstName: 'Grace', lastName: 'Udoh', joinedDaysAgo: 33 },
  { key: 'segun', firstName: 'Segun', lastName: 'Adewale', joinedDaysAgo: 21 },
];

export const DEMO_BUYERS: (DemoPerson & { suspended?: string })[] = [
  { key: 'ifeoma', firstName: 'Ifeoma', lastName: 'Eze', joinedDaysAgo: 44 },
  { key: 'tunde', firstName: 'Tunde', lastName: 'Bakare', joinedDaysAgo: 41 },
  { key: 'zainab', firstName: 'Zainab', lastName: 'Yusuf', joinedDaysAgo: 39 },
  { key: 'david', firstName: 'David', lastName: 'John', joinedDaysAgo: 37 },
  { key: 'sarah', firstName: 'Sarah', lastName: 'Emeka', joinedDaysAgo: 34 },
  {
    key: 'chinedu',
    firstName: 'Chinedu',
    lastName: 'Okeke',
    joinedDaysAgo: 30,
  },
  {
    key: 'bisola',
    firstName: 'Bisola',
    lastName: 'Martins',
    joinedDaysAgo: 26,
  },
  { key: 'uche', firstName: 'Uche', lastName: 'Nnaji', joinedDaysAgo: 22 },
  {
    key: 'halima',
    firstName: 'Halima',
    lastName: 'Abubakar',
    joinedDaysAgo: 12,
  },
  {
    key: 'kunle',
    firstName: 'Kunle',
    lastName: 'Ogunleye',
    joinedDaysAgo: 28,
    suspended: 'Abusive messages to sellers after two orders',
  },
];

const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=800&auto=format&fit=crop&q=60`;

export interface DemoListing {
  key: string;
  seller: string;
  title: string;
  description: string;
  priceKobo: number;
  category: ListingCategory;
  condition: ProductCondition;
  photo: string;
  stock?: number; // without variants
  variants?: { label: string; stock: number; priceKobo?: number }[];
  // Live unless one of these; listedDaysAgo is when it went up
  state?: 'SOLDOUT' | 'ARCHIVED' | 'DRAFT' | 'REJECTED' | 'HELD';
  listedDaysAgo: number;
  reason?: string; // REJECTED: what the seller is told
  heldWords?: string[]; // HELD: the banned words found (Phase 9, M2)
}

const { FASHION, BEAUTY, FOOD, CREATIVE, TECH, SERVICES } = ListingCategory;
const { NEW, USED_LIKE_NEW, USED_GOOD } = ProductCondition;

export const DEMO_LISTINGS: DemoListing[] = [
  // TrendHUB NG
  {
    key: 'cargo',
    seller: 'tolu',
    title: 'UrbanFlex dark-blue Cargo Pants',
    description:
      'Comfort-fit cargo pants for long days on campus: breathable fabric, adjustable waist straps and six deep pockets.',
    priceKobo: 1_450_000,
    category: FASHION,
    condition: NEW,
    photo: photo('1624378439575-d8705ad7ae80'),
    variants: [
      { label: 'S', stock: 3 },
      { label: 'M', stock: 6 },
      { label: 'L', stock: 5 },
      { label: 'XL', stock: 2 },
    ],
    listedDaysAgo: 47,
  },
  {
    key: 'hoodie',
    seller: 'tolu',
    title: 'Unisex Oversized Campus Hoodie',
    description:
      'Heavy cotton hoodie with a relaxed fit. Warm enough for air-conditioned lecture halls, soft after many washes.',
    priceKobo: 1_200_000,
    category: FASHION,
    condition: NEW,
    photo: photo('1556821552-7f41c5d440db'),
    variants: [
      { label: 'S', stock: 4 },
      { label: 'M', stock: 7 },
      { label: 'L', stock: 6 },
      { label: 'XL', stock: 3, priceKobo: 1_300_000 },
    ],
    listedDaysAgo: 44,
  },
  {
    key: 'painted-jacket',
    seller: 'tolu',
    title: 'Hand-Painted Denim Jacket',
    description:
      'One of one: a thrifted denim jacket hand-painted with an Afrobeat-inspired design. Size M, worn twice.',
    priceKobo: 2_200_000,
    category: FASHION,
    condition: USED_LIKE_NEW,
    photo: photo('1551537482-f2075a1d41f2'),
    stock: 1,
    listedDaysAgo: 20,
  },
  {
    key: 'vintage-jacket',
    seller: 'tolu',
    title: 'Vintage Denim Jacket',
    description:
      'Classic washed denim from a vintage bale. Sold out for now; more coming in the next drop.',
    priceKobo: 1_800_000,
    category: FASHION,
    condition: USED_GOOD,
    photo: photo('1542272604-787c3835535d'),
    stock: 0,
    state: 'SOLDOUT',
    listedDaysAgo: 40,
  },
  {
    key: 'tees',
    seller: 'tolu',
    title: 'Thrift Bundle: 3 Graphic Tees',
    description:
      'Three thrifted graphic tees in good condition, sizes M to L. Designs vary; tell me your favourite colours.',
    priceKobo: 900_000,
    category: FASHION,
    condition: USED_GOOD,
    photo: photo('1558769132-cb1aea458c5e'),
    stock: 4,
    listedDaysAgo: 25,
  },
  // Glow by Ada
  {
    key: 'serum',
    seller: 'ada',
    title: 'Vitamin C Brightening Face Serum',
    description:
      '30 ml serum with 15% vitamin C for dark spots and dull skin. Use at night and wear sunscreen in the day.',
    priceKobo: 980_000,
    category: BEAUTY,
    condition: NEW,
    photo: photo('1620916566398-39f1143ab7be'),
    stock: 12,
    listedDaysAgo: 46,
  },
  {
    key: 'lip-balm',
    seller: 'ada',
    title: 'Hydrating Shea Butter Lip Balm Set',
    description:
      'Set of three shea butter lip balms: unscented, honey and mint. Made in small batches.',
    priceKobo: 220_000,
    category: BEAUTY,
    condition: NEW,
    photo: photo('1586495777744-4e6232bf0037'),
    stock: 25,
    listedDaysAgo: 42,
  },
  {
    key: 'matcha-kit',
    seller: 'ada',
    title: 'Matcha Green Tea Skincare Kit',
    description:
      'Cleanser, toner and moisturiser with green tea extract. Good for oily and combination skin.',
    priceKobo: 720_000,
    category: BEAUTY,
    condition: NEW,
    photo: photo('1556228578-8c89e6adf883'),
    stock: 8,
    listedDaysAgo: 30,
  },
  {
    key: 'eye-drops',
    seller: 'ada',
    title: 'Prescription Eye Drops (unopened)',
    description: 'Unopened box, expiry next year.',
    priceKobo: 350_000,
    category: BEAUTY,
    condition: NEW,
    photo: photo('1620916566398-39f1143ab7be'),
    stock: 2,
    state: 'REJECTED',
    reason: 'Medicines and prescription drugs aren’t allowed on CampusMart',
    listedDaysAgo: 9,
  },
  // Mama Chi's Kitchen
  {
    key: 'jollof',
    seller: 'chi',
    title: 'Jollof Rice & Chicken Meal Pack',
    description:
      'Smoky party jollof with a quarter chicken, plantain and coleslaw. Packed hot in a sealed container.',
    priceKobo: 250_000,
    category: FOOD,
    condition: NEW,
    photo: photo('1512058564366-18510be2db19'),
    stock: 30,
    listedDaysAgo: 43,
  },
  {
    key: 'small-chops',
    seller: 'chi',
    title: 'Small Chops Party Pack',
    description:
      'Puff-puff, samosa, spring rolls and peppered gizzard for four to six people. Order a day ahead for parties.',
    priceKobo: 650_000,
    category: FOOD,
    condition: NEW,
    photo: photo('1567620905732-2d1ec7ab7445'),
    stock: 10,
    listedDaysAgo: 41,
  },
  // Gadget Plug
  {
    key: 'headphones',
    seller: 'emeka',
    title: 'Noise-Cancelling Study Headphones',
    description:
      'Over-ear headphones with active noise cancelling and 30 hours of battery. Blocks out hostel noise for reading.',
    priceKobo: 3_200_000,
    category: TECH,
    condition: NEW,
    photo: photo('1618366712010-f4ae9c647dcb'),
    stock: 6,
    listedDaysAgo: 49,
  },
  {
    key: 'earbuds',
    seller: 'emeka',
    title: 'Wireless Bluetooth Earbuds',
    description:
      'Bluetooth 5.3 earbuds with a charging case and touch controls. Six hours per charge, 24 with the case.',
    priceKobo: 1_550_000,
    category: TECH,
    condition: NEW,
    photo: photo('1590658268037-6bf12165a8df'),
    variants: [
      { label: 'Black', stock: 5 },
      { label: 'White', stock: 4 },
    ],
    listedDaysAgo: 45,
  },
  {
    key: 'power-bank',
    seller: 'emeka',
    title: 'Portable Power Bank 20000mAh',
    description:
      'Charges a phone about four times. USB-C fast charging in and out, with a battery level display.',
    priceKobo: 1_350_000,
    category: TECH,
    condition: NEW,
    photo: photo('1609091839311-d5365f9ff1c5'),
    stock: 11,
    listedDaysAgo: 39,
  },
  {
    key: 'laptop-stand',
    seller: 'emeka',
    title: 'Foldable Aluminium Laptop Stand',
    description:
      'Raises your screen to eye level, folds flat into a bag. Fits laptops from 10 to 17 inches.',
    priceKobo: 870_000,
    category: TECH,
    condition: NEW,
    photo: photo('1527864550417-7fd91fc51a46'),
    stock: 7,
    listedDaysAgo: 33,
  },
  {
    key: 'calculator',
    seller: 'emeka',
    title: 'Scientific Graphing Calculator',
    description:
      'Graphing calculator approved for most engineering exams. Lightly used, with a new set of batteries.',
    priceKobo: 1_800_000,
    category: TECH,
    condition: USED_LIKE_NEW,
    photo: photo('1648201637025-1c77b9be3013'),
    stock: 3,
    listedDaysAgo: 27,
  },
  {
    key: 'fridge',
    seller: 'emeka',
    title: 'Compact Dorm Mini-Fridge',
    description:
      '50-litre fridge that runs quietly on hostel power. Used for one session; cleaned and tested.',
    priceKobo: 8_500_000,
    category: TECH,
    condition: USED_GOOD,
    photo: photo('1571175443880-49e1d25b2bc5'),
    stock: 2,
    listedDaysAgo: 24,
  },
  {
    key: 'usb-hub',
    seller: 'emeka',
    title: 'USB-C Hub 7-in-1',
    description:
      'HDMI, three USB ports, SD card reader and charging pass-through.',
    priceKobo: 1_100_000,
    category: TECH,
    condition: NEW,
    photo: photo('1519389950473-47ba0277781c'),
    stock: 3,
    state: 'ARCHIVED',
    listedDaysAgo: 48,
  },
  {
    key: 'smartwatch',
    seller: 'emeka',
    title: 'Replica Smartwatch Series 8',
    description:
      'Looks just like the original, with heart-rate tracking and notifications.',
    priceKobo: 2_500_000,
    category: TECH,
    condition: NEW,
    photo: photo('1519389950473-47ba0277781c'),
    stock: 4,
    state: 'HELD',
    heldWords: ['replica'],
    listedDaysAgo: 1,
  },
  // Inkwell Studio
  {
    key: 'tote',
    seller: 'fisayo',
    title: 'Custom Printed Tote Bag',
    description:
      'Heavy canvas tote with your name or a design of your choice, screen-printed by hand. Ready in three days.',
    priceKobo: 350_000,
    category: CREATIVE,
    condition: NEW,
    photo: photo('1553062407-98eeb64c6a62'),
    stock: 20,
    listedDaysAgo: 38,
  },
  {
    key: 'planner',
    seller: 'fisayo',
    title: 'Illustrated Study Planner Notebook',
    description:
      'A5 planner for a full semester: timetable pages, weekly spreads and exam countdowns, with original illustrations.',
    priceKobo: 420_000,
    category: CREATIVE,
    condition: NEW,
    photo: photo('1531346878377-a5be20888e57'),
    stock: 15,
    listedDaysAgo: 35,
  },
  {
    key: 'phone-case',
    seller: 'fisayo',
    title: 'Resin Art Phone Case (Custom)',
    description:
      'Hand-poured resin case with dried flowers or your initials. Tell me your design after ordering.',
    priceKobo: 550_000,
    category: CREATIVE,
    condition: NEW,
    photo: photo('1601784551446-20c9e07cdbdb'),
    variants: [
      { label: 'iPhone 13', stock: 2 },
      { label: 'Samsung A54', stock: 2 },
      { label: 'Tecno Spark 10', stock: 3, priceKobo: 500_000 },
    ],
    listedDaysAgo: 29,
  },
  // Kemi's Campus Services
  {
    key: 'laundry',
    seller: 'kemi',
    title: 'Campus Laundry & Ironing (per bag)',
    description:
      'Wash, dry, iron and fold for one laundry bag (about 15 items). Back to your hall within 48 hours.',
    priceKobo: 300_000,
    category: SERVICES,
    condition: NEW,
    photo: photo('1545173168-9f1947eebb7f'),
    stock: 40,
    listedDaysAgo: 36,
  },
  {
    key: 'braids',
    seller: 'kemi',
    title: 'Knotless Braids (mid-back)',
    description:
      'Mid-back knotless braids, extensions included. About five hours; weekends only. I’ll confirm your slot.',
    priceKobo: 800_000,
    category: SERVICES,
    condition: NEW,
    photo: photo('1605980776566-0486c3ac7617'),
    stock: 12,
    listedDaysAgo: 34,
  },
  {
    key: 'tutoring',
    seller: 'kemi',
    title: 'Graphic Design Tutoring (1-on-1, 2 hours)',
    description:
      'Canva and Figma basics, or help with a design assignment. In person at the Main Library, or online.',
    priceKobo: 500_000,
    category: SERVICES,
    condition: NEW,
    photo: photo('1561070791-2526d30994b5'),
    stock: 10,
    listedDaysAgo: 22,
  },
  // Dami Thrift: a draft until Damilola is verified
  {
    key: 'denim-shorts',
    seller: 'dami',
    title: 'Thrifted Denim Shorts',
    description: 'High-waisted denim shorts, sizes 8 to 12.',
    priceKobo: 450_000,
    category: FASHION,
    condition: USED_GOOD,
    photo: photo('1558769132-cb1aea458c5e'),
    stock: 5,
    state: 'DRAFT',
    listedDaysAgo: 1,
  },
];

// What buyers said, by rating
export const REVIEW_COMMENTS: Record<number, string[]> = {
  5: [
    'Exactly as pictured, and it came the same day. Will buy again.',
    'Super comfortable and the quality is better than I expected.',
    'The seller packed it well and replied quickly to my questions.',
    'Worth every naira. My roommate already wants one.',
    'Delivered to my hall on time. Smooth from start to finish.',
    'Lovely! Fits true to size.',
  ],
  4: [
    'Good quality. Delivery took a little longer than I hoped, but fine.',
    'Material is thick and durable. Would like more colours.',
    'Nice, does the job. Packaging could be better.',
    'Happy with it overall.',
  ],
  3: [
    'Okay for the price, but smaller than I expected.',
    'It works, but the colour is a bit different from the photo.',
  ],
  2: ['Took three days to reach me and the box was dented.'],
};

// Where each order stands. Times run from when the buyer placed it; see demo-seed.ts.
export type DemoStage =
  | 'COMPLETED' // handed over, released after 48 hours, paid out
  | 'PAYOUT_FAILED' // as COMPLETED, but the transfer failed (admins see it under Payouts)
  | 'IN_WINDOW' // handed over less than 48 hours ago: the money is still held
  | 'OPEN_JOB' // paid, waiting for a rider to accept
  | 'RIDER_ASSIGNED' // a rider accepted and is on the way to the store
  | 'WITH_RIDER' // the rider has the parcel
  | 'AWAITING_PICKUP' // paid, the buyer collects from the seller
  | 'DISPUTED' // the buyer reported a problem; an admin hasn't decided
  | 'DISPUTE_REFUNDED' // an admin refunded the buyer (the seller's fault)
  | 'DISPUTE_RELEASED' // an admin found no fault and paid the seller
  | 'SELLER_CANCELLED' // the seller cancelled after payment; the buyer was refunded
  | 'EXPIRED' // never paid
  | 'BUYER_CANCELLED'; // cancelled by the buyer before paying

export interface DemoOrder {
  buyer: string;
  placedHoursAgo: number;
  stage: DemoStage;
  to?: string; // the campus place, for dispatch
  address?: string; // off campus instead (no fee in the app, decision DF4)
  rider?: string;
  pay?: 'CARD' | 'BANK_TRANSFER';
  // Each store: how it's delivered, and [listing key, quantity, variant label]
  stores: {
    method: 'DISPATCH' | 'SELLER_PICKUP';
    lines: [string, number, string?][];
  }[];
  rating?: number | null; // the buyer's review; null for none (the default comes from a fixed sequence)
  dispute?: { reason: string; details: string; note: string };
  problem?: {
    by: 'buyer' | 'rider';
    reason: string;
    details: string;
    closedNote?: string;
  };
}

const D = 24; // hours in a day
const dispatch = (...lines: [string, number, string?][]) => ({
  method: 'DISPATCH' as const,
  lines,
});
const pickup = (...lines: [string, number, string?][]) => ({
  method: 'SELLER_PICKUP' as const,
  lines,
});

export const DEMO_ORDERS: DemoOrder[] = [
  {
    buyer: 'ifeoma',
    placedHoursAgo: 34 * D,
    stage: 'COMPLETED',
    to: 'Madam Kofo Hall',
    rider: 'musa',
    stores: [dispatch(['cargo', 1, 'M'])],
    rating: 5,
  },
  {
    buyer: 'tunde',
    placedHoursAgo: 33 * D,
    stage: 'COMPLETED',
    to: 'Jaja Hall',
    rider: 'musa',
    stores: [dispatch(['headphones', 1])],
    rating: 5,
  },
  {
    buyer: 'zainab',
    placedHoursAgo: 32 * D,
    stage: 'COMPLETED',
    pay: 'BANK_TRANSFER',
    stores: [pickup(['serum', 1])],
    rating: 4,
  },
  {
    buyer: 'david',
    placedHoursAgo: 31 * D,
    stage: 'COMPLETED',
    stores: [pickup(['jollof', 2])],
    rating: 5,
  },
  {
    buyer: 'sarah',
    placedHoursAgo: 30 * D,
    stage: 'COMPLETED',
    to: 'Fagunwa Hall',
    rider: 'grace',
    stores: [dispatch(['planner', 1], ['tote', 1])],
    rating: 5,
  },
  {
    buyer: 'chinedu',
    placedHoursAgo: 29 * D,
    stage: 'COMPLETED',
    to: 'Mariere Hall',
    rider: 'musa',
    stores: [dispatch(['power-bank', 1]), dispatch(['hoodie', 1, 'L'])],
    rating: 4,
  },
  {
    buyer: 'ifeoma',
    placedHoursAgo: 27 * D,
    stage: 'COMPLETED',
    stores: [pickup(['laundry', 2])],
    rating: 5,
  },
  {
    buyer: 'bisola',
    placedHoursAgo: 26 * D,
    stage: 'COMPLETED',
    to: 'Honours Hall',
    rider: 'grace',
    stores: [dispatch(['matcha-kit', 1])],
    rating: 4,
  },
  {
    buyer: 'kunle',
    placedHoursAgo: 25 * D,
    stage: 'COMPLETED',
    stores: [pickup(['small-chops', 1])],
    rating: 1,
  },
  {
    buyer: 'tunde',
    placedHoursAgo: 24 * D,
    stage: 'PAYOUT_FAILED',
    to: 'Jaja Hall',
    rider: 'musa',
    stores: [dispatch(['earbuds', 1, 'Black'])],
    rating: 5,
  },
  {
    buyer: 'zainab',
    placedHoursAgo: 23 * D,
    stage: 'COMPLETED',
    to: 'Moremi Hall',
    rider: 'grace',
    pay: 'BANK_TRANSFER',
    stores: [dispatch(['tees', 1])],
    rating: 3,
  },
  {
    buyer: 'david',
    placedHoursAgo: 22 * D,
    stage: 'DISPUTE_RELEASED',
    to: 'Faculty of Engineering',
    rider: 'musa',
    stores: [dispatch(['laptop-stand', 1])],
    rating: 4,
    dispute: {
      reason: 'MISSING_ITEMS',
      details: 'The screws for the hinge weren’t in the box.',
      note: 'The seller showed the screws are inside the foam insert; the buyer found them.',
    },
    problem: {
      by: 'rider',
      reason: 'BUYER_NO_SHOW',
      details: 'Waited 20 minutes at the Faculty of Engineering gate.',
      closedNote: 'Reached the buyer by phone; delivered 40 minutes later.',
    },
  },
  {
    buyer: 'sarah',
    placedHoursAgo: 21 * D,
    stage: 'COMPLETED',
    stores: [pickup(['braids', 1])],
    rating: 5,
  },
  {
    buyer: 'uche',
    placedHoursAgo: 20 * D,
    stage: 'COMPLETED',
    stores: [pickup(['jollof', 3])],
    rating: null,
  },
  {
    buyer: 'chinedu',
    placedHoursAgo: 19 * D,
    stage: 'COMPLETED',
    to: 'Mariere Hall',
    rider: 'segun',
    stores: [dispatch(['lip-balm', 2], ['serum', 1])],
    rating: 5,
  },
  {
    buyer: 'ifeoma',
    placedHoursAgo: 18 * D,
    stage: 'COMPLETED',
    to: 'Madam Kofo Hall',
    rider: 'grace',
    stores: [dispatch(['phone-case', 1, 'iPhone 13'])],
    rating: 5,
  },
  {
    buyer: 'bisola',
    placedHoursAgo: 17 * D,
    stage: 'DISPUTE_REFUNDED',
    to: 'Honours Hall',
    rider: 'segun',
    stores: [dispatch(['cargo', 1, 'L'])],
    dispute: {
      reason: 'NOT_AS_DESCRIBED',
      details:
        'The colour faded badly after the first wash; the listing says it doesn’t.',
      note: 'Photos confirm the fading. Refunded; the seller is withdrawing that batch.',
    },
  },
  {
    buyer: 'tunde',
    placedHoursAgo: 16 * D,
    stage: 'COMPLETED',
    address: '14 Bayo Adebowale Street, Akoka',
    rider: 'musa',
    stores: [dispatch(['calculator', 1])],
    rating: 4,
  },
  {
    buyer: 'uche',
    placedHoursAgo: 15 * D,
    stage: 'COMPLETED',
    stores: [pickup(['tutoring', 1])],
    rating: 5,
  },
  {
    buyer: 'zainab',
    placedHoursAgo: 14 * D,
    stage: 'COMPLETED',
    stores: [pickup(['small-chops', 1])],
    rating: null,
  },
  {
    buyer: 'david',
    placedHoursAgo: 13 * D,
    stage: 'SELLER_CANCELLED',
    to: 'Senate Building',
    stores: [dispatch(['serum', 1])],
  },
  {
    buyer: 'sarah',
    placedHoursAgo: 12 * D,
    stage: 'COMPLETED',
    to: 'Fagunwa Hall',
    rider: 'musa',
    stores: [dispatch(['power-bank', 1])],
    rating: 5,
  },
  {
    buyer: 'chinedu',
    placedHoursAgo: 11 * D,
    stage: 'COMPLETED',
    pay: 'BANK_TRANSFER',
    stores: [pickup(['tote', 2])],
    rating: 4,
  },
  {
    buyer: 'halima',
    placedHoursAgo: 10 * D,
    stage: 'COMPLETED',
    to: 'Main Library',
    rider: 'grace',
    stores: [dispatch(['hoodie', 1, 'M'])],
    rating: 5,
  },
  {
    buyer: 'ifeoma',
    placedHoursAgo: 9 * D,
    stage: 'COMPLETED',
    to: 'Madam Kofo Hall',
    rider: 'segun',
    stores: [dispatch(['headphones', 1])],
    rating: 5,
  },
  {
    buyer: 'bisola',
    placedHoursAgo: 8 * D,
    stage: 'COMPLETED',
    stores: [pickup(['laundry', 1])],
    rating: 4,
  },
  {
    buyer: 'uche',
    placedHoursAgo: 7 * D,
    stage: 'COMPLETED',
    to: 'Honours Hall',
    rider: 'musa',
    stores: [dispatch(['matcha-kit', 1]), pickup(['jollof', 1])],
    rating: 5,
  },
  {
    buyer: 'tunde',
    placedHoursAgo: 6 * D,
    stage: 'EXPIRED',
    to: 'Jaja Hall',
    stores: [dispatch(['tees', 1])],
  },
  {
    buyer: 'halima',
    placedHoursAgo: 5 * D,
    stage: 'COMPLETED',
    to: 'Main Library',
    rider: 'musa',
    stores: [dispatch(['planner', 1])],
    rating: 5,
  },
  {
    buyer: 'david',
    placedHoursAgo: 4 * D,
    stage: 'COMPLETED',
    to: 'Faculty of Engineering',
    rider: 'grace',
    stores: [dispatch(['earbuds', 1, 'White'])],
    rating: null,
  },
  {
    buyer: 'zainab',
    placedHoursAgo: 3 * D,
    stage: 'BUYER_CANCELLED',
    stores: [pickup(['braids', 1])],
  },
  // In progress now
  {
    buyer: 'sarah',
    placedHoursAgo: 40,
    stage: 'IN_WINDOW',
    stores: [pickup(['small-chops', 1])],
  },
  {
    buyer: 'chinedu',
    placedHoursAgo: 33,
    stage: 'DISPUTED',
    to: 'Mariere Hall',
    rider: 'segun',
    stores: [dispatch(['hoodie', 1, 'M'])],
    dispute: {
      reason: 'WRONG_ITEM',
      details: 'I ordered M and got an L.',
      note: '',
    },
  },
  {
    buyer: 'ifeoma',
    placedHoursAgo: 26,
    stage: 'WITH_RIDER',
    to: 'Madam Kofo Hall',
    rider: 'grace',
    stores: [dispatch(['power-bank', 1])],
    problem: {
      by: 'buyer',
      reason: 'LATE',
      details: 'The rider said by 1pm and I’m still waiting at the hall gate.',
    },
  },
  {
    buyer: 'bisola',
    placedHoursAgo: 8,
    stage: 'RIDER_ASSIGNED',
    to: 'Honours Hall',
    rider: 'musa',
    stores: [dispatch(['lip-balm', 1]), dispatch(['tote', 1])],
  },
  {
    buyer: 'halima',
    placedHoursAgo: 20,
    stage: 'AWAITING_PICKUP',
    stores: [pickup(['laundry', 1])],
  },
  {
    buyer: 'uche',
    placedHoursAgo: 1.5,
    stage: 'OPEN_JOB',
    to: 'Faculty of Engineering',
    stores: [dispatch(['laptop-stand', 1])],
  },
  {
    buyer: 'david',
    placedHoursAgo: 3,
    stage: 'AWAITING_PICKUP',
    stores: [pickup(['jollof', 2])],
  },
];

// Favourites, carts and listing reports by buyer
export const DEMO_WISHLISTS: Record<string, string[]> = {
  ifeoma: ['hoodie', 'matcha-kit', 'phone-case'],
  tunde: ['fridge', 'laptop-stand'],
  zainab: ['braids', 'lip-balm', 'tote', 'serum'],
  david: ['headphones', 'calculator'],
  sarah: ['painted-jacket', 'planner'],
  chinedu: ['earbuds', 'fridge', 'cargo'],
  bisola: ['small-chops', 'serum'],
  uche: ['tutoring', 'power-bank'],
  halima: ['cargo', 'braids', 'matcha-kit'],
};

export const DEMO_CARTS: Record<string, [string, number, string?][]> = {
  ifeoma: [['tees', 1]],
  tunde: [
    ['tote', 1],
    ['planner', 1],
  ],
  halima: [
    ['serum', 1],
    ['hoodie', 1, 'S'],
  ],
};
