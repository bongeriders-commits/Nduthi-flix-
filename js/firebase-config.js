// ============================================
// NDUTHI FLIX — Firebase configuration
// ============================================
// 1. Go to console.firebase.google.com
// 2. Create a NEW project (don't reuse bonge-96f37 — keep this separate)
// 3. Add a Web App to get this config object
// 4. Enable: Authentication > Phone, Firestore Database, Storage
// 5. Paste your real values below

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_YOUR_PROJECT.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT.appspot.com",
  messagingSenderId: "PASTE_YOUR_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
