# Demo data for staging

Asked for on 2026-10-27: sample rows in every major table, for one school with several campus places and up to
twenty people, so staging looks like an app in use. Branch `feat/demo-seed` (off `backend` at `7f6196d`).

## Running it

It runs from your own computer against the staging database. This session can't reach Neon, and shouldn't hold its
password. You need Node, pnpm and the Neon connection strings (Neon console → your project → Connect).

```
cd backend
pnpm install
DATABASE_URL="<Neon pooled URL>" DEMO_PASSWORD="<a password for every demo account>" pnpm run seed:demo
```

- **Before it:**
  - The school needs to exist. By default that's the one with the `unilag.edu.ng` domain; set `DEMO_SCHOOL_DOMAIN`
    for another.
  - An admin account needs to exist (`pnpm exec prisma db seed` adds both).
- **`DEMO_PASSWORD`:** at least 8 characters with an upper-case letter, a lower-case letter and a number. Share it
  with your testers yourself; it isn't stored anywhere in the repo.
- **Runs once.** A second run stops with "already there".
- **To take it out:** `DATABASE_URL="…" pnpm run seed:demo -- --remove`. That also removes every order a demo account
  took part in, a tester's order from a demo store included. The campus places and the delivery fee stay, since
  they're the school's. Run it before going live if staging ever becomes production.
- **To refresh the dates later:** remove it, then add it again.

## What's in it

All demo accounts are on `@demo.campusmart.test`, a reserved domain no email can reach. They're set not to receive
order emails.

- **The school:**
  - 10 campus places (halls, faculties, the main library), added only if missing.
  - A delivery fee of ₦500, set only if the school had none. Without one, dispatch isn't offered (C10).
- **7 sellers:**
  - TrendHUB NG, Glow by Ada, Mama Chi's Kitchen, Gadget Plug, Inkwell Studio, Kemi's Campus Services: verified
    (with an approved student ID request), with a pickup area, phone and payout account.
  - Dami Thrift: joined two days ago and not verified yet, so its one listing is a draft.
- **3 riders** (Musa Bello, Grace Udoh, Segun Adewale), each with a used invite.
- **10 buyers.** Kunle Ogunleye is suspended, with a reason.
- **26 listings** with photos, prices, descriptions and sizes or colours:
  - one sold out and one archived;
  - one held for review (the banned word "replica");
  - one rejected after a report (prescription eye drops);
  - one draft.

  The photos and product names are the ones the original app design used.
- **38 orders over five weeks** (41 store orders), each with a payment, a delivery job where there's dispatch, and the
  notifications and audit entries the app would have written:

  | Where it stands | How many store orders |
  |---|---|
  | Delivered or collected, released, paid out | 27 |
  | Paid out, but the transfer failed (admins see it under Payouts) | 1 |
  | Handed over less than 48 hours ago, money still held | 1 |
  | Open dispute ("I ordered M and got an L") | 1 |
  | Dispute refunded / dispute released to the seller | 1 / 1 |
  | Cancelled by the seller after payment, refunded | 1 |
  | Waiting for a rider (an open job riders can accept now) | 1 |
  | Rider on the way to the stores / with the rider | 2 / 1 |
  | Waiting for the buyer to collect | 2 |
  | Never paid (expired) / cancelled by the buyer before paying | 2 |

- **Everything else:**
  - 28 reviews; one is hidden by an admin as abusive.
  - Favourites, three carts, five weeks of daily views per listing, and today's viewers.
  - Six reports: two open on one listing, a bug report, and closed ones.
  - Two problem reports (a late rider, open; a buyer who didn't show, closed).
  - Low-stock alerts, about 280 notifications and about 240 audit entries.
- **Worked out by the app's own code:** ratings come from the reviews (the hidden one doesn't count) and trust scores
  from the nightly calculation.

The notifications and audit entries it gives real accounts (your admins) carry `"demo": true`, which is how
`--remove` finds them.

## What to expect afterwards

The app's background jobs treat demo orders like real ones:

- **The open job:** after 5 hours nobody has accepted it, so admins get an alert.
- **Rider and pickup deadlines:** each in-progress order gets the usual days. When one passes, the order is cancelled
  and a refund is tried. It fails, because the demo payments never went through Paystack.
- **The order in its 48-hour window:** it's released when the window ends. The payout fails, because the demo payout
  accounts aren't real Paystack recipients. No money can move either way.
- **Review reminders and trust scores** carry on as normal.

If you'd rather keep everything as it was on the day, remove and re-add the demo data before a demo.

Other limits:

- **Photos:** the listing photos load from Unsplash, through the same image settings the app's design already used.
  This sandbox can't reach Unsplash, so the walk below swapped them for local files. If any photo doesn't show on
  staging, tell me which.
- **Editing a demo listing's photos:** the API only accepts photos uploaded through CampusMart's Cloudinary. A seller
  changing a demo listing's photos needs to upload new ones.
- **The student ID images** behind the approved verification requests aren't real files.

## Verification evidence

- **Local run on a fresh database** (migrations, base seed, demo seed): 6 seconds.
  - Every major table has rows; sessions and sign-in codes come when people sign in.
  - A second run refuses.
  - `--remove` leaves only the admin and the campus places, and the demo data goes in again afterwards.
- **e2e `test/demo-seed.e2e-spec.ts`** (5 tests, in CI from now on, so a schema change that breaks the seed fails
  there):
  - every table filled;
  - a buyer, seller, rider and the admin through the API;
  - none of the background jobs has anything due right after seeding;
  - runs once, and removal keeps a tester's account;
  - it needs a strong password and the school.
- **Browser walk** ([`demo-walk.mjs`](evidence/demo-seed/demo-walk.mjs) →
  [`demo-walk-output.txt`](evidence/demo-seed/demo-walk-output.txt), **12/12**):
  - **Guest:** the home page with 20 products.
  - **Buyer:** five orders, one with a rider; 17 notifications; favourites; a product with reviews; a store page.
  - **Seller:** a dashboard with 30 days of sales (₦138,900 from 9 orders, 1,346 views); payouts, paid and failed.
  - **Rider:** one open job, one current, nine done.
  - **Admin overview:** 1 dispute, 1 failed payout, 1 listing to review, 3 reports, 1 suspended user.
  - Screenshots `01`–`16` in the same folder.

## Deviations

1. **A new script, not part of the guide.** `prisma/seed.ts` is unchanged.
2. **It writes rows directly**, with the app's own helpers for codes, fees, deadlines, refund amounts, ratings and
   trust. Going through the services would stamp everything "now" and call Paystack.

## Noticed along the way, not changed

- **More than one `<main>` on a page:** the product page and product cards each use one. Screen readers expect a
  single main area; the cards should use a `<div>` or `<article>`.
