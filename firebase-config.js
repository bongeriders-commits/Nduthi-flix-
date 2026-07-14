// firebase-config.js
// Shared Firebase setup for Cabro City. Loaded as an ES module by every page.

import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, setDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, limit, startAfter, runTransaction, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";


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

// Offline persistence: caches reads locally and queues writes (addDoc,
// updateDoc, increment, etc.) whenever there's no network, then syncs
// automatically the moment connection returns. This is required for the
// app to be usable at all on construction sites with weak/no signal —
// without it, every Firestore call simply fails offline.
// persistentMultipleTabManager lets the cache be shared safely if the
// storeman ever has the app open in two tabs/windows at once.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

// Firebase Storage — used for employee document uploads (ID scans, KRA PIN
// PDF, academic certificates). Nothing else in the app uses Storage yet.
export const storage = getStorage(app);

/* ---------- Auth helpers ---------- */
export function loginAdmin(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}
export function logoutAdmin() {
  clearActiveBranch();
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
export async function syncPublicItem(itemId, { name, code, uom, balance, min, branchId }) {
  await setDoc(doc(db, "stockItemsPublic", itemId), {
    name: name || "", code: code || "", uom: uom || "", branchId: branchId || "",
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

/* ---------- Multi-branch (multi-site) support ----------
   owner/admin are "all-branch" roles: after login they land on
   branch-select.html and pick which store's data to view. Every other
   role (staff, storeman, receiver) is locked to a single branch stored on
   their users/{uid} doc (`branchId`) and is dropped straight into that
   store with no picker. The chosen/assigned branch for the current
   session lives in sessionStorage (not localStorage) so it resets on
   logout and never silently carries over into a fresh session. */
export function isBranchLocked(role) {
  return !canManage(role);
}
const ACTIVE_BRANCH_ID_KEY = "cabroActiveBranchId";
const ACTIVE_BRANCH_NAME_KEY = "cabroActiveBranchName";
export function getActiveBranchId() {
  return sessionStorage.getItem(ACTIVE_BRANCH_ID_KEY) || "";
}
export function getActiveBranchName() {
  return sessionStorage.getItem(ACTIVE_BRANCH_NAME_KEY) || "";
}
export function setActiveBranch(branchId, branchName) {
  sessionStorage.setItem(ACTIVE_BRANCH_ID_KEY, branchId || "");
  sessionStorage.setItem(ACTIVE_BRANCH_NAME_KEY, branchName || "");
}
export function clearActiveBranch() {
  sessionStorage.removeItem(ACTIVE_BRANCH_ID_KEY);
  sessionStorage.removeItem(ACTIVE_BRANCH_NAME_KEY);
}
// Active (non-archived) branches, alphabetical — used by both the
// branch-select gate and the "add team member" branch dropdown.
export async function fetchBranches() {
  const snap = await getDocs(query(collection(db, "branches"), orderBy("name")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.active !== false);
}
export async function createBranch({ name, code, createdByUid }) {
  const ref = await addDoc(collection(db, "branches"), {
    name, code: code || "", active: true,
    createdAt: serverTimestamp(), createdBy: createdByUid
  });
  return ref.id;
}
export async function setBranchActive(branchId, active) {
  await updateDoc(doc(db, "branches", branchId), { active });
}
export async function getBranch(branchId) {
  if (!branchId) return null;
  const snap = await getDoc(doc(db, "branches", branchId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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
export async function createTeamMember({ email, password, displayName, role, branchId, createdByUid }) {
  const secondaryApp = initializeApp(auth.app.options, "secondary-" + Date.now());
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await setDoc(doc(db, "users", uid), {
      email, displayName: displayName || email.split("@")[0],
      role, branchId: isBranchLocked(role) ? (branchId || "") : "",
      active: true, createdAt: serverTimestamp(), createdBy: createdByUid
    });
    await signOut(secondaryAuth);
    return uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

/* ---------- Audit trail ----------
   Every meaningful write anywhere in the app (item create/edit/delete,
   receive/issue, approvals, team changes, supplier changes, PIN changes)
   should call logAudit() right after the write succeeds. Logs are
   write-once (see firestore.rules.txt: auditLogs allows create only,
   never update/delete), so this collection is a trustworthy record.
   `summary` should be a short human-readable line ("Changed min stock
   5 -> 10"); `meta` can carry the raw before/after values for the
   expandable detail view on audit.html. Never throws — a logging
   failure should never block the actual business action. */
export async function logAudit({ actorUid, actorName, actorRole, action, entityType, entityId, entityLabel, summary, meta }){
  try{
    const user = auth.currentUser;
    await addDoc(collection(db, "auditLogs"), {
      ts: serverTimestamp(),
      actorUid: actorUid || (user ? user.uid : ""),
      actorName: actorName || (user ? user.email : "Unknown"),
      actorRole: actorRole || "unknown",
      action: action || "unknown",
      entityType: entityType || "",
      entityId: entityId || "",
      entityLabel: entityLabel || "",
      summary: summary || "",
      meta: meta || {}
    });
  }catch(err){
    console.error("audit log failed:", err);
  }
}

/* ---------- Stock discrepancy ("Mismatch") reports ----------
   Raised by staff/receiver/storeman when a physical count doesn't match
   what the system shows. Feeds the same "approvals" queue used by
   new-item and threshold requests (see katani-approvals.html) — owner/
   admin reviews it there, and approving corrects stockItems.balance to
   the reported physical count. systemCount is captured here purely for
   the reviewer's benefit and is never shown back to the person reporting
   it — matches the rule that storeman/receiver never see live balances. */
export async function reportMismatch({ itemId, itemName, uom, actualCount, requestedByUid, requestedByName, requestedByRole, branchId }) {
  let systemCount = null;
  try {
    const snap = await getDoc(doc(db, "stockItems", itemId));
    if (snap.exists()) systemCount = snap.data().balance ?? null;
  } catch (e) {
    console.warn("Could not read system count for mismatch report:", e);
  }
  return addDoc(collection(db, "approvals"), {
    type: "discrepancy",
    itemId, itemName: itemName || "", uom: uom || "",
    actualCount, systemCount,
    title: `${itemName || "Item"} — reported mismatch`,
    requestedBy: requestedByName || "Unknown",
    requestedByUid: requestedByUid || "",
    requestedByRole: requestedByRole || "unknown",
    status: "pending",
    createdAt: serverTimestamp(),
    branchId: branchId || ""
  });
}

/* ---------- Employee document uploads (Firebase Storage) ----------
   Used by employee-detail.html for ID scans, KRA PIN PDF, and academic
   certificates. Files live at employees/{employeeId}/{docType}/{filename},
   and each upload's metadata (name, url, storage path, size) is written
   to the hrEmployees/{employeeId}/documents subcollection by the caller
   so it shows up in a live list without a second read of Storage itself.
   onProgress(pct) is optional and fires 0–100 as the upload streams. */
export function uploadEmployeeDocument(employeeId, docType, file, onProgress) {
  const safeName = `${Date.now()}-${file.name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `employees/${employeeId}/${docType}/${safeName}`;
  const ref = storageRef(storage, path);
  const task = uploadBytesResumable(ref, file);
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      (err) => reject(err),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, storagePath: path, fileName: file.name, size: file.size });
        } catch (err) { reject(err); }
      }
    );
  });
}
export async function deleteEmployeeDocument(storagePath) {
  await deleteObject(storageRef(storage, storagePath));
}

/* ---------- Re-exported Firestore functions ---------- */
export {
  collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, setDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, limit, startAfter, runTransaction, increment
};
