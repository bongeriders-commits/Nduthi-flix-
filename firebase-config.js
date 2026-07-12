// firebase-config.js
// Shared Firebase setup for Cabro City. Loaded as an ES module by every page.

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, setDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, limit, runTransaction, increment
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

/* ---------- Change PIN (Firebase Auth password, presented as "PIN") ----------
   Every team member logs in with an email + PIN (a plain password under the
   hood). Changing it requires re-proving the current one first — Firebase
   won't let a stale session change credentials without a fresh sign-in. */
export async function changeMyPin(currentPin, newPin) {
  const user = auth.currentUser;
  if (!user) throw new Error("You're signed out — log in again first.");
  const cred = EmailAuthProvider.credential(user.email, currentPin);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPin);
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

/* ---------- Stock items — public mirror (no balance/min) ----------
   stockItemsPublic/{itemId} carries only what's safe to list for a
   storeman/receiver picker: name, code, uom, status. Owner/admin write
   the full doc whenever an item is created/edited; any active user may
   patch just `status` after a receive/issue so the pill stays live
   without ever exposing a balance number. See firestore.rules.txt. */
export async function syncPublicItem(itemId, { name, code, uom, balance, min }) {
  await setDoc(doc(db, "stockItemsPublic", itemId), {
    name: name || "", code: code || "", uom: uom || "",
    status: statusOf(balance, min),
    updatedAt: serverTimestamp()
  });
}
export async function syncPublicItemStatus(itemId, balance, min) {
  await updateDoc(doc(db, "stockItemsPublic", itemId), {
    status: statusOf(balance, min),
    updatedAt: serverTimestamp()
  });
}
export async function deletePublicItem(itemId) {
  await deleteDoc(doc(db, "stockItemsPublic", itemId));
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

/* ---------- Roles & Team management ---------- */
// Five tiers: "owner" (the main admin — full control, incl. managing the
// team), "admin" (full day-to-day operational control, no team management),
// "staff" (dashboard + inventory view + receive/issue stock only),
// "storeman" (issue stock only — no inventory/balance visibility anywhere),
// "receiver" (receive + issue stock only — no inventory browsing, reports,
// suppliers, approvals or team management).
export const ROLES = {
  OWNER: "owner", ADMIN: "admin", STAFF: "staff",
  STOREMAN: "storeman", RECEIVER: "receiver"
};

// Roles allowed to create/edit/delete items, resolve approvals, manage suppliers.
export function canManage(role) {
  return role === ROLES.OWNER || role === ROLES.ADMIN;
}
// Only the owner can add/edit/deactivate team members.
export function canManageTeam(role) {
  return role === ROLES.OWNER;
}
// Storeman is locked to the issue.html workflow only — no dashboard,
// inventory list, item details, GRN, suppliers, approvals, etc. — and must
// never see current stock balances/quantities anywhere in the app.
export function isIssueOnly(role) {
  return role === ROLES.STOREMAN;
}
// Receiver is locked to grn.html + issue.html only (receive & issue stock),
// nothing else — no inventory browsing, reports, suppliers, or approvals.
export function isReceiveIssueOnly(role) {
  return role === ROLES.RECEIVER;
}
// True for roles allowed to browse the inventory list / item detail pages
// and see stock balances (owner, admin, staff). False for the two
// restricted roles above.
export function canViewInventory(role) {
  return !isIssueOnly(role) && !isReceiveIssueOnly(role);
}

// Fetches (and, on first-ever login, bootstraps) the current user's role doc
// from Firestore. If the `users` collection is completely empty, the signed-in
// user becomes the owner automatically — this is how the very first admin
// account gets promoted without anyone touching the Firebase console.
export async function fetchOrBootstrapRole(user) {
  if (!user) return null;
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    if (data.active === false) return null; // deactivated — treat as no access
    return data;
  }
  // No role doc yet — check if this is the very first user in the system.
  const existing = await getDoc(doc(db, "meta", "teamBootstrap"));
  if (existing.exists()) return null; // team already bootstrapped, this user just isn't on it
  const roleDoc = {
    email: user.email,
    displayName: user.email.split("@")[0],
    role: ROLES.OWNER,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: "bootstrap"
  };
  await setDoc(ref, roleDoc);
  await setDoc(doc(db, "meta", "teamBootstrap"), { done: true, ownerUid: user.uid, at: serverTimestamp() });
  return roleDoc;
}

export function watchTeam(callback) {
  const q = query(collection(db, "users"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function updateTeamMember(uid, updates) {
  return updateDoc(doc(db, "users", uid), updates);
}

// Creates a brand-new team member: a Firebase Auth account + their role doc.
// Uses a throwaway secondary Firebase App so the *current* admin's session
// is never disturbed (creating a user with the normal client SDK would
// otherwise sign the browser in as that new user).
export async function createTeamMember({ email, password, displayName, role, createdByUid }) {
  const secondaryApp = initializeApp(auth.app.options, "secondary-" + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await setDoc(doc(db, "users", uid), {
      email, displayName: displayName || email.split("@")[0],
      role, active: true, createdAt: serverTimestamp(), createdBy: createdByUid
    });
    await signOut(secondaryAuth);
    return uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

/* ---------- Re-exported Firestore functions ---------- */
export {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, setDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, limit, runTransaction, increment
};
