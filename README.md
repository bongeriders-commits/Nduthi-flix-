# Nduthi Flix — Setup Guide

## What's built so far
- `login.html` + `js/auth.js` — phone number + OTP sign-in, first-time rider name setup
- `index.html` + `js/feed.js` — vertical swipe feed, autoplay on scroll, likes
- `upload.html` + `js/upload.js` — pick/record a video (max 60s, 80MB), upload with progress, post to feed
- `profile.html` — view your info, veed count, sign out
- `firestore.rules` / `storage.rules` — security rules to deploy
- `manifest.json` — for PWABuilder packaging into an Android APK

## Step 1 — Create your Firebase project
1. Go to console.firebase.google.com → **Add project** → name it `nduthiflix` (or similar). Keep it separate from `bonge-96f37`.
2. In the project, click **Add app → Web**, register it, and copy the `firebaseConfig` object.
3. Paste those values into `js/firebase-config.js` (replace the `PASTE_YOUR_...` placeholders).

## Step 2 — Turn on the services you need
In the Firebase console:
- **Authentication → Sign-in method → Phone** → Enable
  - Note: Phone auth requires the **Blaze (pay-as-you-go)** plan once you're live. Test numbers work free during development.
- **Firestore Database → Create database** → Start in production mode
- **Storage → Get started**

## Step 3 — Deploy the security rules
Using Firebase CLI on a computer (or Firebase Console's Rules tab, which you can paste into directly from your phone browser):
- Paste `firestore.rules` into Firestore → Rules tab → Publish
- Paste `storage.rules` into Storage → Rules tab → Publish

## Step 3.5 — Enable downloads (Storage CORS)
The **Save** button on each veed fetches the video file directly so it can trigger a real download. Firebase Storage blocks that kind of cross-origin fetch by default, so you'll need to allow it once:
1. Install the Google Cloud CLI (`gcloud`) on a computer, or use Cloud Shell in the Firebase/GCP console (works from a browser, no install needed).
2. Create a file `cors.json`:
   ```json
   [{"origin": ["*"], "method": ["GET"], "maxAgeSeconds": 3600}]
   ```
3. Run: `gsutil cors set cors.json gs://YOUR_PROJECT.appspot.com`

Until this is set, tapping Save will fall back to opening the video in a new tab, where the person can long-press and save it manually — still works, just an extra step.

## Step 3.6 — (Optional) Background music on seeded clips
Pexels clips are silent stock footage. If you want seeded veeds to have a mood-matched background track instead of dead silence, set up Jamendo:

1. Go to [devportal.jamendo.com](https://devportal.jamendo.com/) and sign up (free, instant).
2. Click **Create a new application** — name it anything, e.g. "Nduthi Flix".
3. Pick the free **Read only** plan.
4. Copy the **Client ID** and paste it into `js/jamendo-config.js`, replacing the placeholder (or just paste it into the "Jamendo API key" field on the seed page itself — it's saved locally in your browser either way).

The actual merging of music onto a clip happens server-side via `/api/merge-music` (see Step 4 below for what that needs) — the seed page just picks a matching track and calls that endpoint before posting. If you skip this setup entirely, seeding still works exactly as before, just silent.

## Step 4 — Host it
Same as Bonge Riders: push this folder to a GitHub repo, connect it to Vercel, deploy. Free tier is fine to start.

This project now includes one serverless function, `api/merge-music.js`, which needs the `ffmpeg-static` npm package. Before your first deploy (or if it's missing), run this in the project folder:
```
npm install ffmpeg-static
```
Commit the resulting `package.json` / `package-lock.json` so Vercel installs it automatically on deploy. If you never set up Jamendo (Step 3.6), this function simply never gets called — no extra cost or setup needed.

**A couple of real limits to know about with this function**, since it's running on Vercel's free Hobby tier:
- **Timeout**: `vercel.json` sets it to 60 seconds (the max Hobby allows). Slow downloads of the source clip/track could occasionally hit that ceiling and fail — if so, the seed page just falls back to posting that one clip silent.
- **Function size**: `ffmpeg-static` bundles a real ffmpeg binary (tens of MB). This is a common thing to deploy on Vercel and usually fits fine, but if a deploy ever fails with a function-size error, that's why — worth knowing before you're stuck debugging it blind.

## Step 5 — Package as an Android APK
1. Once it's live on Vercel, go to **pwabuilder.com**
2. Enter your Vercel URL
3. Generate the Android package
4. You'll need app icons at `icons/icon-192.png` and `icons/icon-512.png` — a simple amber "NF" mark on black works well and matches the app's look

## Guest browsing
The feed, video playback, and rider names are all public — anyone can open the app and scroll veeds without an account. Liking, commenting, uploading, and viewing a profile page require signing in; tapping those as a guest prompts a "sign in to continue" dialog instead of silently failing. This is enforced both in the app UI and in `firestore.rules` / `storage.rules`, so it holds even if someone bypasses the UI.

## Scaling reality check
Someone asked whether this can serve a billion users. Being straight about it: this stack (Firebase free/low tiers + a single Vercel deployment) is built for a launch audience — hundreds to low thousands of riders. Getting toward TikTok-scale (billions) means global CDN edge nodes, video transcoding pipelines, ML-ranked feeds, sharded multi-region databases, and engineering teams in the hundreds — it's a different project, not a code tweak.

What's realistic and already done: the feed now paginates (see below), which is the first real scaling step. Rough next milestones if this grows:
- **Hundreds of users:** current stack is fine as-is.
- **Thousands–tens of thousands:** add Storage CDN caching, move like-counting to Cloud Functions with sharded counters (a single Firestore document can only take ~1 write/sec safely), add composite indexes as query patterns grow.
- **Hundreds of thousands+:** move video delivery off Firebase Storage to a real video CDN (e.g. Cloudflare Stream, Mux, Bunny Stream) with adaptive bitrate streaming; add a proper backend queue for uploads/transcoding.
- **Millions+:** this is a full platform rebuild — dedicated infra team, multi-region data, real recommendation systems.

## Feed pagination (added)
The feed now loads 8 videos at a time instead of 20 all at once, and fetches the next 8 automatically as the person scrolls near the bottom (infinite scroll via a sentinel element). On top of that, each video's file only loads once its slide is about to enter the viewport, and unloads again once scrolled well past — so the feed's memory and bandwidth use stays roughly flat no matter how many videos exist in Firestore.

## Known limits to plan around (flagging honestly)
- **No real video compression yet.** The 60-second / 80MB caps keep Storage bandwidth costs sane for now, but a proper compression step (e.g. via a Cloud Function with ffmpeg) would help once you have real traffic.
- **Firestore reads for likes** load the user's entire like list on every feed load — fine for now, but will need pagination once someone has liked hundreds of videos.
- **No comments UI yet** — the data model (`videos/{id}/comments`) and rules are ready, but the comment screen isn't built.
- **No recommendation algorithm** — feed is just newest-first. Fine for launch; worth revisiting once you have real usage data.

## Suggested next build session
1. Comments screen
2. Follow system + a real "Following" tab (the tab exists in the UI but isn't wired up yet)
3. Report/block for moderation — important before wider rollout
4. App icons + splash screen graphics
