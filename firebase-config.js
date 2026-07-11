// firebase-config.js
// Shared Firebase setup for Cabro City. Loaded as an ES module by every page.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, serverTimestamp, query, orderBy, limit, runTransaction, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------- 1. PASTE YOUR FIREBASE CONFIG BELOW ----------
// Firebase console → Project settings → Your apps → Web app → SDK setup and config
const firebaseConfig = {
  apiKey: "AIzaSyAIoLfUG9nO7dTaVzgfBjKBDl3MsRATMZQ",
  authDomain: "cabrocity-a92e3.firebaseapp.com",
  projectId: "cabrocity-a92e3",
  storageBucket: "cabrocity-a92e3.firebasestorage.app",
  messagingSenderId: "664726134259",
  appId: "1:664726134259:web:09b8435da56563b1e94686"
};
// -----------------------------------------------------------

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* ---------- Auth helpers ---------- */
export function loginAdmin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export function logoutAdmin() {
  return signOut(auth);
}
// callback(user) fires immediately with current state, then on every change
export function watchAdmin(callback) {
  return onAuthStateChanged(auth, (user) => callback(user));
}

/* ---------- Shared item helpers ---------- */
// Status is always derived from balance vs min so it can never drift
// out of sync between pages — nobody sets "status" by hand anymore.
export function statusOf(balance, min) {
  const b = Number(balance) || 0;
  const m = Number(min) || 0;
  if (b <= 0) return "Out of Stock";
  if (b < m) return "Low Stock";
  return "Active";
}

export function unitAbbr(uom) {
  if (!uom) return "pc";
  if (uom.startsWith("Litre")) return "L";
  if (uom === "Bag") return "Bag";
  if (uom === "Pair") return "pr";
  if (uom === "Kg") return "kg";
  return "pc";
}

// Turns "john.mutua@cabrocity.co.ke" into "JM" for the header avatar.
// Falls back gracefully for single-word or missing addresses.
export function initialsFromEmail(email) {
  if (!email) return "?";
  const local = email.split("@")[0];
  const parts = local.split(/[._\-+]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

/* ---------- Re-exported Firestore functions ---------- */
export {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc,
  onSnapshot, serverTimestamp, query, orderBy, limit, runTransaction, increment
};
