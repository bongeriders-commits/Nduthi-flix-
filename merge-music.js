// ============================================
// NDUTHI FLIX — /api/merge-music
// ============================================
// Server-side merge of a Pexels seed clip + a matching Jamendo background
// track, so seeded "veeds" don't feel dead-silent in the feed.
//
// Why this runs on the server instead of in the browser: doing this kind of
// audio/video mux with ffmpeg.wasm in a plain (no-bundler) HTML page is
// fragile — it needs a ~25-30MB WASM engine and has known init bugs outside
// of bundled apps. Real ffmpeg on the server is far more reliable, and
// downloading the source files server-side sidesteps any browser CORS
// issues with the Pexels/Jamendo CDNs entirely.
//
// Called from js/seed.js as: POST /api/merge-music
//   body: { videoUrl, audioUrl, durationSec }
//   returns: raw video/mp4 bytes (the merged clip)
//
// Setup: this needs the "ffmpeg-static" npm package. See package.json —
// if you don't already have one, run `npm install ffmpeg-static` in this
// folder before deploying, and make sure package.json + package-lock.json
// get committed and pushed (Vercel installs them automatically on deploy).
//
// Vercel plan note: this is configured for a 60-second max duration (see
// vercel.json). That's the ceiling for both Hobby and default Pro — if a
// merge times out on a slow connection, it'll return a 504. The video
// stream is copied (not re-encoded), so the actual ffmpeg work is fast;
// most of the time budget goes to downloading the two source files.

const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');

function download(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (response) => {
      // Follow redirects (Pexels/Jamendo CDN links sometimes 301/302)
      if (
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location &&
        redirectsLeft > 0
      ) {
        response.resume();
        download(response.headers.location, destPath, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed (${response.statusCode}): ${url}`));
        response.resume();
        return;
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
    req.on('error', reject);
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-1000)}`));
    });
  });
}

function cleanup(paths) {
  paths.forEach((p) => {
    fs.unlink(p, () => {});
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' });
    return;
  }

  const { videoUrl, audioUrl, durationSec } = req.body || {};

  if (!videoUrl || !audioUrl || !durationSec || durationSec <= 0) {
    res.status(400).json({ error: 'videoUrl, audioUrl, and a positive durationSec are required' });
    return;
  }

  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpDir = os.tmpdir();
  const videoPath = path.join(tmpDir, `${jobId}_in.mp4`);
  const audioPath = path.join(tmpDir, `${jobId}_in.mp3`);
  const outputPath = path.join(tmpDir, `${jobId}_out.mp4`);
  const cleanupPaths = [videoPath, audioPath, outputPath];

  try {
    await Promise.all([download(videoUrl, videoPath), download(audioUrl, audioPath)]);

    // Trim the music to the clip's length and fade the last second so it
    // doesn't cut off abruptly. Video stream is copied untouched (fast,
    // no re-encode) — only the audio track is replaced.
    const fadeStart = Math.max(durationSec - 1, 0.5);
    const args = [
      '-y',
      '-i', videoPath,
      '-i', audioPath,
      '-filter_complex', `[1:a]atrim=0:${durationSec},afade=t=out:st=${fadeStart}:d=1[a]`,
      '-map', '0:v:0',
      '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-shortest',
      outputPath,
    ];

    await runFfmpeg(args);

    const outBuffer = fs.readFileSync(outputPath);
    res.setHeader('Content-Type', 'video/mp4');
    res.status(200).send(outBuffer);
  } catch (err) {
    console.error('merge-music failed:', err.message);
    res.status(500).json({ error: err.message || 'Merge failed' });
  } finally {
    cleanup(cleanupPaths);
  }
};
