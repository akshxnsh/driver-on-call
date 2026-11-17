# Product notes and decisions

Last updated: 2026-11-16

## What it is

A marketplace where a car owner hires an independent driver for their own car. The customer searches by location and a From/To time, picks a driver, and sends a request. The driver accepts, arrives at the pickup point, and drives the customer's vehicle. The model is "BlaBlaCar for hired drivers": trust-first profiles, request then accept, contact shared only after confirmation, money settled directly between the two people.

## Decisions made by the owner

| Topic | Decision |
| --- | --- |
| Market | India first: rupees, +91 mobile numbers, Aadhaar / PAN / Voter ID / Passport as identity proof |
| Matching | Customer picks a driver from a list and map, driver accepts or declines |
| Booking times | Customer gives a From and a To date and time (decided 2026-11-17), not a start plus a number of hours |
| Pricing | Each driver sets their own hourly, daily and weekly rate |
| Revenue | Ad-based. Commission was rejected because customers and drivers can exchange numbers and bypass it |
| Contact | Phone numbers are revealed to both sides only after the driver accepts |
| Payment | Customer pays the driver directly (cash or UPI). The app never handles money |
| Sign-in | Google sign-in, plus a demo login for development |
| Stack | Node/Express + React |
| Availability | Driver sets weekly working days and hours; accepted bookings block those slots |
| Listing | A driver is visible only after an admin approves their documents |
| Extras in v1 | Map view, in-app chat, ratings and reviews, ad placeholders |
| Display name | The interface shows **DOC** (decided 2026-11-16) |
| Source control | Commit to git as work progresses; private GitHub repository |
| Interface style | Minimal and easy to scan: few small grey descriptions, generous spacing (decided 2026-11-17). New screens should add helper text only where it prevents a mistake |

## Decisions made during the build (owner said "use your judgment")

| Topic | Choice | Why |
| --- | --- | --- |
| Database | SQLite via Node's built-in `node:sqlite` | Nothing to install; a single file. Schema is plain SQL, so moving to PostgreSQL later is straightforward |
| Maps and place search | Leaflet + OpenStreetMap tiles + Nominatim | Free, no API key. Nominatim's public server is rate-limited (about 1 request per second) and must be replaced before real traffic |
| Chat | Tied to a booking request; polling every 3 seconds | Simple and reliable for a prototype. Swap to WebSockets when volume needs it |
| One account, two roles | The same user can hire drivers and also be a driver | Matches the "Register as Driver" option in the brief |
| Price for a span | The exact time between From and To is priced, to the minute (owner decision, 2026-11-17). Whole weeks at the weekly rate, whole days at the day rate, leftover hours pro rata at the hourly rate; leftover hours never cost more than one day rate, and days plus hours never more than one week rate. Maximum 12 weeks | The owner asked for exact counting; the caps were my addition so a long job is never dearer than the driver's own day or week rate. A day is exactly 24 hours |
| Availability for long bookings | The From time must be inside the driver's working hours that day, and no accepted booking may overlap. A same-day booking must also end inside working hours | Checking every individual day of a multi-day hire (for example a Sunday off in the middle) is left for later |
| "Mark as paid" | Only the driver can mark a booking paid | The driver is the one who receives the money |
| Completing a job | Driver can mark an accepted job completed at any time | Lets the flow be demonstrated without waiting for the real date. Tighten before launch |
| Phone verification | One-time code by text before a number can be used to book or drive (owner decision, 2026-11-17). Sending is stubbed until an SMS provider is chosen | Real numbers stop fake accounts and let the driver and customer reach each other once a booking is accepted. Open: which provider (MSG91, Twilio, Firebase), and DLT template registration for India |
| Notifications | In-app bell plus optional browser desktop alerts, polled every 10 seconds; chat messages collapse to one line per booking | Works with no third-party account. SMS / WhatsApp / email left as one hook because they need a paid provider |
| Phone UI | One responsive web app with a phone layout and home-screen install (PWA), not a separate native app | One codebase serves web and phone now. A native Android / iOS app (or wrapping this one for the app stores) is a later step if store presence or push notifications are needed |
| Demo data | 8 approved drivers near MG Road Bengaluru, 2 customers, 1 admin, 1 pending application | Enough to exercise every screen |

## Where we deliberately do not copy BlaBlaCar

These are places where following BlaBlaCar's approach would be a problem for this product.

1. **Search by route vs search by place and time.** BlaBlaCar matches a route (A to B on a date). We hire a person for a duration, so search is "who is free near me at this time for this long".
2. **Verification.** BlaBlaCar lets people list with light, mostly optional verification. Here a stranger drives the customer's car, so nobody is listed until an admin has checked their licence and identity proof.
3. **Messaging before booking.** BlaBlaCar lets anyone message a member before booking. Ours opens chat only once a request exists, which keeps strangers from spamming drivers and keeps conversations attached to a booking.
4. **Reviews.** BlaBlaCar hides reviews until both sides have written one, to stop retaliation. Ours publishes immediately. This is simpler but weaker; see open items.
5. **Price control.** BlaBlaCar caps prices because it is cost sharing. Our drivers are earning a living, so they set their own rates freely.

## Open risks and questions for the owner

These are not solved by the prototype and need a decision before a real launch.

1. **Liability and insurance.** If a hired driver damages the customer's car or injures someone, who pays? The customer's motor insurance normally covers a licensed driver, but the platform needs clear terms of use, and probably a damage-dispute process. Get legal advice.
2. **Driver background checks.** Admin currently checks documents by eye. Consider police verification, or a DigiLocker / Parivahan licence check API.
3. **Storing identity documents.** Aadhaar and licence images are personal data under the DPDP Act 2023. They are access-controlled but stored unencrypted on the server disk. Before launch: encrypted storage, a retention policy, a privacy policy and consent text.
4. **Ad revenue size.** Ads pay very little until traffic is large. Options that cannot be bypassed like commission can: paid "featured driver" placement in search, a small monthly listing fee for drivers after a free period, or a paid "priority verification".
5. **No-shows and cancellations.** Nothing stops either side cancelling late. Options: show cancellation counts on profiles, or suspend repeat offenders.
6. **Safety features.** No SOS button, trip sharing or live tracking yet.
7. **Reviews.** Consider BlaBlaCar-style "both submit before either is shown".
8. **Text messages.** Phone verification and out-of-app notifications both need an SMS provider; neither sends real texts yet.
9. **Notifications outside the app.** In-app notifications and desktop alerts exist (since 0.2.0), but they only reach someone who has DOC open in a browser tab. A driver with the app closed still hears nothing. Real use needs SMS or WhatsApp (for example MSG91 or Twilio in India), which needs a paid provider account and, for SMS, DLT template registration. The hook is `notify()` in `server/src/notify.js`.
9. **Time zone.** Working hours are evaluated in the server's time zone. Run the server in IST, or store a time zone per driver if the service expands.

## Not built yet

SMS / WhatsApp / email notifications, online payment, live tracking, outstation / one-way trip types, driver earnings report, customer saved addresses and cars, admin user management, real ad network integration, automated tests, deployment.
