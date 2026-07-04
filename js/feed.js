// ============================================
// NDUTHI FLIX — Feed logic
// ============================================

const feedEl = document.getElementById('feed');
let currentUser = null;
let likedIds = new Set();

// ---- Pagination state ----
const PAGE_SIZE = 8;
let lastDoc = null;
let isLoadingMore = false;
let reachedEnd = false;
let sentinel = null;

// ---- Filler content (Pexels) ----
// Kicks in only when there aren't enough real veeds yet, so a brand-new
// (or still-small) install never looks empty to a visitor — signed in or
// not. Real rider uploads always take priority once they exist.
const FILLER_QUERIES = [
  'motorbike riding', 'city traffic motorbike', 'motorcycle city street',
  'urban commute', 'delivery rider', 'street market africa',
  'city life street', 'motorbike sunset', 'traffic road city', 'scooter street'
];
let usingFiller = false;
let fillerPage = 1;

// Single observer reused for every slide: lazy-loads the video source
// shortly before it scrolls into view, and plays/pauses based on how much
// of the slide is visible. This keeps memory/network usage flat no matter
// how many videos are in the feed — nothing loads until it's about to be seen.
const videoObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const video = entry.target;
    if (entry.isIntersecting) {
      if (!video.src && video.dataset.src) {
        video.src = video.dataset.src;
      }
      if (entry.intersectionRatio > 0.6) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    } else {
      video.pause();
      // Slide is well outside the loading margin — release the loaded
      // video from memory. dataset.src is untouched, so scrolling back
      // triggers a clean reload instead of holding every video in RAM.
      if (video.src) {
        video.removeAttribute('src');
        video.load();
      }
    }
  });
}, { threshold: [0, 0.6, 1], rootMargin: '100% 0px' });

// Separate observer just for the "load more" sentinel at the bottom of the feed.
const scrollObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) loadMore();
}, { rootMargin: '400px 0px' });

window.addEventListener('DOMContentLoaded', () => {
  // Splash plays only on the very first load of this session — not on
  // every return to the feed (e.g. back from upload/profile).
  const alreadyPlayed = sessionStorage.getItem('nf_splash_played');
  const splash = document.getElementById('splash');
  if (alreadyPlayed) {
    splash.remove();
  } else {
    sessionStorage.setItem('nf_splash_played', '1');
    setTimeout(() => splash.classList.add('hidden'), 1200);
  }

  document.getElementById('navUpload').addEventListener('click', () => {
    if (requireAccount('post a veed')) window.location.href = 'upload.html';
  });
  document.getElementById('navHood').addEventListener('click', () => {
    if (currentUser) window.location.href = 'profile.html';
    else window.location.href = 'login.html';
  });
  document.getElementById('navPals').addEventListener('click', () => {
    if (requireAccount('see your pals')) window.location.href = 'friends.html';
  });
  document.getElementById('navBox').addEventListener('click', () => {
    if (requireAccount('open your inbox')) window.location.href = 'inbox.html';
  });
});

auth.onAuthStateChanged(async (user) => {
  // Guests (no account) can still browse the feed. currentUser stays null
  // and any action that needs an account (like, comment, upload, profile)
  // sends them to login instead.
  currentUser = user || null;
  updateNavForAuthState();
  if (currentUser) await loadLikes();
  await loadFeed();
});

function updateNavForAuthState() {
  if (!currentUser) {
    document.getElementById('navHood').innerHTML = `<span class="nav-icon">👤</span><span class="nav-label">Sign in</span>`;
    document.getElementById('boxBadge').classList.add('hidden');
  }
}

function requireAccount(actionLabel) {
  if (currentUser) return true;
  if (confirm(`Sign in to ${actionLabel}. Go to sign in now?`)) {
    window.location.href = 'login.html';
  }
  return false;
}

async function loadLikes() {
  const snap = await db.collection('users').doc(currentUser.uid)
    .collection('likes').get();
  snap.forEach(doc => likedIds.add(doc.id));
}

async function loadFeed() {
  feedEl.innerHTML = '';
  lastDoc = null;
  reachedEnd = false;
  usingFiller = false;
  fillerPage = 1;

  const snap = await db.collection('videos')
    .orderBy('createdAt', 'desc')
    .limit(PAGE_SIZE)
    .get();

  if (snap.empty) {
    const loadedFiller = await loadFillerFeed(true);
    if (!loadedFiller) {
      feedEl.innerHTML = `
        <div class="empty-state">
          <div class="headline">No veeds yet</div>
          <p>Be the first duthi guy to drop a ride, a fix, or a road story.</p>
        </div>`;
    }
    return;
  }

  snap.forEach(doc => renderSlide(doc.id, doc.data()));
  lastDoc = snap.docs[snap.docs.length - 1];
  if (snap.docs.length < PAGE_SIZE) reachedEnd = true;

  attachSentinel();
}

// Pulls a page of free-license stock clips from Pexels and renders them
// with the same slide UI as real veeds. Returns true if anything loaded.
// `isInitial` is true for the very first load (feed was empty, no sentinel
// exists yet); false for subsequent infinite-scroll pages (insert before
// the existing sentinel instead of creating a new one).
async function loadFillerFeed(isInitial) {
  if (!PEXELS_API_KEY || PEXELS_API_KEY.startsWith('PASTE_YOUR')) {
    return false; // no key configured — caller falls back to empty state
  }

  const query = FILLER_QUERIES[Math.floor(Math.random() * FILLER_QUERIES.length)];
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${PAGE_SIZE}&page=${fillerPage}&orientation=portrait`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.videos || data.videos.length === 0) return false;

    if (isInitial) feedEl.innerHTML = '';
    usingFiller = true;
    data.videos.forEach(video => {
      const fileUrl = bestPexelsFile(video);
      if (!fileUrl) return;
      renderSlide(`pexels-${video.id}`, {
        displayName: 'Nduthi Flix',
        videoUrl: fileUrl,
        caption: `Stock footage by ${video.user ? video.user.name : 'Pexels'} · Pexels`,
        tag: 'Stock',
        likeCount: 0,
        commentCount: 0
      }, isInitial ? null : sentinel, true);
    });
    if (isInitial) attachSentinel();
    return true;
  } catch (err) {
    return false;
  }
}

function bestPexelsFile(video) {
  const files = (video.video_files || []).filter(f => f.file_type === 'video/mp4');
  const midRange = files.find(f => f.width && f.width >= 480 && f.width <= 960);
  const chosen = midRange || files.sort((a, b) => (a.width || 0) - (b.width || 0))[0];
  return chosen ? chosen.link : (video.video_files[0] && video.video_files[0].link);
}

function attachSentinel() {
  sentinel = document.createElement('div');
  sentinel.className = 'feed-sentinel';
  sentinel.innerHTML = `<span class="mono">Loading more veeds…</span>`;
  feedEl.appendChild(sentinel);
  scrollObserver.observe(sentinel);
}

async function loadMore() {
  if (isLoadingMore || reachedEnd) return;

  if (usingFiller) {
    isLoadingMore = true;
    fillerPage += 1;
    const gotMore = await loadFillerFeed(false);
    if (!gotMore) {
      reachedEnd = true;
      if (sentinel) {
        scrollObserver.unobserve(sentinel);
        sentinel.innerHTML = `<span class="mono">You're all caught up 🏁</span>`;
      }
    }
    isLoadingMore = false;
    return;
  }

  if (!lastDoc) return;
  isLoadingMore = true;

  const snap = await db.collection('videos')
    .orderBy('createdAt', 'desc')
    .startAfter(lastDoc)
    .limit(PAGE_SIZE)
    .get();

  if (snap.empty) {
    reachedEnd = true;
    isLoadingMore = false;
    scrollObserver.unobserve(sentinel);
    sentinel.innerHTML = `<span class="mono">You're all caught up 🏁</span>`;
    return;
  }

  // Insert new slides just before the sentinel so it stays the last element
  snap.forEach(doc => renderSlide(doc.id, doc.data(), sentinel));
  lastDoc = snap.docs[snap.docs.length - 1];
  if (snap.docs.length < PAGE_SIZE) {
    reachedEnd = true;
    scrollObserver.unobserve(sentinel);
    sentinel.innerHTML = `<span class="mono">You're all caught up 🏁</span>`;
  }

  isLoadingMore = false;
}

function renderSlide(id, data, insertBefore, isFiller) {
  const isLiked = likedIds.has(id);
  const slide = document.createElement('div');
  slide.className = 'slide';
  slide.dataset.id = id;
  if (isFiller) slide.dataset.filler = 'true';
  slide.innerHTML = `
    <div class="rev-progress"><div class="rev-progress-fill"></div></div>
    <video data-src="${data.videoUrl}" loop playsinline muted preload="none"></video>
    <div class="hud">
      <div class="hud-info">
        <div class="hud-rider"><span class="badge"></span>${escapeHtml(data.displayName || 'Rider')}</div>
        <div class="hud-caption">${escapeHtml(data.caption || '')}</div>
        ${data.tag ? `<span class="hud-tag">#${escapeHtml(data.tag)}</span>` : ''}
      </div>
      <div class="hud-controls">
        <button class="ctrl like-btn ${isLiked ? 'liked' : ''}">
          <div class="icon-ring">${isLiked ? '❤️' : '🤍'}</div>
          <span class="count">${data.likeCount || 0}</span>
        </button>
        <button class="ctrl comment-btn">
          <div class="icon-ring">💬</div>
          <span class="count">${data.commentCount || 0}</span>
        </button>
        <button class="ctrl share-btn">
          <div class="icon-ring">↗️</div>
          <span class="count">Share</span>
        </button>
        <button class="ctrl download-btn">
          <div class="icon-ring">⬇️</div>
          <span class="count">Save</span>
        </button>
        <button class="ctrl mute-btn">
          <div class="icon-ring">🔇</div>
          <span class="count">sound</span>
        </button>
        <button class="ctrl music-btn">
          <div class="music-disc">🎵</div>
        </button>
      </div>
    </div>
  `;

  const video = slide.querySelector('video');
  const fill = slide.querySelector('.rev-progress-fill');
  video.addEventListener('timeupdate', () => {
    if (video.duration) fill.style.width = (video.currentTime / video.duration * 100) + '%';
  });

  slide.querySelector('.like-btn').addEventListener('click', () => toggleLike(id, slide));
  slide.querySelector('.mute-btn').addEventListener('click', () => toggleMute(video, slide));
  slide.querySelector('.share-btn').addEventListener('click', () => shareVeed(id, data));
  slide.querySelector('.download-btn').addEventListener('click', () => downloadVeed(id, data, slide));
  slide.querySelector('.music-btn').addEventListener('click', () => useMusic(id, data));
  slide.addEventListener('click', (e) => {
    if (e.target.closest('.hud')) return;
    video.paused ? video.play() : video.pause();
  });

  if (insertBefore) {
    feedEl.insertBefore(slide, insertBefore);
  } else {
    feedEl.appendChild(slide);
  }
  videoObserver.observe(video);
}

function toggleMute(video, slide) {
  video.muted = !video.muted;
  slide.querySelector('.mute-btn .icon-ring').textContent = video.muted ? '🔇' : '🔊';
}

async function shareVeed(videoId, data) {
  // Note: deep-linking straight to this specific veed isn't wired up yet —
  // the link opens the feed. Scroll-to-video-on-load is a good next step.
  const shareUrl = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}index.html?v=${videoId}`;
  const shareData = {
    title: 'Nduthi Flix',
    text: `Check out this veed from ${data.displayName || 'a rider'} on Nduthi Flix`,
    url: shareUrl
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      // user cancelled the share sheet — nothing to do
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(shareUrl);
    alert('Link copied — paste it anywhere to share this veed.');
  } else {
    prompt('Copy this link to share:', shareUrl);
  }
}

function useMusic(videoId, data) {
  const soundName = data.soundName || `Original sound — ${data.displayName || 'Rider'}`;
  // TODO: once a sound library exists, this should open a page listing all
  // veeds that used this same soundName, and let the person start an upload
  // pre-tagged with it. For now it just surfaces which sound is playing.
  alert(`🎵 ${soundName}\n\nBrowsing veeds by sound is coming soon.`);
}

async function downloadVeed(videoId, data, slide) {
  const btn = slide.querySelector('.download-btn');
  const ring = btn.querySelector('.icon-ring');
  const label = btn.querySelector('.count');
  ring.textContent = '⏳';
  label.textContent = 'Saving';

  try {
    const response = await fetch(data.videoUrl);
    if (!response.ok) throw new Error('fetch failed');
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `nduthiflix-${videoId}.mp4`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    label.textContent = 'Saved';
  } catch (err) {
    // Most likely the Storage bucket's CORS config blocks a browser fetch.
    // Fall back to opening the raw video so the person can long-press it
    // and save manually — works on every mobile browser.
    window.open(data.videoUrl, '_blank');
    label.textContent = 'Opened';
  } finally {
    setTimeout(() => {
      ring.textContent = '⬇️';
      label.textContent = 'Save';
    }, 1800);
  }
}

async function toggleLike(videoId, slide) {
  if (!requireAccount('like veeds')) return;
  const btn = slide.querySelector('.like-btn');
  const ring = btn.querySelector('.icon-ring');
  const countEl = btn.querySelector('.count');

  // Stock filler clips have no Firestore doc behind them, so likes here
  // are just a local UI toggle (not persisted, resets on reload) rather
  // than a write against a document that doesn't exist.
  if (slide.dataset.filler === 'true') {
    const nowLiked = !btn.classList.contains('liked');
    btn.classList.toggle('liked', nowLiked);
    ring.textContent = nowLiked ? '❤️' : '🤍';
    countEl.textContent = Math.max(0, parseInt(countEl.textContent) + (nowLiked ? 1 : -1));
    return;
  }

  const videoRef = db.collection('videos').doc(videoId);
  const likeRef = db.collection('users').doc(currentUser.uid).collection('likes').doc(videoId);

  const isLiked = likedIds.has(videoId);
  try {
    await db.runTransaction(async (tx) => {
      const vDoc = await tx.get(videoRef);
      const current = vDoc.data().likeCount || 0;
      if (isLiked) {
        tx.update(videoRef, { likeCount: Math.max(0, current - 1) });
        tx.delete(likeRef);
      } else {
        tx.update(videoRef, { likeCount: current + 1 });
        tx.set(likeRef, { likedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
    });
    if (isLiked) {
      likedIds.delete(videoId);
      btn.classList.remove('liked');
      ring.textContent = '🤍';
      countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
    } else {
      likedIds.add(videoId);
      btn.classList.add('liked');
      ring.textContent = '❤️';
      countEl.textContent = parseInt(countEl.textContent) + 1;
    }
  } catch (err) {
    console.error('Like failed', err);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
