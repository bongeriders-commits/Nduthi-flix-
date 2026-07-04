// ============================================
// NDUTHI FLIX — Jamendo background-music key
// ============================================
// Used by js/seed.js to pull a free, royalty-free background track that
// roughly matches the mood of each seeded Pexels clip, so silent stock
// footage doesn't feel dead in the feed. The clip + track get merged
// server-side by /api/merge-music before the veed is posted.
//
// Get a free key:
// 1. Go to https://devportal.jamendo.com/ and sign up (free, instant).
// 2. Click "Create a new application" — name it anything, e.g. "Nduthi Flix".
// 3. Pick the free "Read only" plan — that's all seed.js needs (it only
//    searches and streams tracks, never writes to your Jamendo account).
// 4. Copy the "Client ID" shown on your application's page and paste it
//    below, replacing the placeholder.
//
// Like the Pexels key, this ships inside the app bundle and is visible in
// page source. That's expected — Jamendo client IDs are public identifiers
// meant for exactly this, not secret backend credentials. This file is
// only loaded by seed.html (the admin-only seeding tool).
//
// If you leave the placeholder in place, seed.js will simply skip the
// music-matching step and post seeded clips silent, same as before.
const JAMENDO_CLIENT_ID = "6504d872";
