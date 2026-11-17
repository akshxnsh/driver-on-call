# Driver-On-Call (DOC)

The app shows its name as **DOC** in the interface. "Driver-On-Call" remains the project name and the name on Google's sign-in screen.

Find a verified driver near you and hire them by the hour, day or week. The driver comes to your location at the agreed time and drives **your own vehicle**.

This is a working web prototype: React frontend, Node/Express API, SQLite database.

## Run it

Needs Node.js 22.13 or newer (it uses Node's built-in SQLite, so there is no database to install).

First time only:

```bash
npm run setup
```

Every time:

```bash
npm run dev
```

Then open http://localhost:5173. The API runs on port 4000 and the web app proxies `/api` to it.

| Command | What it does |
| --- | --- |
| `npm run setup` | Installs everything, creates `server/.env`, seeds demo data |
| `npm run dev` | Starts API and web app with live reload |
| `npm run dev:phone` | Same, and also reachable from phones on the same Wi-Fi |
| `npm test` | Runs the end-to-end test suite on a throwaway database (about a minute) |
| `npm run reset` | Deletes the database and uploads, then seeds fresh demo data (stop `dev` first) |
| `npm run build` then `npm start` | Production mode: Express serves the built web app on one port |

## Use it on a phone

The same web app has a phone layout (bottom tab bar, list/map switch) for screens narrower than 720 px, and can be added to the home screen.

To open it on a real phone during development, put the phone on the same Wi-Fi as this computer and run:

```bash
npm run dev:phone
```

The terminal prints a "Network" address such as `http://192.168.1.20:5173`; open that on the phone. Windows may ask to allow Node through the firewall the first time. Over a plain `http://` network address, three things do not work, because browsers and Google require HTTPS or `localhost` for them: "Use my location", Google sign-in, and installing to the home screen. Place search and the demo login work, so the full flow can still be tried. All three work once the app is deployed on an `https://` address.

## Try the full flow

Demo mode is on by default, so the sign-in page lists sample accounts.

1. **Customer:** sign in as *Priya Sharma*. On the home page search "MG Road Bengaluru", set From and To to a time during the day, press Find drivers, and choose one. Send a request.
2. **Driver:** sign out, sign in as that driver, open *My bookings → Requests for me as driver*, accept. Both sides now see each other's phone number and can chat.
3. **Finish:** as the driver, mark the job completed. Each side can then rate the other.
4. **Become a driver:** sign in as *Arjun Mehta*, click *Register as driver*, fill the form and upload three files.
5. **Admin:** sign in as *Admin (demo)*, open *Admin*, view the documents, approve or reject. Approved drivers appear in search.

Searching somewhere other than Bengaluru? When no drivers are found, demo mode shows an *Add demo drivers near here* button.

## Google sign-in

Set up on 2026-11-16 for local development:

- Google Cloud project **Driver-On-Call** (ID `driver-on-call-514918`), owned by the project's dev Google account.
- Consent screen: app name "Driver-On-Call", audience **External**, publishing status **Testing**.
- OAuth client "Driver-On-Call web (local dev)", type Web application, allowed origins `http://localhost:5173` and `http://localhost`. No client secret is used: the app only verifies Google ID tokens.
- The same client has one authorised redirect URI, `http://localhost:5173/login`. It serves the "Sign in with Google in this tab instead" link on the sign-in page, a full-page fallback for browsers that block the Google pop-up.
- The Client ID and the admin email live in `server/.env` (`GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`), which is not committed.

While the status is **Testing**, only Google accounts listed under *Google Auth Platform → Audience → Test users* can sign in (limit 100). To let anyone sign in, press *Publish app* on that page; basic sign-in needs no Google verification.

To set it up again elsewhere (for example a deployed site): add the site's `https://` address under the client's *Authorised JavaScript origins* and `<address>/login` under *Authorised redirect URIs*, put the Client ID in that server's environment, and list admin emails in `ADMIN_EMAILS`. Restart the server after changing `.env`.

Before going live set `DEMO_MODE=false`; this removes the demo login and the demo-driver button.

## Real text messages for phone verification (Twilio, free trial)

By default (demo mode) no text is sent and the Verify card shows the code on screen. To send real texts:

1. Create a free account at twilio.com. It asks you to verify your own phone number.
2. In the Twilio Console, create a **Verify service** (Verify → Services). Copy its Service SID, which starts with `VA`.
3. From the Console home page copy your Account SID (starts with `AC`) and Auth Token.
4. Put the three values in `server/.env` as `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SERVICE_SID`, then restart `npm run dev`. Never commit or share the Auth Token.
5. While on the trial, Twilio only texts numbers listed under Phone Numbers → Verified Caller IDs (up to 5). Add the numbers you want to test with. You may also need to allow India under Verify → Settings / Messaging → Geo permissions.

When the three values are set, Twilio is used even if `DEMO_MODE=true`. To go public, upgrade the Twilio account (the five-number limit goes away), or swap the two functions in `server/src/otp.js` for another provider.

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md): what the product does, every decision taken and why, where it differs from BlaBlaCar, open risks.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code layout, data model, API reference, security notes.
- [docs/CHANGELOG.md](docs/CHANGELOG.md): what changed and when.
