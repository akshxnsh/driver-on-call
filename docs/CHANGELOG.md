# Changelog

Newest first. Add an entry whenever behaviour, data model or a product decision changes, and update PRODUCT.md or ARCHITECTURE.md in the same change.

## 0.9.0 — 2026-11-17 — Landing page; the app opens only after sign-in

Owner's decision: a new visitor sees only a landing page anyone can understand, and must sign in or sign up to enter the main app.

- New landing page (`client/src/pages/Landing.jsx`) for signed-out visitors at `/`: what DOC does in one sentence, how it works in three steps, what it is good for, why drivers are trustworthy, and a "Are you a driver?" band. Buttons: "Get started" and "I am a driver" (both go to Google sign-in; the driver button then opens the driver page). Signed-out visitors see no menu, search or tab bar.
- Every other page redirects to sign-in. After signing in the visitor returns to where they were headed; signed-in users see the search page at `/` as before. A verified phone number is still required only for booking, driving and admin, not for browsing.
- The server now also requires sign-in for `GET /api/drivers/search` and `GET /api/drivers/:id`, so driver data cannot be read without an account. Profile photos stay reachable by their random file name so images load.
- Tests: 146 checks pass (two new ones confirm signed-out search and profiles are refused).
- Checked in the browser at phone size: landing page, redirects for signed-out `/drivers/4` and `/bookings`, "I am a driver" ending on the driver page, "Get started" ending on the search page.

## 0.8.3 — 2026-11-17 — Short address

- The app now lives at **https://driveroncall.onrender.com**. Render fixes a service's web address when it is created and the Blueprint feature adds a random ending to every name, so the service was created directly (not from the Blueprint) with the name `driveroncall`. Its settings are in Render's dashboard; `render.yaml` is kept as the reference for them. The older long-address service and its paused Blueprint remain until deleted in the dashboard.
- Google client now allows the new address (origin and `/login` redirect). Google can take several minutes to apply that: until then sign-in shows `Error 400: redirect_uri_mismatch`.

## 0.8.2 — 2026-11-17 — Live on Render, tested end to end

Live at https://doc-driver-on-call-8sl8.onrender.com (free instance, data resets on restart). Tested on the live site with real Google sign-in and real Twilio texts:

- Three accounts signed in with Google (two admins from `ADMIN_EMAILS`, one ordinary user). Demo logins are hidden.
- Two accounts verified the same number with real texts; one applied as a driver, an admin approved it, and the other account searched, requested, chatted, was accepted, marked paid, completed, and both sides left reviews. Notifications and the phone-number reveal worked on both sides.
- Access control checked live: an ordinary user gets 403 from every admin endpoint, 401 when signed out, no Admin link, and `/admin` redirects home.
- Needed in Render: `TWILIO_AUTH_TOKEN` (set by the owner in the dashboard) and the live address in the Google client's origins and redirects.

## 0.8.1 — 2026-11-17 — Free Render instance

The owner has no payment card on Render, so the blueprint now uses the free instance with no disk. Data is erased on every restart or wake from sleep. The paid setup is documented in DEPLOYMENT.md for when a card is added.

## 0.8.0 — 2026-11-17 — Ready for Render

- Added `render.yaml` (Render Blueprint), `engines` (Node 22.5+) and `docs/DEPLOYMENT.md`.
- Checked locally in production mode on an empty database, the way Render will run it: one port serves the app and API, deep links fall back to the app, health check answers, demo login and demo seeding are gone, and the data lands in the configured folder.
- Not yet deployed. Needs the owner to sign in to Render and confirm the paid instance.

## 0.7.0 — 2026-11-17 — Automated end-to-end test

- `npm test` runs 144 checks against a throwaway server and database (it never touches your data and never sends a real text): sign-in protection, search and pricing, phone verification and its limits, booking and double-booking, contact privacy, chat, notifications, completion, payment, reviews and ratings, cancellation, driver applications with uploads, admin approve and reject, private documents, the driver dashboard, and odd or hostile input. All pass.
- Also walked through live in the browser as the owner's verified account and a demo driver: search, request, chat, accept, phone reveal, paid, completed, reviews both ways, notifications on both sides, and the driver's public rating updating.
- Added `GET /api/health` for hosting platforms. `DB_DIR` and `UPLOAD_DIR` settings let the data and uploads live on any folder (the tests use this, and a host's persistent disk can too).
- Not covered by automatic tests: how the screens look, the Google pop-up sign-in, real SMS delivery (tried once by hand), code expiry after 5 minutes.

## 0.6.1 — 2026-11-17 — Twilio Verify for real texts

- `server/src/otp.js` can send and check codes through Twilio Verify. It switches on when `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID` are set in `server/.env`; otherwise demo mode (code shown on screen) applies as before. Twilio creates and checks the code, so none is stored here. Our own limits (30 s between sends, 5 an hour, 5 wrong tries) still apply on top of Twilio's.
- Setup steps and the trial limits (only up to 5 verified numbers can be texted) are in the README.
- Tested against a local fake Twilio server: correct request (address, login, form fields), wrong code rejected, right code verifies, a trial refusal shows a clear message, and no code leaks to the page in Twilio mode. Then tested against the real Twilio on 2026-11-17: one real text was sent to the owner's own verified number, the code was entered in the app and the number became verified. On the trial, Twilio's default Verify service is used (a trial account cannot create its own), so the message wording is Twilio's.

## 0.6.0 — 2026-11-17 — Mobile number verification (OTP)

Owner's decision: a mobile number must be verified before it can be used.

- Saving a number on the profile page now leads to a "Verify" card: send a 6-digit code, type it in, done. A number marked "Verified" stays verified; changing the number makes it unverified again.
- Booking a driver and applying as a driver both require a verified number. The driver page's request button says "Verify your phone number to request" until then.
- Rules: code valid 5 minutes, 30 seconds between sends, 5 sends per hour, 5 wrong tries before the code is discarded. Only a hash of the code is stored.
- **Text messages are not sent yet.** `sendSms()` in `server/src/otp.js` is the single place to plug in an SMS provider. In demo mode it sends nothing and the page shows the code; with demo mode off it refuses with "Text messages are not set up on this server yet" rather than pretending. Real sending needs a provider account (for example MSG91 or Twilio) and, in India, a DLT-registered message template.
- Seeded demo accounts count as verified.

Tested in the browser with a throwaway account: the request button redirected to the profile, a wrong code was rejected, resend was blocked for 30 seconds, the right code verified and returned to the driver page, the same number stayed verified and a changed number became unverified. Code expiry and the 5-wrong-tries lockout were not run.

## 0.5.1 — 2026-11-17 — Exact duration

Owner's decision: the time between From and To is counted exactly, with no rounding up.

- Duration is shown to the minute ("4 hours 30 minutes", "2 days 9 hours").
- Price: leftover hours at the hourly rate pro rata (never more than one day rate), whole days at the day rate (days plus hours never more than one week rate), whole weeks at the weekly rate. At ₹180 / ₹1,200 / ₹7,000: 4 h 30 min is ₹810, 1 day 1 hour is ₹1,380, 2 days 9 hours is ₹3,600. This replaces the rounding rule described under 0.5.0.
- The units column now stores the length in hours, rounded.

Checked: server and client give the same totals for sample spans; a live search returned exact prices. Verified in the request form: 4 hours shows ₹720, 4 hours 30 minutes ₹810, 2 days 9 hours ₹3,600. PRODUCT.md and ARCHITECTURE.md updated.

## 0.5.0 — 2026-11-17 — Bookings by From and To

Owner's decision: do not ask "when" and "how many hours"; ask for a From and a To date and time.

- Search and the request form now have two date-time inputs, From and To. Moving From keeps the same length of booking. The hour / day / week choice is gone.
- Price is worked out from the span using the driver's own rates, cheapest first: part-hours round up; up to 24 hours is hours × hourly rate, capped at the day rate; longer spans count days (each started 24 hours), with full weeks at the weekly rate and leftover days at the day rate. Example at ₹180 / ₹1,200 / ₹7,000: 4 hours ₹720, 10 hours ₹1,200, 3 days ₹3,600, 9 days ₹9,400.
- Availability: the From time must be inside the driver's working hours for that day; a booking that starts and ends on the same day must also end inside them; no accepted booking may overlap.
- Limits: To must be after From, From must be in the future, and a booking can be at most 12 weeks.
- Bookings and notifications show the range ("Thu 19 Nov, 10:00 am to 2:30 pm · 5 hours").
- API: `/drivers/search` and `POST /bookings` take `start` and `end` instead of `start`, `plan` and `units`. The `plan` and `units` columns remain and now record which rate was used.

Tested in the browser: prices for 4 hours, 10 hours, 3 days and 9 days; rejection of a To before From, a missing To, a 13-week span and a past From; "Ends after working hours"; a real booking and its notification text; overlap blocking after acceptance; the search and request forms at phone size. The live total in the request form gives the same figures as the server.

## 0.4.1 — 2026-11-17 — Results only after searching

- The home page opens with just the search form. The driver count and list appear only after pressing "Find drivers"; choosing a location no longer searches on its own.
- The form still remembers the last location and time across reloads. Coming back from a driver's page during the same visit shows the search already run.

## 0.4.0 — 2026-11-17 — Simpler, calmer interface

Owner's feedback: too many small grey descriptions made the screens feel congested.

- Removed most helper text. Each screen keeps at most one short note, and only where it prevents a mistake or builds trust (payment note on the request form, phone-number privacy, document privacy).
- Search form reduced to three inputs: pickup location, when, and "For 4 hours" (number and unit together). Distance and sort moved next to the results.
- Location box is now one input with a Search button; focusing it offers "Use my current location" as the first suggestion.
- Driver rows show name, verified tick, rating, experience, distance and price. Car types and transmission moved to the profile. Only unavailable drivers get a status line.
- Driver profile: rates first, working hours summarised in one line ("Every day, 6 am to 11 pm") instead of a seven-row table, verification shown by the badge alone.
- Booking page: one "When" line instead of start, end and plan; a "Paid" tag instead of a sentence.
- Fewer ad slots (search: one in the list and one at the bottom; driver page and booking list: one at the bottom), drawn more quietly.
- Styling: larger base text (16 px), more padding and spacing, no card shadows, one-line footer.

Checked in the browser at 1200 px and 375 px: search, results, driver profile and request form, bookings list, driver dashboard. No sideways scrolling on the phone size.

## 0.3.0 — 2026-11-17 — Phone UI

- Below 720 px the app switches to a phone layout: a compact top bar (name, bell, avatar) and a tab bar fixed to the bottom of the screen (Find, Bookings, Drive, Admin for admins, Account).
- Search results on phones show the list or the map, switched with a List / Map control, instead of both stacked.
- Driver profile on phones keeps a "Request this driver" bar on screen until the booking form is in view.
- Larger touch targets (44 px buttons), 16 px form text so iPhones do not zoom on focus, full-width notification panel, taller chat, safe-area padding for phones with a home indicator.
- Sign out moved into the Account (profile) page on phones; it is also shown there on desktop. (Fixed later the same day: it was missing there for accounts that had not yet completed their profile.)
- Installable: web app manifest, theme colour and home-screen icons (`client/public/`, generated by `client/scripts/make-icons.mjs`). "Add to Home screen" opens DOC full-screen like an app.
- `npm run dev:phone` serves the app to phones on the same Wi-Fi.

Tested at 375 × 812 in the browser: search, list/map switch, driver profile and booking form, profile, admin queue, driver application form and notification panel all fit with no sideways scrolling; the desktop layout at 1200 px is unchanged. Not tested on a physical phone, and "Add to Home screen" was not exercised.

## 0.2.0 — 2026-11-17 — Notifications

- New `notifications` table and `server/src/notify.js`. Every event passes through `notify()`: booking requested, accepted, declined, cancelled, completed, marked paid, new chat message, review received, driver application submitted (to admins), application approved or rejected.
- Chat messages collapse: several unread messages on one booking show as a single notification with the latest text.
- Bell in the top bar with an unread count, a panel of the 30 most recent notifications, "Mark all as read", and the unread count in the browser tab title. Checked every 10 seconds.
- Opening a booking marks that booking's notifications as read.
- Optional desktop alerts through the browser's Notification API, shown when the DOC tab is in the background.
- Top bar now moves the menu to its own row below 860 px so the bell fits.

Tested in the browser with two demo accounts: each event reaches the right person, the badge appears within 10 seconds, clicking an item opens the booking and clears it, and one user cannot read or clear another's notifications. Desktop alerts could not be tested because the test browser blocks notification permission. There is still no SMS, WhatsApp or email: a person with the app closed is not reached.

## 0.1.2 — 2026-11-16 — Full-page Google sign-in, UI renamed to DOC

- Sign-in page has a second route, "Sign in with Google in this tab instead": a full-page redirect to Google that returns an ID token to `/login`. It exists for browsers that block the Google pop-up. The server checks the nonce on this route.
- Added `http://localhost:5173/login` as an authorised redirect URI on the Google client.
- The interface now shows the name **DOC** (top bar, page title, footer, verified note). Owner's decision.
- Project put under git and pushed to a private GitHub repository.

Tested in the browser: full-page Google sign-in with the dev account completes, the account gets the admin role and its Google photo. The pop-up button renders and opens Google's pop-up, but the pop-up route itself was not completed in testing because the test browser blocks automated pop-ups.

## 0.1.1 — 2026-11-16 — Google sign-in configured

- Created Google Cloud project `driver-on-call-514918` with a consent screen (External, Testing) and a Web OAuth client for `http://localhost:5173`. Details are in the README.
- `server/.env` now holds the Client ID and one admin email. The dev account is the only test user so far.
- The API reads `API_PORT` instead of `PORT` in development, so it no longer collides with tools that set `PORT` for the web server.
- Sign-in page: the Google button is now initialised once instead of on every auth change.

The "Continue with Google" button renders with no origin error. A full Google sign-in has to be done by the account owner in the browser.

## 0.1.0 — 2026-11-16 — First working prototype

- Customer flow: search by location (place search or current location), start time, plan (hour / day / week) and radius; list and map of nearby drivers with price, rating and availability; public driver profile; booking request.
- Driver flow: application form with licence and identity details, three file uploads, rates, base location and weekly working hours; pending / rejected / approved states; dashboard to edit the listing or pause it; accept, decline, complete and mark-paid actions.
- Admin flow: verification queue with document viewer, approve, reject with reason, remove an approved driver, basic counts.
- Phone numbers revealed only after the driver accepts. In-app chat per booking. Two-way ratings after completion.
- Google sign-in (off until a client ID is configured) and a demo login for development.
- Ad placeholders on search, driver, booking and list pages.
- Seed script with demo accounts; `npm run reset` to start over.

Checked by hand in the browser on this date: search, booking request, chat, accept, phone reveal, double-booking rejection, completion, reviews, driver application with uploads, admin approve and reject, document access rules, mobile layout. There are no automated tests yet. Google sign-in has not been exercised because no client ID was configured.
