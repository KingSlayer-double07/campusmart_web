# Phase 10b: first visit and browsing without an account

Branch `feat/phase-10b-guest-browsing` (off `backend` at `2109cb2`). Status: DONE pending your replacement of the
intro slides' placeholder copy and drawings.

## Why this phase exists

On 2026-10-19 you described the first-user flow:

1. The splash.
2. The onboarding screens, ending with three options: browse, buy or sell.
3. Browsing without an account, with a redirect to sign-in only to check out a cart or add to favourites.

The app didn't do the third part. Browse led to the same sign-in page as Buy, because guide 3.1 and the endpoint
table make listings "verified user" only. That contradicts locked decision D14 ("Guests can still browse and add
items"). I followed 3.1 and noted the gap in [Phase 4](phase-4-cart-checkout.md) (deviation 11) instead of raising
it with you as a decision.

**Your answers (2026-10-19):**

| Question | Answer |
|---|---|
| Which school does a guest see? | They pick a school first. It's remembered on the phone, can be changed, and is carried into the account if they sign up. |
| Where is the sign-in wall? | At checkout. Guests fill and open a cart; Checkout asks them to sign in, and the cart moves into the account. |
| What else may a guest see? | Reviews, and search and categories. **Not** store pages. |
| Intro slides? | Yes, between the splash and the three options. |

You also said the seller-to-buyer link on `master` was for testing; it isn't carried over.

## 1. Checklist

- [x] **First visit:** the splash for about 2 seconds, then the intro slides, then "How do you want to use
  CampusMart?" with Browse, Buy and Sell.
  *Walk: "A first visit opens on the splash", "…moves on to the intro slides after about 2 seconds" (2.5 s),
  "Three slides…", "The slides end on the three choices". Vitest `splash/page.test.tsx`, `intro/page.test.tsx`.*
- [x] **Intro slides:**
  - Shown once, then remembered on the phone.
  - Next, Skip, the dots and swiping all work.
  - The copy and drawings are placeholders for you to replace.

  *Vitest `intro/page.test.tsx`; screenshots `02-intro-1`, `03-intro-2`, `04-intro-3`.*
- [x] **Browse needs no account:** pick a school (an unlisted one goes to the waitlist), then the home page.
  *Walk: "Browse asks which school to browse, not for an account", "The home page shows the school's listings to a
  guest" (8 cards). Vitest `role-select`, `guest-school`, `page.test.tsx` (home).*
- [x] **Search and categories, products and reviews for guests;** no store pages or featured stores.
  *Walk: "A guest can search", "A guest can open a product", "…and no store pages or notification bell", "A guest
  opening a store page is asked to sign in". e2e `phase10b-guest-browsing` (listings, search, categories, one listing,
  related, reviews; drafts and other schools 404; stores 401).*
- [x] **Favourites ask a guest to sign in,** then bring them back to the item. *Walk: "The heart asks a guest to
  sign in, and to come back to the item".*
- [x] **The cart opens for a guest; Checkout asks them to sign in.** *Walk: "A guest opens their cart without signing
  in", "Checkout asks the guest to sign in, keeping /checkout for after". Vitest `proxy.test.ts`.*
- [x] **Signing up from checkout keeps the destination and the cart.**
  - The destination (`/checkout`) survives sign-up, the email code and the school step.
  - The school step starts on the school they browsed.
  - The guest cart moves into the account.

  *Walk: "The school they browsed is chosen already", "They arrive at checkout with the cart they filled as a guest".
  Vitest `SignUpForm`, `onboarding/school`, `redirects`, `useGuestCartMerge`.*
- [x] **A returning guest goes straight back to browsing.** *Walk: "A returning guest opens straight on the home page,
  no splash".*

### Gate

- [x] Backend tsc, lint (0 warnings), build, unit and e2e pass; `prisma migrate diff --exit-code` is clean (no schema
  change).
- [x] Frontend lint, tsc, Vitest and `pnpm run build` pass.
- [x] `lib/api/schema.d.ts` regenerated (CI re-checks it).
- [x] GitHub CI is green on the branch.
- [x] Browser walk with screenshots: 20/20.
- [ ] Your copy and drawings for the intro slides.

## 2. Changes

### API

- **Guest-readable routes:** `GET /listings`, `/listings/:id`, `/listings/:id/related` and `/listings/:id/reviews`
  take an optional `institutionId` for guests. They live in `listings-browse.controller.ts` and
  `listing-reviews.controller.ts` with `@GuestOrUser()`. The sellers' writes keep `@RequireVerifiedEmail()`.
- **`OptionalJwtAuthGuard`:**
  - No access cookie means a guest.
  - A cookie that doesn't check out is still a 401. So a stale session refreshes instead of quietly turning into
    the guest view.
- **`common/viewer.ts`:**
  - Signed in: always your own school; the parameter is ignored.
  - A guest: the school they name, if it exists (else 404) and is switched on (else 403 `INSTITUTION_INACTIVE`).
  - No session and no school: 401. This is also how an app whose 15-minute access cookie just expired gets told to
    refresh, because the app only sends a school while signed out.
- **Views and drafts:** a guest's look isn't counted as a view (A2 counts signed-in viewers), and a guest never sees
  drafts.
- **Unchanged:** the cart, checkout, favourites and store routes still need an account.

### App

- **Guest state:** `app/store/useGuestStore.ts` keeps the guest's school and whether they've seen the intro, on the
  phone.
- **School in requests:** `useBrowseSchool()` adds the guest's school to listing and review requests and to their
  cache keys. A guest without a school fetches nothing.
- **First visit:**
  - The splash routes to: signed in → home; first visit → intro; a guest with a school → home; else the three
    choices.
  - `/onboarding/intro` holds three placeholder slides.
  - Browse → `/onboarding/guest-school` → home. Buy and Sell sign in as before.
- **Home page for a guest:**
  - "Browsing <school> · Change" and a Sign in button.
  - No notification bell and no featured stores.
- **Proxy:** `/cart` leaves the protected list and `/stores` joins it.
- **Signing in from a product:** the favourites sheet and "Report this listing" send a guest to sign in and back to
  the item.
- **Keeping the destination (`next`):** it's carried through sign-up ↔ sign-in links, `/onboarding/verify-email`
  and `/onboarding/school`.
- **School step:** `/onboarding/school` starts on the school the guest browsed.
- **Guest cart:** the merge waits until the account has a school.
- **Fix, not new behaviour:** reloading the home page no longer detours through the splash (`ba10e4c`).
  - **The bug:** zustand's hooks report the stores' empty initial state while React hydrates a page. The home
    page's redirect read that, so a signed-in user who reloaded `/` sat on the splash for 2.2 seconds. This
    predates Phase 10b.
  - **The fix:** the redirect now reads the stores directly.
  - **Evidence:** [`reload-check-output.txt`](evidence/phase10b-guest-browsing/reload-check-output.txt) shows `/` → `/`.

## 3. Verification evidence

- **Backend:**
  - Unit: 416/416.
  - e2e: 216/216 in 19 suites. The new `phase10b-guest-browsing` suite has 4 tests:
    - a guest browses the school they picked, with search, categories and reviews;
    - a guest needs a school that exists and is switched on (401, 404, 403 and 400);
    - checkout, the server cart, favourites and store pages still need an account;
    - signed in, it's always your own school, and a forged or stale cookie is a 401.
  - Unit tests for the guard and the guest reads.
- **Frontend:** Vitest 374/374 in 91 files. New: intro, guest school, the three choices, splash routing, home for a
  guest, listing reads with and without a school, the proxy, and `next` through sign-up and the school step.
- **GitHub CI:** [run 96](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39229840669) on
  `c2495c7` (the API and app changes) and [run 97](https://github.com/KingSlayer-double07/campusmart_web/actions/runs/39230910575)
  on `a728f5e` (with the reload fix) are green.
- **Browser walk** ([`first-visit-walk.mjs`](evidence/phase10b-guest-browsing/first-visit-walk.mjs) →
  [`first-visit-walk-output.txt`](evidence/phase10b-guest-browsing/first-visit-walk-output.txt), **20/20**): a new
  visitor on a phone, against `next start` and the API on `campusmart_dev`.
  - **Start:** splash (`01-splash`), the three slides (`02`–`04`), the three choices (`05-three-choices`).
  - **Browsing:** the guest school (`06-guest-school`), the home page as a guest (`07-home-as-guest`), search
    (`08-search-as-guest`), a product (`09-product-as-guest`), the heart asking to sign in
    (`10-heart-asks-sign-in`).
  - **Cart and checkout:** the cart as a guest (`11-cart-as-guest`), Checkout asking to sign in
    (`12-checkout-asks-sign-in`).
  - **Signing up:** a new gmail.com account with the school carried over (`13-school-carried-over`), then checkout
    with the guest cart (`14-checkout-after-sign-up`).
  - **Reruns:** the first runs failed in the script, not the app:
    - it looked for product links (cards open on tap instead);
    - it looked for an item's title as text at checkout (it's the photo's alt text there).

    One more failure was a real bug, the splash detour above, now fixed. The run after the fix is the evidence.

## 4. Deviations and assumptions

1. **This changes guide 3.1 and the endpoint table:** listing reads are no longer "verified user" only. D14 now holds
   as written.
2. **Guests' listings are public to anyone with the app.** Listings, prices, photos, the seller's display name and
   pickup area, and reviews can now be read without an account, for any switched-on school. Addresses and phones
   still show only after paying, as before (SA2). The global rate limit of 120 requests a minute per IP still
   applies.
3. **An account still confirming its email can browse its own school.** Before, it got 403 `EMAIL_NOT_VERIFIED`.
   Buying still needs the confirmed email.
4. **Store pages need an account, as you chose.** On a product page, a guest who taps the seller's store is asked to
   sign in.
5. **The intro slides appear once per phone,** before the three options, and can be skipped. The copy and the
   icon drawings in `app/onboarding/intro/page.tsx` are mine, as placeholders.
6. **The school is pre-selected, not saved silently.** It's carried into the account by pre-selecting it on the
   school step. The person still taps Continue, so they can change it there. A school email at sign-up decides the
   school as before.
7. **Lines from another school are dropped.** If a guest's cart has items from another school than the account's
   (they changed school in between), those lines are dropped when the cart moves into the account, as the cart merge
   already did.

## 5. Needs from you

- **Intro slides:** send the text and images you want, or approve the drafts:
  - "Your campus marketplace"
  - "Pay with peace of mind"
  - "Delivered on campus"
- **Public listings:** confirm you're happy for listings to be readable without an account (deviation 2).

## 6. After the gate: unreadable text in dark mode (2026-10-19)

You reported the profile card on staging: name and email were near-white on a light blue card. The app follows the
phone's theme by default (`defaultTheme="system"`), so every dark-mode phone saw it.

**Cause:** colours fixed for light mode, under text that follows the theme:
- light Tailwind tints (`from-blue-50`, `bg-orange-50`, `bg-red-50`) and the `--main-subtle` / `--main-pale` tokens;
- the seller blue `--seller-main` (`#13368B`) used as text on dark surfaces;
- the waitlist page's hard-coded `#1c1c1c` text;
- `bg-card` (dark in dark mode) where white was meant, on the seller dashboard's navy header.

**Fix (light mode unchanged, but for the waitlist's input fill: `#f5f5f5` instead of `#fafafa`):**
- `globals.css`: the `dark:` variant now follows next-themes' `.dark` class (a theme picked in Settings wins over the
  phone's), and dark mode gets its own `--main-pale`, `--main-subtle`, `--seller-main` (`#4169e1`; white text on it
  is 4.9:1) and `--seller-hover`.
- `dark:` tints on the two profile cards, `InfoBanner`, and the info boxes on Active sessions, Email verification and
  Clear cache.
- Seller dashboard: the period switch's selected pill is white on the header in both themes; Add Product and View
  Orders use the theme's text in dark mode. The seller avatar's initial is lighter in dark mode.
- Waitlist: theme text and inputs instead of fixed light ones.
- The profile footer's "•" was saved mis-encoded and showed as `â€¢` in both themes; fixed, with the file's stray
  byte-order mark.

**Evidence:**
- [`contrast-scan.mjs`](evidence/phase10b-dark-mode/contrast-scan.mjs) opens every page as a guest, buyer, seller
  and admin, in dark and light mode, and lists text under 3:1 contrast with what's behind it.
  - **Before:** 101 spots only in dark mode, on 18 pages ([`contrast-scan-before.txt`](evidence/phase10b-dark-mode/contrast-scan-before.txt)).
  - **After:** 0 on the guest, buyer and seller pages ([`contrast-scan-after.txt`](evidence/phase10b-dark-mode/contrast-scan-after.txt)).
    The admin pages had none before or after the main fix. The last run left them out because the admin account
    had used its 5 sign-in codes for the hour.
- Screenshots in both themes: `dark-*` and `light-*` in the same folder.
- Vitest `app/profile/page.test.tsx` (new): the card's dark tint and the footer's bullet. It fails on the old page.

**Not changed:** the brand orange as text on white is 2.9:1, just under 3:1, in light mode only. That's a brand
colour choice, so it stays unless you want a darker orange for text.

## 7. After the gate: sign-in redirects, a way to the shop for sellers, the admin menus (2026-10-19)

### Sent to sign-in with a live session

You reported being sent to the sign-in page repeatedly on staging without having signed out.

**Causes, in the code:**

1. **Two refreshes with the same token.** Refresh tokens are single-use, and the API revokes a session whose
   token is presented twice (D6, reuse detection). After 15 minutes the browser dropped the access cookie, so
   opening a protected page went through sign-in (`proxy.ts` can't see the refresh cookie, which only travels to
   `/api/auth`). There, the sign-in page's silent refresh and the app's own refresh after `GET /auth/me` → 401
   ran at the same time. When the first answer arrived after the second request had left, the second carried
   the old token and the session was revoked. Reproduced locally with refresh answers held 400 ms
   ([`expired-access-before.txt`](evidence/phase10b-auth-redirects/expired-access-before.txt), scenario A).
2. **Any failed refresh signed the user out in the app.** That included a 429 rate limit, a 5xx, or Render
   waking up. Only a dropped connection was spared.
3. **Any failed refresh cleared both cookies on the API,** a server error included, though the session itself
   was fine.

**Fix:**

- **App:**
  - Every refresh shares one request, the sign-in page's silent one included.
  - Tabs take turns through a browser lock (`navigator.locks`), so each sends the latest token.
  - Only a 401 or 403 from refresh signs out. A real sign-out now returns you to the page you were on
    (`?next=`).
- **API:**
  - The refresh clears the cookies only on 401 or 403.
  - The access cookie now lasts as long as the session (30 days); the token in it still expires after 15
    minutes. The route guard sees the cookie, so pages open directly and the app refreshes the expired token.
    No more trip through the sign-in page.

**Evidence** ([`expired-access-after.txt`](evidence/phase10b-auth-redirects/expired-access-after.txt), same
400 ms delay):

- Scenario A (a cookie set before this fix): one refresh, session kept, the page opens.
- Scenario C (from now on): no sign-in page at all.
- Tests:
  - Vitest `lib/api/client.test.ts`: 429/500/502 keep you signed in; 403 signs out; one refresh with the sign-in
    page; the browser lock. The new tests fail on the old code.
  - e2e `phase1-auth`: the cookie's 30 days with the token's 15 minutes; a 500 during refresh keeps the cookies.

### Shop on CampusMart (sellers)

The seller Profile page has a "Shop on CampusMart" entry to the shop (D8: sellers can also buy). The shop's
Profile tab already had "Sellers page" to come back. Walk
([`seller-shop-walk-output.txt`](evidence/phase10b-auth-redirects/seller-shop-walk-output.txt), 5/5):
Profile → shop → another store's item in the cart → "Sellers page" → dashboard. Vitest
`app/sellers/profile/page.test.tsx`.

### Admin sidebar and bottom bar

You reported both running off the screen: 15 links are taller than a laptop screen and wider than a phone.

- **Sidebar:** the link list now scrolls between the logo and the "Signed in as / Sign out" footer, which stays
  on screen.
- **Phone bottom bar:** it scrolls sideways within the screen.
- **Both:** open on the current page's link.

Check ([`admin-nav-after.txt`](evidence/phase10b-admin-nav/admin-nav-after.txt), 6/6; before: 2/6):

- Laptop 1366×768: all 15 sidebar links reachable, Sign out on screen.
- Phone 390×844: all 15 reachable, the current page's link visible, no sideways page scroll.
- Screenshots `before-*` and `after-*`; Vitest `AdminShell.test.tsx`.

### Deviations

1. **The access cookie's `Max-Age` is 30 days, not 15 minutes.** Phase 1's e2e pinned 900 seconds; it's updated.
   D6's lifetimes are unchanged: the token expires after 15 minutes and the refresh token after 30 days.
2. **Two tabs refreshing now take turns.** A browser without `navigator.locks` (older than Safari 15.4 or Chrome
   69) falls back to the old behaviour across tabs. Within one tab, the shared request still applies.
