// ============================================
// NDUTHI FLIX — Feed seeding tool (admin use)
// Pulls free-license stock clips from Pexels and
// posts them into the same `videos` collection the
// app's real upload flow writes to.
// ============================================

const apiKeyInput = document.getElementById('apiKeyInput');
const jamendoKeyInput = document.getElementById('jamendoKeyInput');
const musicToggle = document.getElementById('musicToggle');
const displayNameInput = document.getElementById('displayNameInput');
const tagInput = document.getElementById('tagInput');
const queryInput = document.getElementById('queryInput');
const searchBtn = document.getElementById('searchBtn');
const resultsGrid = document.getElementById('resultsGrid');
const statusLine = document.getElementById('statusLine');
const actionsBar = document.getElementById('actionsBar');
const postBtn = document.getElementById('postBtn');
const clearBtn = document.getElementById('clearBtn');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const selCountEl = document.getElementById('selCount');

let currentUser = null;
let currentQuery = '';
let currentPage = 1;
let selected = new Map(); // videoId -> { fileUrl, photographer, sourceId, previewImage, duration }

// Rough keyword → Jamendo mood/genre tag mapping. Falls back to a generic
// "upbeat" tag when nothing matches, so every search still gets *some*
// reasonable music rather than none.
const MOOD_MAP = [
  { keywords: ['motorbike', 'motorcycle', 'boda', 'rider', 'commute', 'traffic', 'delivery'], tags: 'energetic,driving' },
  { keywords: ['city', 'urban', 'street', 'market'], tags: 'urban,energetic' },
  { keywords: ['sunset', 'sunrise', 'calm', 'nature', 'relax'], tags: 'chill,relaxation' },
  { keywords: ['night', 'party', 'club'], tags: 'electronic,energetic' },
  { keywords: ['africa', 'african'], tags: 'world,upbeat' },
];

function moodTagsForQuery(query) {
  const q = (query || '').toLowerCase();
  const match = MOOD_MAP.find(m => m.keywords.some(k => q.includes(k)));
  return match ? match.tags : 'upbeat,energetic';
}

// Reuse the phone-auth session. A seed account needs to satisfy the same
// firestore.rules as a real rider (must be signed in; uid on the doc must
// match auth.uid), so send unauthenticated visitors to log in first.
auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = user;
});

// Restore a locally-saved key so it doesn't need retyping every session.
// Stored client-side only — never written to Firestore.
apiKeyInput.value = localStorage.getItem('nf_pexels_key') || '';
apiKeyInput.addEventListener('change', () => {
  localStorage.setItem('nf_pexels_key', apiKeyInput.value.trim());
});

jamendoKeyInput.value = localStorage.getItem('nf_jamendo_key') || (typeof JAMENDO_CLIENT_ID !== 'undefined' && JAMENDO_CLIENT_ID.indexOf('PASTE_') !== 0 ? JAMENDO_CLIENT_ID : '');
jamendoKeyInput.addEventListener('change', () => {
  localStorage.setItem('nf_jamendo_key', jamendoKeyInput.value.trim());
});

searchBtn.addEventListener('click', () => {
  currentQuery = queryInput.value.trim();
  currentPage = 1;
  selected.clear();
  updateActionsBar();
  if (!currentQuery) {
    setStatus('Type a search term first.', 'err');
    return;
  }
  runSearch(true);
});

loadMoreBtn.addEventListener('click', () => {
  currentPage += 1;
  runSearch(false);
});

clearBtn.addEventListener('click', () => {
  selected.clear();
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  updateActionsBar();
});

postBtn.addEventListener('click', postSelected);

function setStatus(msg, kind) {
  statusLine.textContent = msg;
  statusLine.className = 'status-line' + (kind ? ' ' + kind : '');
  statusLine.classList.toggle('hidden', !msg);
}

async function runSearch(replace) {
  const key = apiKeyInput.value.trim();
  if (!key) {
    setStatus('Paste your Pexels API key first (free at pexels.com/api).', 'err');
    return;
  }
  localStorage.setItem('nf_pexels_key', key);

  searchBtn.disabled = true;
  loadMoreBtn.disabled = true;
  setStatus('Searching Pexels...', '');

  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(currentQuery)}&per_page=15&page=${currentPage}&orientation=portrait`;
    const res = await fetch(url, { headers: { Authorization: key } });

    if (res.status === 401) {
      setStatus('Pexels rejected that API key — double check it at pexels.com/api.', 'err');
      return;
    }
    if (!res.ok) {
      setStatus(`Pexels request failed (${res.status}). Try again in a moment.`, 'err');
      return;
    }

    const data = await res.json();
    if (replace) resultsGrid.innerHTML = '';

    if (!data.videos || data.videos.length === 0) {
      if (replace) setStatus('No results for that search — try a different term.', 'err');
      loadMoreBtn.classList.toggle('hidden', true);
      return;
    }

    data.videos.forEach(renderCard);
    setStatus(`Loaded ${resultsGrid.children.length} clip(s). Tap to select, then post.`, 'ok');
    actionsBar.classList.remove('hidden');
    loadMoreBtn.classList.remove('hidden');
  } catch (err) {
    setStatus('Network error reaching Pexels. Check your connection and try again.', 'err');
  } finally {
    searchBtn.disabled = false;
    loadMoreBtn.disabled = false;
  }
}

function bestFileUrl(video) {
  // Prefer a moderate-resolution mp4 (keeps feed bandwidth sane) over the
  // largest master file; fall back to whatever's available.
  const files = (video.video_files || []).filter(f => f.file_type === 'video/mp4');
  const midRange = files.find(f => f.width && f.width >= 480 && f.width <= 960);
  const chosen = midRange || files.sort((a, b) => (a.width || 0) - (b.width || 0))[0];
  return chosen ? chosen.link : (video.video_files[0] && video.video_files[0].link);
}

function renderCard(video) {
  const fileUrl = bestFileUrl(video);
  if (!fileUrl) return;

  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = video.id;

  const vid = document.createElement('video');
  vid.src = fileUrl;
  vid.muted = true;
  vid.loop = true;
  vid.playsInline = true;
  vid.preload = 'metadata';
  vid.addEventListener('mouseenter', () => vid.play().catch(() => {}));
  vid.addEventListener('mouseleave', () => vid.pause());

  const credit = document.createElement('div');
  credit.className = 'credit';
  credit.textContent = `${video.user ? video.user.name : 'Pexels'} · Pexels`;

  const check = document.createElement('div');
  check.className = 'check';
  check.textContent = '✓';

  card.appendChild(vid);
  card.appendChild(credit);
  card.appendChild(check);

  card.addEventListener('click', () => {
    const id = String(video.id);
    if (selected.has(id)) {
      selected.delete(id);
      card.classList.remove('selected');
    } else {
      selected.set(id, {
        fileUrl,
        photographer: video.user ? video.user.name : 'Pexels',
        sourceId: video.id,
        previewImage: video.image || '',
        duration: video.duration || 15
      });
      card.classList.add('selected');
    }
    updateActionsBar();
  });

  resultsGrid.appendChild(card);
}

function updateActionsBar() {
  selCountEl.textContent = selected.size;
  postBtn.disabled = selected.size === 0;
}

// Pulls one track from Jamendo matching the given mood tags. Returns
// { audioUrl, name, artist } or null if no key is set / the search fails —
// callers should treat null as "post silent, same as before".
async function fetchJamendoTrack(tags) {
  const key = jamendoKeyInput.value.trim();
  if (!key) return null;

  const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${encodeURIComponent(key)}&format=json&limit=10&fuzzytags=${encodeURIComponent(tags)}&audioformat=mp32&include=musicinfo`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const results = data.results || [];
    if (results.length === 0) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    return { audioUrl: pick.audio, name: pick.name, artist: pick.artist_name };
  } catch (err) {
    return null;
  }
}

// Calls the server-side /api/merge-music endpoint to mux the Jamendo track
// onto the Pexels clip. Returns a Blob (video/mp4) on success, or null if
// the merge failed — callers should fall back to posting the original,
// silent clip rather than blocking the whole post.
async function mergeMusicIntoVideo(videoUrl, audioUrl, durationSec) {
  try {
    const res = await fetch('/api/merge-music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl, audioUrl, durationSec })
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch (err) {
    return null;
  }
}

async function postSelected() {
  if (!currentUser || selected.size === 0) return;

  postBtn.disabled = true;
  const displayName = displayNameInput.value.trim() || 'Nduthi Flix';
  const tag = tagInput.value.trim().replace(/^#/, '');
  const items = Array.from(selected.entries());
  let posted = 0;

  // One music search per batch (they all came from the same search term),
  // shared across every clip in this post — not one Jamendo call per clip.
  const wantsMusic = musicToggle.checked && jamendoKeyInput.value.trim();
  let track = null;
  if (wantsMusic) {
    setStatus('Finding matching background music...', '');
    track = await fetchJamendoTrack(moodTagsForQuery(currentQuery));
  }

  setStatus(`Posting 0 / ${items.length}...`, '');

  for (const [id, item] of items) {
    try {
      let videoUrl = item.fileUrl;
      let storagePath = ''; // stays empty when served straight from Pexels' CDN
      let soundName = null;
      let musicSource = null;

      if (track) {
        setStatus(`Merging music into clip ${posted + 1} / ${items.length}...`, '');
        const mergedBlob = await mergeMusicIntoVideo(item.fileUrl, track.audioUrl, item.duration);

        if (mergedBlob) {
          setStatus(`Uploading clip ${posted + 1} / ${items.length}...`, '');
          const filename = `${currentUser.uid}_${Date.now()}_${item.sourceId}.mp4`;
          storagePath = `videos/${currentUser.uid}/${filename}`;
          const storageRef = storage.ref(storagePath);
          await storageRef.put(mergedBlob, { contentType: 'video/mp4' });
          videoUrl = await storageRef.getDownloadURL();
          soundName = `${track.name} — ${track.artist}`;
          musicSource = 'jamendo';
        }
        // If the merge failed, videoUrl/storagePath silently fall back to
        // the original Pexels link below — the clip still posts, just silent.
      }

      await db.collection('videos').add({
        uid: currentUser.uid,
        displayName,
        videoUrl,
        storagePath,
        caption: '',
        tag,
        likeCount: 0,
        commentCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        seeded: true,
        source: 'pexels',
        sourcePhotographer: item.photographer,
        sourceId: item.sourceId,
        ...(soundName ? { soundName, musicSource } : {})
      });
      posted += 1;
      setStatus(`Posting ${posted} / ${items.length}...`, '');
      const card = resultsGrid.querySelector(`.card[data-id="${id}"]`);
      if (card) card.remove();
    } catch (err) {
      setStatus(`Stopped after ${posted}/${items.length} — ${err.message}`, 'err');
      postBtn.disabled = false;
      return;
    }
  }

  selected.clear();
  updateActionsBar();
  setStatus(`Posted ${posted} veed(s) to the feed${track ? ' with background music' : ''}.`, 'ok');
}
