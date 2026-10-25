# Fullstack E-commerce

A React storefront and admin dashboard backed by an Express API and PostgreSQL. The app supports customer accounts (email/password and Google sign-in), product catalog and image uploads, carts, wishlists, reviews, order management, analytics, and Chapa checkout.

## Project layout

- `Frontend/` — React 19, Vite, React Router, Axios, Tailwind CSS, and the customer/admin interfaces.
- `Backend/` — Express API, PostgreSQL access, JWT cookie authentication, Cloudinary uploads, and Chapa integration.
- `database/schema.sql` — PostgreSQL schema for the application.

## Requirements

- Node.js 20 or newer and npm.
- PostgreSQL 14 or newer (local or hosted).
- Optional accounts/configuration for Google OAuth, Cloudinary, and Chapa.

## Local setup

1. Run `psql -U postgres -f database/schema.sql`. This script creates and selects the `ecommerce_db` database before creating its tables and types.
2. Copy `Backend/.env.example` to `Backend/.env` and set database credentials plus a long, random `JWT_SECRET`.
3. Copy `Frontend/.env.example` to `Frontend/.env`. Keep `VITE_API_URL` pointed at the backend API and add the public Google OAuth client ID if using Google sign-in.
4. In `Backend/`, run `npm install`, then `npm run dev` for development or `npm start` for production.
5. In `Frontend/`, run `npm install`, then `npm run dev`.

The development frontend defaults to `http://localhost:5173` and the backend to port `8000`. Keep `CLIENT_URL` aligned with the frontend origin. Use HTTPS in production so the authentication cookie can be sent securely.

The backend creates an initial admin only when both `ADMIN_EMAIL` and `ADMIN_PASSWORD` are configured. Use a unique, strong password and remove the variables after provisioning. The application does not contain a default admin password.

## Environment variables

See the two `.env.example` files for the complete variable names. `DATABASE_URL` takes precedence over the local `DB_*` fields. Hosted database TLS certificate checks are enabled by default; only set `DB_SSL_REJECT_UNAUTHORIZED=false` for a trusted database endpoint that requires it. Google sign-in requires matching frontend/backend OAuth client configuration. Product/avatar uploads require Cloudinary credentials. Chapa checkout requires `CHAPA_SECRET_KEY`; it must remain backend-only. Never use private credentials in `VITE_*` variables.

## Useful commands

From `Frontend/`:

- `npm run dev` — start Vite.
- `npm run build` — create the production frontend build.
- `npm run lint` — run ESLint.
- `npm run preview` — preview the production build locally.

From `Backend/`:

- `npm run dev` — run the API with nodemon.
- `npm start` — run the API with Node.js.

## Deployment

Deploy `Frontend/` as the Vercel project root and configure `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID` as build-time variables. The Vercel rewrite in `Frontend/vercel.json` supports client-side routes. Deploy `Backend/` as a Render Node service using `npm start`, and configure its environment variables in Render. Set `CLIENT_URL` to the exact deployed frontend origin, provide the hosted PostgreSQL connection string, and configure HTTPS-compatible Google OAuth and Chapa dashboard URLs. Do not commit deployment secrets.

### Driver background assignment notifications

The driver portal supports opt-in Web Push when the API is configured. Apply `database/migrations/20261102_driver_web_push.sql` to the intended database. Generate a VAPID key pair from `Backend/` with `npx web-push generate-vapid-keys`, then set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, and a valid `WEB_PUSH_SUBJECT` (`mailto:...` or an HTTPS URL) in the Render service environment. The private key must remain on Render; the authenticated driver settings endpoint returns only the public key. Vercel must serve the frontend over HTTPS so its service worker can register.

Drivers explicitly enable notifications in Driver Settings. Chromium, Firefox, and supported Safari versions can receive system push notifications while the app is backgrounded, subject to browser permission, device connectivity, and power settings. On iOS/iPadOS, install the site to the Home Screen and use a version that supports Web Push. When the dashboard is open it plays the driver's selected sound; when backgrounded, notification sound is controlled by the browser/device. A website cannot reliably play its custom audio after the page or browser is closed. The existing 15-second polling and in-page sound remain the fallback when push is unavailable. Configure the migration and VAPID variables before asking drivers to enable this feature.

## Security notes

Authentication is stored in an HTTP-only cookie. Admin API routes use backend role checks. Payment verification must be performed by the backend with Chapa; a browser redirect alone is not payment confirmation. Review deployment logs, provider configuration, and exposed credentials before production use. See the audit summary in the project handoff for known items that still need manual verification.
