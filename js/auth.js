// ============================================
// NDUTHI FLIX — Phone auth flow
// ============================================

let confirmationResult = null;

window.addEventListener('DOMContentLoaded', () => {
  // Splash plays once per load, then reveals the auth screen
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('authScreen').classList.remove('hidden');
  }, 1400);

  // If already signed in and has a profile, skip straight to the feed
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      const doc = await db.collection('users').doc(user.uid).get();
      if (doc.exists && doc.data().displayName) {
        window.location.href = 'index.html';
      }
    }
  });

  window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
    size: 'normal'
  });

  document.getElementById('sendCodeBtn').addEventListener('click', sendCode);
  document.getElementById('verifyBtn').addEventListener('click', verifyCode);
  document.getElementById('backBtn').addEventListener('click', () => {
    document.getElementById('otpStep').classList.add('hidden');
    document.getElementById('phoneStep').classList.remove('hidden');
  });
  document.getElementById('saveNameBtn').addEventListener('click', saveProfile);
});

async function sendCode() {
  const phoneError = document.getElementById('phoneError');
  phoneError.classList.add('hidden');
  const phone = document.getElementById('phoneInput').value.trim();

  if (!/^\+\d{10,15}$/.test(phone)) {
    phoneError.textContent = 'Enter your number in international format, e.g. +2547XXXXXXXX';
    phoneError.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('sendCodeBtn');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    confirmationResult = await auth.signInWithPhoneNumber(phone, window.recaptchaVerifier);
    document.getElementById('phoneStep').classList.add('hidden');
    document.getElementById('otpStep').classList.remove('hidden');
  } catch (err) {
    phoneError.textContent = err.message || 'Could not send code. Try again.';
    phoneError.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send code';
  }
}

async function verifyCode() {
  const otpError = document.getElementById('otpError');
  otpError.classList.add('hidden');
  const code = document.getElementById('otpInput').value.trim();

  if (code.length !== 6) {
    otpError.textContent = 'Enter the 6-digit code from your SMS.';
    otpError.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('verifyBtn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    const result = await confirmationResult.confirm(code);
    const user = result.user;
    const doc = await db.collection('users').doc(user.uid).get();

    if (doc.exists && doc.data().displayName) {
      window.location.href = 'index.html';
    } else {
      document.getElementById('otpStep').classList.add('hidden');
      document.getElementById('nameStep').classList.remove('hidden');
    }
  } catch (err) {
    otpError.textContent = 'Wrong code. Check your SMS and try again.';
    otpError.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify & continue';
  }
}

async function saveProfile() {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) return;

  const user = auth.currentUser;
  await db.collection('users').doc(user.uid).set({
    displayName: name,
    phone: user.phoneNumber,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    followerCount: 0,
    followingCount: 0
  });

  window.location.href = 'index.html';
}
