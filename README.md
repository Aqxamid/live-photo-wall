# Live Photo Wall

A lightweight React + Vite web app that lets guests snap live event photos from their device camera, submit them to Supabase storage, and display approved images on a live wall. An admin console provides moderation controls for approving or rejecting guest uploads.

## Project Overview

The app is designed for real-time event photo sharing with three main experiences:

- **Guest Camera**: Capture a camera snapshot, apply a Polaroid-style frame, upload the image to Supabase storage, and queue it for moderation.
- **Live Wall**: Display a live, real-time gallery of approved photos using Supabase realtime updates.
- **Admin Console**: Authorize moderators to sign in, review pending photos, and approve or reject them.

## Key Features

- Camera capture with browser `MediaDevices.getUserMedia`
- On-device image composition using HTML canvas
- File upload to Supabase Storage
- Photo metadata persisted in Supabase Postgres
- Real-time updates via Supabase realtime channels
- Email/password moderator authentication
- Simple client-side routing with button-based navigation

## Technology Stack

- React 18
- Vite
- Supabase JavaScript SDK
- Supabase Auth, Postgres, Storage, Realtime

## Repository Structure

- `src/`
  - `App.jsx` — application router and navigation
  - `main.jsx` — React entrypoint
  - `supabaseClient.js` — Supabase client initialization using environment variables
  - `components/`
    - `GuestCamera.jsx` — camera capture and upload flow
    - `LiveWall.jsx` — approved photo gallery with realtime updates
    - `AdminConsole.jsx` — login and pending photo moderation

## Environment Setup

Create a `.env` file in the project root and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> Keep your credentials private and do not commit `.env` to source control.

## Supabase Configuration

The application expects the following Supabase resources:

- **Storage bucket**: `event-photos`
  - Used to store guest-uploaded photos.
- **Table**: `photos`
  - Required columns:
    - `id` — primary key
    - `image_url` — text
    - `status` — text, should use values such as `pending`, `approved`, `rejected`
    - `created_at` — timestamptz default `now()`

The admin interface requires Supabase Auth users for moderator sign-in.

## Scripts

Use the following commands from the project root:

```bash
npm install
npm run dev
npm run build
npm run preview
```

- `npm run dev` — start the Vite development server
- `npm run build` — build the production bundle
- `npm run preview` — preview the production build locally

## Usage

1. Start the app with `npm run dev`
2. Open the browser at the local Vite URL (usually `http://localhost:5173`)
3. Use the nav buttons to switch between:
   - `Guest Camera` to capture and submit photos
   - `Live Wall` to view approved images in real-time
   - `Admin Console` to moderate pending uploads

## Component Behavior

### GuestCamera
- Requests camera access
- Captures a square snapshot
- Draws a white Polaroid frame and caption using canvas
- Uploads the final JPEG to Supabase Storage
- Creates a `photos` record with status `pending`

### LiveWall
- Loads approved photos from `photos` where `status = approved`
- Subscribes to realtime `UPDATE` events for approved photos
- Renders photos in a responsive grid

### AdminConsole
- Supports moderator login using Supabase Auth
- Loads pending photos from `photos` where `status = pending`
- Subscribes to realtime `INSERT` events for new pending uploads
- Approves or rejects photos by updating the `status`

## Notes

- The app uses client-side routing and does not require a formal router package.
- The camera feature works best on devices with a supported browser and HTTPS context.
- The app currently stores images publicly via Supabase storage public URLs.

## License

This repository has no license specified. Add a `LICENSE` file if you want to open-source the project.
