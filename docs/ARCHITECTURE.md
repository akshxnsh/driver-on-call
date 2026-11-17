# Architecture

Last updated: 2026-11-16

## Layout

```
package.json            root scripts: setup, dev, reset, build, start
server/
  .env                  local config (created by seed, not committed)
  .env.example          documented config template
  data/                 SQLite database file (not committed)
  uploads/              uploaded photos and documents (not committed)
  src/
    index.js            Express app: all routes, auth, uploads, error handling
    db.js               opens the database, creates tables, small query helper
    lib.js              business rules: availability check, distance, validation, public driver shape
    otp.js              phone verification: code storage, limits, and sendSms() where an SMS provider plugs in
    notify.js           notifications table and notify(): the one place every event passes through
    demo.js             demo driver generator (seed and DEMO_MODE only)
    ../test/e2e.mjs     end-to-end test suite (npm test)
    seed.js             first-run setup: creates .env and demo data
client/
  vite.config.js        dev server on 5173, proxies /api to 4000
  public/               web app manifest and home-screen icons
  scripts/make-icons.mjs  regenerates the icons (no dependencies)
  src/
    main.jsx, App.jsx   entry, top bar, routes, sign-in guard
    auth.jsx            auth context (current user, server config)
    api.js              fetch wrapper and formatting helpers
    components.jsx      Avatar, Rating, AdSlot, LocationPicker, MapView, ListingFields
    Notifications.jsx   bell, notification panel, desktop alerts (polls every 10 s)
    styles.css          all styling
    pages/
      Landing.jsx       what signed-out visitors see at /
      Search.jsx        home for signed-in users: search form, results list, map
      DriverPage.jsx    public driver profile and booking request form
      Bookings.jsx      booking list, booking detail, chat, review
      Account.jsx       sign-in (Google + demo) and profile
      DriverHub.jsx     driver application, status, dashboard
      Admin.jsx         verification queue and stats
docs/                   this folder
```

## UI stack

React 18 + Vite, with Tailwind CSS v4 and the Motion library beside the original hand-written stylesheet (`client/src/styles.css`).

- `client/src/tailwind.css` sets the CSS layers (`theme, base, legacy, components, utilities`). The old stylesheet is imported into the `legacy` layer, below the utilities, and Tailwind's own reset is not loaded. New code should use utility classes and the shared parts; old screens keep their old classes until they are migrated.
- `client/src/components/ui/` holds shadcn/ui and Magic UI components (source copied into the project, so they can be edited). Add more with `npx shadcn@latest add <name>` or `npx shadcn@latest add https://magicui.design/r/<name>`, then check the import in the new file reads `@/lib/utils`.
- Page transitions and the gliding highlights live in `client/src/App.jsx`. Entrance animations use `BlurFade`.
- 21st.dev components need a 21st.dev account to copy; none are used.

## Screen sizes

All layout is in `styles.css`. Above 860 px: two-column pages and the menu in the top bar. Below 860 px: single column. Below 720 px (phones): the top menu is replaced by the bottom tab bar (`.tabbar` in `App.jsx`), search shows list or map (`.view-switch` in `Search.jsx`), and the driver page shows a sticky request bar (`.book-cta` in `DriverPage.jsx`). These three elements exist in the page at every size and are hidden by CSS on wider screens.

## How a request flows

Browser → Vite dev server (5173) → proxy `/api/*` → Express (4000) → SQLite file. In production, `npm run build` then `npm start` makes Express serve the built web app itself on one port.

Auth is a JWT (30 days) returned at sign-in, stored in `localStorage`, sent as `Authorization: Bearer`. The server loads the user from the database on every request, so role changes apply immediately.

## Data model

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | Every account | `email`, `google_sub`, `name`, `phone`, `city`, `role` (user/admin), `is_demo` |
| `driver_profiles` | One per user who applied | `status` (pending/approved/rejected), `rejection_reason`, licence and ID fields, `dl_file`, `id_file`, `photo_file`, `transmission`, `vehicle_types` (JSON), three rates, `lat`, `lng`, `area_label`, `paused` |
| `availability` | Weekly working hours | `driver_id`, `weekday` (0 = Sunday), `start_min`, `end_min` |
| `bookings` | A hire request and its life | `customer_id`, `driver_id`, `start_at`, `end_at` (ms), pickup, `est_total`, `status`, `paid`; `plan` and `units` record which rate priced it (hours when hourly, otherwise days) |
| `messages` | Chat per booking | `booking_id`, `sender_id`, `body` |
| `reviews` | One per person per booking | `booking_id`, `author_id`, `subject_id`, `rating`, `comment` |
| `otp_codes` | One pending phone-verification code per user | `user_id`, `phone`, `code_hash` (never the code), `expires_at`, `attempts`, send counters. `users.phone_verified_at` records verification |
| `notifications` | In-app notifications | `user_id`, `kind` (booking/message/review/application), `title`, `body`, `link` (page to open), `read_at` |

Booking status: `requested` → `accepted` → `completed`, or `requested` → `declined`, or `cancelled` from requested (customer) or accepted (either side).

A driver is "listed" when `status = 'approved'` and `paused = 0`. A driver is "available" for a span when the start falls in their working hours for that weekday (a same-day booking must also end within them) and no `accepted` booking overlaps. See `availabilityIssue` in `server/src/lib.js`.

The price of a span comes from `quote()` in the same file and covers exactly the time between start and end (whole weeks, whole days, leftover hours pro rata; see PRODUCT.md). `quoteTotal()` in `client/src/api.js` repeats the rule for the live total in the request form. Change both together.

## API

All paths are under `/api`. "Auth" means a signed-in user.

| Method and path | Access | Purpose |
| --- | --- | --- |
| GET `/config` | Public | Google client ID and demo-mode flag |
| POST `/auth/google` | Public | Body `credential` (Google ID token) and optional `nonce` (sent by the full-page route, must match the token). Verifies, creates or loads the user, returns JWT |
| GET `/auth/demo-users`, POST `/auth/demo` | Demo mode only | List and sign in as seeded demo accounts |
| GET `/me`, PUT `/me` | Auth | Read and update own profile (name, phone, city) |
| GET `/drivers/search` | Auth | Query: `lat`, `lng`, `radius`, `start`, `end` (ISO date-times), `sort`. Returns nearby listed drivers with distance, availability and the price for that span |
| GET `/drivers/:id` | Auth | Public profile, working hours, reviews. Never includes phone or documents |
| GET `/driver/me` | Auth | Own driver application or listing |
| POST `/driver/apply` | Auth | Multipart: fields plus `photo`, `dl_file`, `id_file`. Creates a pending application; allowed again after rejection |
| PUT `/driver/me` | Approved driver | Edit rates, bio, location, working hours, pause |
| POST `/bookings` | Auth with phone | Body: `driver_id`, `start`, `end`, pickup fields. Creates a request; rejects if the driver is not available |
| GET `/bookings?as=customer\|driver` | Auth | Own bookings in either role |
| GET `/bookings/:id` | Participants | Detail. `other.phone` is null unless status is accepted or completed |
| POST `/bookings/:id/action` | Participants | `accept`, `decline`, `complete`, `paid` (driver); `cancel` (see status rules) |
| GET, POST `/bookings/:id/messages` | Participants | Chat. GET takes `after` (last seen id) |
| POST `/bookings/:id/review` | Participants | After completion, once per person |
| POST `/me/phone/send-otp` | Auth | Sends a 6-digit code to the saved number (30 s between sends, 5 per hour). Demo mode returns `demo_code` instead of sending |
| POST `/me/phone/verify` | Auth | Body `{ code }`. Marks the number verified |
| GET `/notifications` | Auth | `{ unread, items }`: unread count and the 30 most recent |
| POST `/notifications/read` | Auth | Body `{ id }`, `{ link }` (everything pointing at one page) or `{ all: true }` |
| GET `/admin/drivers?status=` | Admin | Applications with full details |
| POST `/admin/drivers/:id/review` | Admin | `decision`: approve or reject (reject needs a reason) |
| GET `/admin/stats` | Admin | Counts |
| GET `/photo/:name` | Public | Driver profile photo |
| GET `/files/:name` | Owner or admin | Licence or identity document |
| POST `/dev/seed-near` | Demo mode only | Create demo drivers around a point |

Errors are JSON `{ "error": "message" }` with a matching HTTP status.

## Security notes

- Phone numbers are added to booking responses only after acceptance; the public driver endpoints never return them.
- Documents are stored with random names and served only through `/files/:name` after an owner-or-admin check. Uploads are limited to JPG, PNG, WebP and PDF, 5 MB each.
- Admin role comes from `ADMIN_EMAILS` at Google sign-in, or the seeded demo admin.
- Demo endpoints return 404 unless `DEMO_MODE=true`. Turn it off before any public deployment.
- Not done yet: rate limiting, CSRF is not applicable (bearer tokens), encryption of stored documents, audit log of admin decisions.

## External services

| Service | Used for | Note |
| --- | --- | --- |
| OpenStreetMap tiles | Map background | Public tile server is for light use only |
| Nominatim | Place search and reverse geocoding, called from the browser | The search text or coordinates are sent to OpenStreetMap. Rate-limited; replace or self-host before launch |
| Google Identity Services | Sign-in | Only loaded when `GOOGLE_CLIENT_ID` is set |
| Twilio Verify | Sends and checks phone verification codes (optional) | Called from the server only when the three TWILIO_ variables are set. The user's phone number is sent to Twilio |
| Google Fonts | Plus Jakarta Sans typeface | Falls back to system fonts offline |
