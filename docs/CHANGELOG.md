# Changelog

Newest first. Add an entry whenever behaviour, data model or a product decision changes, and update PRODUCT.md or ARCHITECTURE.md in the same change.

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
