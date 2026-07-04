// ============================================
// NDUTHI FLIX — Upload logic
// ============================================

const MAX_DURATION_SEC = 60;
const MAX_SIZE_MB = 80;

let selectedFile = null;
let currentUser = null;
let userProfile = null;

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  currentUser = user;
  const doc = await db.collection('users').doc(user.uid).get();
  userProfile = doc.data();
});

document.getElementById('pickBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', handleFile);
document.getElementById('cancelBtn').addEventListener('click', () => window.location.href = 'index.html');
document.getElementById('postBtn').addEventListener('click', postVeed);

function handleFile(e) {
  const file = e.target.files[0];
  const errorEl = document.getElementById('uploadError');
  errorEl.classList.add('hidden');
  if (!file) return;

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    errorEl.textContent = `Video is too large. Keep it under ${MAX_SIZE_MB}MB — trim it or record at lower quality.`;
    errorEl.classList.remove('hidden');
    return;
  }

  const previewVideo = document.getElementById('previewVideo');
  const url = URL.createObjectURL(file);
  previewVideo.src = url;

  previewVideo.onloadedmetadata = () => {
    if (previewVideo.duration > MAX_DURATION_SEC) {
      errorEl.textContent = `Keep veeds under ${MAX_DURATION_SEC} seconds — trim it and try again.`;
      errorEl.classList.remove('hidden');
      selectedFile = null;
      document.getElementById('postBtn').disabled = true;
      return;
    }
    selectedFile = file;
    document.getElementById('placeholder').classList.add('hidden');
    previewVideo.classList.remove('hidden');
    previewVideo.play();
    document.getElementById('postBtn').disabled = false;
  };
}

async function postVeed() {
  if (!selectedFile || !currentUser) return;

  const postBtn = document.getElementById('postBtn');
  const progressTrack = document.getElementById('progressTrack');
  const progressFill = document.getElementById('progressFill');
  const statusLine = document.getElementById('statusLine');
  const errorEl = document.getElementById('uploadError');

  postBtn.disabled = true;
  progressTrack.classList.remove('hidden');
  statusLine.classList.remove('hidden');
  statusLine.textContent = 'Uploading...';
  errorEl.classList.add('hidden');

  const caption = document.getElementById('captionInput').value.trim();
  const tag = document.getElementById('tagInput').value.trim().replace(/^#/, '');

  const filename = `${currentUser.uid}_${Date.now()}.mp4`;
  const storageRef = storage.ref(`videos/${currentUser.uid}/${filename}`);
  const uploadTask = storageRef.put(selectedFile);

  uploadTask.on('state_changed',
    (snapshot) => {
      const pct = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      progressFill.style.width = pct + '%';
      statusLine.textContent = `Uploading... ${Math.round(pct)}%`;
    },
    (error) => {
      errorEl.textContent = 'Upload failed. Check your connection and try again.';
      errorEl.classList.remove('hidden');
      statusLine.classList.add('hidden');
      progressTrack.classList.add('hidden');
      postBtn.disabled = false;
    },
    async () => {
      statusLine.textContent = 'Finishing up...';
      const videoUrl = await uploadTask.snapshot.ref.getDownloadURL();

      await db.collection('videos').add({
        uid: currentUser.uid,
        displayName: userProfile ? userProfile.displayName : 'Rider',
        videoUrl: videoUrl,
        storagePath: `videos/${currentUser.uid}/${filename}`,
        caption: caption,
        tag: tag,
        likeCount: 0,
        commentCount: 0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      statusLine.textContent = 'Posted!';
      setTimeout(() => window.location.href = 'index.html', 600);
    }
  );
}
