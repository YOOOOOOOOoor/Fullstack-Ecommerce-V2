# Frontend

This folder contains the React storefront and admin dashboard, built with Vite.

## Setup

1. Copy `.env.example` to `.env` and set `VITE_API_URL` to the backend API root (including `/api`). Set `VITE_GOOGLE_CLIENT_ID` if Google sign-in is enabled.
2. Run `npm install`.
3. Run `npm run dev` for local development.

## Commands

- `npm run dev` — start the Vite development server.
- `npm run lint` — run ESLint.
- `npm run build` — create the production bundle in `dist/`.
- `npm run preview` — serve the production bundle locally.

Vite exposes `VITE_*` variables to browser code. Only public values such as the Google OAuth client ID belong there; API secrets and database credentials must stay in the backend environment.

For full-stack setup, database configuration, and deployment notes, see the root README.
