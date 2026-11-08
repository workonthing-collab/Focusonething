// Data layer: Firebase when configured, browser-only demo store otherwise.
import { firebaseConfig, DEMO_MODE, site } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
let fb = null; // { auth, db, storage, mods }

async function loadFirebase() {
  if (fb) return fb;
  const [app, auth, fs, st] = await Promise.all([
    import(FB + "firebase-app.js"),
    import(FB + "firebase-auth.js"),
    import(FB + "firebase-firestore.js"),
    import(FB + "firebase-storage.js")
  ]);
  const a = app.initializeApp(firebaseConfig);
  fb = { auth: auth.getAuth(a), db: fs.getFirestore(a), storage: st.getStorage(a), App: app, A: auth, F: fs, S: st };
  return fb;
}

// A second Firebase app so an admin can create a login without being
// signed out of their own admin session.
let fb2 = null;
async function secondaryAuth() {
  const { App, A } = await loadFirebase();
  if (!fb2) { const a2 = App.initializeApp(firebaseConfig, "provision-" + Date.now()); fb2 = A.getAuth(a2); }
  return fb2;
}

// Records a sign-in to the /logins collection (the admin "Sign-in log").
// Best-effort: a failure here never blocks the login itself.
async function recordLogin(user, method) {
  try {
    const entry = { email: (user.email || "").toLowerCase(), name: user.displayName || user.name || "", uid: user.uid || "", method, at: new Date().toISOString() };
    if (DEMO_MODE) { const l = LS.get("sfs_logins", []); l.push(entry); LS.set("sfs_logins", l); }
    else { const { db, F } = await loadFirebase(); await F.addDoc(F.collection(db, "logins"), entry); }
    // Optional: forward to a Google Sheet via an Apps Script web app, if configured.
    const hook = (site && site.sheetWebhook) || "";
    if (hook && !DEMO_MODE) { try { await fetch(hook, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(entry) }); } catch {} }
  } catch {}
}

// ── Demo backend (localStorage) ───────────────────────────────
const LS = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const demoListeners = new Set();
function demoCurrent() { return LS.get("sfs_session", null); }
function demoEmit() { const u = demoCurrent(); demoListeners.forEach(cb => cb(u)); }
async function hash(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── Friendly error messages ───────────────────────────────────
export function friendlyError(e) {
  const code = e?.code || e?.message || "";
  const map = {
    "auth/email-already-in-use": "An account with this email already exists. Please log in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password should be at least 8 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "No account found with this email.",
    "auth/popup-closed-by-user": "Sign-in was cancelled. Please try again.",
    "auth/cancelled-popup-request": "Sign-in was cancelled. Please try again.",
    "auth/account-exists-with-different-credential": "This email is already registered with a password. Use Staff login, or ask the team to switch your account to Google sign-in.",
    "auth/unauthorized-domain": "This site isn't authorised for Google sign-in yet. Please contact support.",
    "auth/invalid-action-code": "This login link has expired or was already used. Please request a new one.",
    "auth/expired-action-code": "This login link has expired. Please request a new one.",
    "auth/operation-not-allowed": "Email-link login isn't switched on yet. Please contact support.",
    "auth/unauthorized-continue-uri": "This site isn't allowed to send login links yet. Please contact support.",
    "auth/quota-exceeded": "Too many login links were sent today. Please try again tomorrow or contact support.",
    "auth/too-many-requests":"Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "Network error. Check your internet connection.",
    "permission-denied": "You don't have access to this. Please log in again or contact support.",
    "insufficient permissions": "You don't have access to this. Please log in again or contact support."
  };
  for (const k in map) if (code.includes(k)) return map[k];
  return e?.friendly || "Something went wrong. Please try again.";
}
function err(code, friendly) { const e = new Error(code); e.code = code; e.friendly = friendly; return e; }

// ── Public API ────────────────────────────────────────────────
export const store = {
  demo: DEMO_MODE,

  onUser(cb) {
    if (DEMO_MODE) { demoListeners.add(cb); cb(demoCurrent()); return () => demoListeners.delete(cb); }
    let unsub = () => {};
    loadFirebase().then(({ auth, A }) => {
      unsub = A.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email, name: u.displayName || "", verified: u.emailVerified } : null));
    }).catch(() => cb(null));
    return () => unsub();
  },

  async signUp({ name, email, password }) {
    email = email.trim().toLowerCase();
    if (password.length < 8) throw err("auth/weak-password");
    if (DEMO_MODE) {
      const users = LS.get("sfs_users", {});
      if (users[email]) throw err("auth/email-already-in-use");
      const uid = "demo_" + Math.random().toString(36).slice(2, 10);
      users[email] = { uid, name, pw: await hash(password) };
      LS.set("sfs_users", users);
      LS.set("sfs_session", { uid, email, name, verified: true });
      demoEmit();
      return;
    }
    const { auth, A } = await loadFirebase();
    const cred = await A.createUserWithEmailAndPassword(auth, email, password);
    await A.updateProfile(cred.user, { displayName: name });
    try { await A.sendEmailVerification(cred.user); } catch {}
  },

  async signIn({ email, password }) {
    email = email.trim().toLowerCase();
    if (DEMO_MODE) {
      const u = LS.get("sfs_users", {})[email];
      if (!u || u.pw !== await hash(password)) throw err("auth/invalid-credential");
      LS.set("sfs_session", { uid: u.uid, email, name: u.name, verified: true });
      demoEmit();
      return;
    }
    const { auth, A } = await loadFirebase();
    const cred = await A.signInWithEmailAndPassword(auth, email, password);
    await recordLogin(cred.user, "password");
  },

  // Admin: create a portal login for a founder (email + a password the admin sets).
  // Uses a secondary app so the admin stays signed in. Stores the credential so
  // the admin can view it later (per the admin's choice).
  async adminCreateLogin({ email, password, name }) {
    email = (email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err("auth/invalid-email");
    if (!password || password.length < 6) throw err("auth/weak-password", "Password should be at least 6 characters.");
    if (DEMO_MODE) {
      const users = LS.get("sfs_users", {});
      if (users[email]) throw err("auth/email-already-in-use");
      const uid = "demo_" + Math.random().toString(36).slice(2, 10);
      users[email] = { uid, name: name || "", pw: await hash(password) };
      LS.set("sfs_users", users);
      const creds = LS.get("sfs_credentials", {});
      creds[uid] = { uid, email, name: name || "", password, createdAt: new Date().toISOString() };
      LS.set("sfs_credentials", creds);
      return { uid };
    }
    const A = (await loadFirebase()).A;
    const sec = await secondaryAuth();
    const cred = await A.createUserWithEmailAndPassword(sec, email, password);
    if (name) { try { await A.updateProfile(cred.user, { displayName: name }); } catch {} }
    const uid = cred.user.uid;
    try { await A.signOut(sec); } catch {}
    const { db, F } = await loadFirebase();
    await F.setDoc(F.doc(db, "credentials", uid), { uid, email, name: name || "", password, createdAt: new Date().toISOString() });
    return { uid };
  },

  // Admin: change a login's password (needs the current stored password to re-auth).
  async adminResetPassword({ uid, email, currentPassword, newPassword }) {
    email = (email || "").trim().toLowerCase();
    if (!newPassword || newPassword.length < 6) throw err("auth/weak-password", "Password should be at least 6 characters.");
    if (DEMO_MODE) {
      const users = LS.get("sfs_users", {}); if (users[email]) users[email].pw = await hash(newPassword); LS.set("sfs_users", users);
      const creds = LS.get("sfs_credentials", {}); if (creds[uid]) creds[uid].password = newPassword; LS.set("sfs_credentials", creds);
      return;
    }
    const A = (await loadFirebase()).A;
    const sec = await secondaryAuth();
    const c = await A.signInWithEmailAndPassword(sec, email, currentPassword);
    await A.updatePassword(c.user, newPassword);
    try { await A.signOut(sec); } catch {}
    const { db, F } = await loadFirebase();
    await F.updateDoc(F.doc(db, "credentials", uid), { password: newPassword, updatedAt: new Date().toISOString() });
  },

  // Admin: list all portal logins (with the stored passwords, admin-only).
  async listCredentials() {
    if (DEMO_MODE) return Object.values(LS.get("sfs_credentials", {})).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    const { db, F } = await loadFirebase();
    const snap = await F.getDocs(F.collection(db, "credentials"));
    return snap.docs.map(d => d.data()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  },

  // Admin: remove the stored credential record (does not delete the Auth login itself).
  async deleteCredential(uid) {
    if (DEMO_MODE) { const creds = LS.get("sfs_credentials", {}); delete creds[uid]; LS.set("sfs_credentials", creds); return; }
    const { db, F } = await loadFirebase();
    await F.deleteDoc(F.doc(db, "credentials", uid));
  },

  // Passwordless: email a one-time sign-in link. No account creation needed;
  // the first click on the link creates the login automatically.
  async sendLoginLink(email, returnUrl) {
    email = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw err("auth/invalid-email");
    if (DEMO_MODE) {
      const users = LS.get("sfs_users", {});
      if (!users[email]) { users[email] = { uid: "demo_" + Math.random().toString(36).slice(2, 10), name: "" }; LS.set("sfs_users", users); }
      LS.set("sfs_session", { uid: users[email].uid, email, name: users[email].name, verified: true });
      demoEmit();
      return { demo: true };
    }
    const { auth, A } = await loadFirebase();
    await A.sendSignInLinkToEmail(auth, email, { url: returnUrl, handleCodeInApp: true });
    try { localStorage.setItem("sfs_link_email", email); } catch {}
    return {};
  },

  // True when the current page was opened from a sign-in link.
  async isLoginLink(href) {
    if (DEMO_MODE) return false;
    const { auth, A } = await loadFirebase();
    return A.isSignInWithEmailLink(auth, href);
  },

  linkEmail() { try { return localStorage.getItem("sfs_link_email") || ""; } catch { return ""; } },

  async completeLoginLink(email, href) {
    const { auth, A } = await loadFirebase();
    const res = await A.signInWithEmailLink(auth, email.trim().toLowerCase(), href);
    try { localStorage.removeItem("sfs_link_email"); } catch {}
    await recordLogin(res.user, "email-link");
  },

  // Applicant login with a real Google account. Google collects the password
  // on its own page; the portal only receives the verified email and name.
  // Returns { redirecting: true } when it hands off to a full-page redirect
  // (common on phones, where popups are blocked); the result is then picked up
  // by finishRedirectLogin() when the page reloads.
  async signInWithGoogle() {
    if (DEMO_MODE) {
      const email = "demo.google@example.com";
      LS.set("sfs_session", { uid: "demo_google", email, name: "Demo Google User", verified: true });
      await recordLogin({ email, displayName: "Demo Google User", uid: "demo_google" }, "google");
      demoEmit();
      return {};
    }
    const { auth, A } = await loadFirebase();
    const provider = new A.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const useRedirect = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
    if (useRedirect) { await A.signInWithRedirect(auth, provider); return { redirecting: true }; }
    try {
      const res = await A.signInWithPopup(auth, provider);
      await recordLogin(res.user, "google");
      return {};
    } catch (e) {
      if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e?.code)) {
        await A.signInWithRedirect(auth, provider);
        return { redirecting: true };
      }
      throw e;
    }
  },

  // Call once on page load: if we're returning from a Google redirect sign-in,
  // record it and report success. Returns the user, or null if not a redirect.
  async finishRedirectLogin() {
    if (DEMO_MODE) return null;
    const { auth, A } = await loadFirebase();
    let res = null;
    try { res = await A.getRedirectResult(auth); } catch { return null; }
    if (res && res.user) { await recordLogin(res.user, "google"); return res.user; }
    return null;
  },

  // Admin: list recorded sign-ins (newest first) for the sign-in log / export.
  async listLogins() {
    if (DEMO_MODE) return LS.get("sfs_logins", []).slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    const { db, F } = await loadFirebase();
    const snap = await F.getDocs(F.collection(db, "logins"));
    return snap.docs.map(d => d.data()).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  },

  async resendVerification() {
    if (DEMO_MODE) return;
    const { auth, A } = await loadFirebase();
    if (auth.currentUser) await A.sendEmailVerification(auth.currentUser);
  },

  // Reloads the signed-in user (e.g. after they click the verification link). Returns fresh user or null.
  async refreshUser() {
    if (DEMO_MODE) return demoCurrent();
    const { auth } = await loadFirebase();
    const u = auth.currentUser;
    if (!u) return null;
    await u.reload();
    await u.getIdToken(true);
    return { uid: u.uid, email: u.email, name: u.displayName || "", verified: u.emailVerified };
  },

  // Founder: replace document links while status is "documents_pending".
  async updateMyDocs(appId, docs) {
    const p = { docs, docsUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    if (DEMO_MODE) { const cur = LS.get("sfs_app_" + appId, {}); LS.set("sfs_app_" + appId, { ...cur, ...p }); return p; }
    const { db, F } = await loadFirebase();
    await F.updateDoc(F.doc(db, "applications", appId), p);
    return p;
  },

  async getProfile(uid) {
    if (DEMO_MODE) return LS.get("sfs_profile_" + uid, {});
    const { db, F } = await loadFirebase();
    const s = await F.getDoc(F.doc(db, "profiles", uid));
    return s.exists() ? s.data() : {};
  },

  async saveProfile(uid, p) {
    const v = { ...p, updatedAt: new Date().toISOString() };
    if (DEMO_MODE) { LS.set("sfs_profile_" + uid, v); return; }
    const { db, F } = await loadFirebase();
    await F.setDoc(F.doc(db, "profiles", uid), v);
  },

  // Append-only audit trail of administrative actions.
  async addAudit(entry) {
    const e = { ...entry, at: new Date().toISOString() };
    if (DEMO_MODE) { const l = LS.get("sfs_audit", []); l.push(e); LS.set("sfs_audit", l); return; }
    const { db, F } = await loadFirebase();
    await F.addDoc(F.collection(db, "audit"), e);
  },

  async listAudit(appId) {
    if (DEMO_MODE) return LS.get("sfs_audit", []).filter(e => e.appId === appId).sort((a, b) => b.at.localeCompare(a.at));
    const { db, F } = await loadFirebase();
    const snap = await F.getDocs(F.query(F.collection(db, "audit"), F.where("appId", "==", appId)));
    return snap.docs.map(d => d.data()).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  },

  // Founder: records the admin created for this email.
  async getMyApplications(email) {
    email = (email || "").trim().toLowerCase();
    if (DEMO_MODE) {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("sfs_app_")) { const a = LS.get(k, {}); if (a.founderEmail === email) out.push({ uid: k.slice(8), ...a }); }
      }
      return out;
    }
    const { db, F } = await loadFirebase();
    const snap = await F.getDocs(F.query(F.collection(db, "applications"), F.where("founderEmail", "==", email)));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  },

  // Admin: create a new startup record. Returns its id.
  async createApplication(rec) {
    const now = new Date().toISOString();
    const r = { ...rec, createdAt: now, updatedAt: now };
    if (DEMO_MODE) { const id = "rec_" + Math.random().toString(36).slice(2, 10); LS.set("sfs_app_" + id, r); return id; }
    const { db, F } = await loadFirebase();
    const ref = await F.addDoc(F.collection(db, "applications"), r);
    return ref.id;
  },

  async resetPassword(email) {
    if (DEMO_MODE) throw err("demo", "Password reset works once Firebase is connected.");
    const { auth, A } = await loadFirebase();
    await A.sendPasswordResetEmail(auth, email.trim().toLowerCase());
  },

  async signOut() {
    if (DEMO_MODE) { localStorage.removeItem("sfs_session"); demoEmit(); return; }
    const { auth, A } = await loadFirebase();
    await A.signOut(auth);
  },

  async getApplication(uid) {
    if (DEMO_MODE) return LS.get("sfs_app_" + uid, null);
    const { db, F } = await loadFirebase();
    const snap = await F.getDoc(F.doc(db, "applications", uid));
    return snap.exists() ? snap.data() : null;
  },

  // Founder: save own application (doc id = uid). Only founder-editable keys are sent.
  async saveApplication(uid, data) {
    const KEYS = ["data", "docs", "status", "timeline", "createdAt", "submittedAt", "applicationId", "founderEmail"];
    const payload = { updatedAt: new Date().toISOString() };
    KEYS.forEach(k => { if (data[k] !== undefined) payload[k] = data[k]; });
    if (DEMO_MODE) { LS.set("sfs_app_" + uid, payload); return payload; }
    const { db, F } = await loadFirebase();
    await F.setDoc(F.doc(db, "applications", uid), payload, { merge: true });
    return payload;
  },

  // ── Staff (admins & reviewers) ───────────────────────────────
  // Returns "admin", "reviewer" or null
  async getRole(uid) {
    if (DEMO_MODE) return LS.get("sfs_demo_role", "admin");
    const { db, F } = await loadFirebase();
    const has = async c => { try { return (await F.getDoc(F.doc(db, c, uid))).exists(); } catch { return false; } };
    if (await has("admins")) return "admin";
    if (await has("reviewers")) return "reviewer";
    return null;
  },

  // Admin: all applications. Reviewer: only those assigned to them.
  async listApplications(role = "admin", uid = "") {
    if (DEMO_MODE) {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("sfs_app_")) out.push({ uid: k.slice(8), ...LS.get(k, {}) });
      }
      return role === "reviewer" ? out.filter(a => (a.assignedTo || []).includes(uid)) : out;
    }
    const { db, F } = await loadFirebase();
    const col = F.collection(db, "applications");
    const q = role === "reviewer" ? F.query(col, F.where("assignedTo", "array-contains", uid)) : col;
    const snap = await F.getDocs(q);
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  },

  async updateApplication(uid, patch) {
    const p = { ...patch, updatedAt: new Date().toISOString() };
    if (DEMO_MODE) { const cur = LS.get("sfs_app_" + uid, {}); LS.set("sfs_app_" + uid, { ...cur, ...p }); return; }
    const { db, F } = await loadFirebase();
    await F.updateDoc(F.doc(db, "applications", uid), p);
  },

  // Private admin notes for an application (never visible to applicants)
  async getReview(uid) {
    if (DEMO_MODE) return LS.get("sfs_review_" + uid, { notes: [] });
    const { db, F } = await loadFirebase();
    const s = await F.getDoc(F.doc(db, "reviews", uid));
    return s.exists() ? s.data() : { notes: [] };
  },

  async saveReview(uid, data) {
    if (DEMO_MODE) { LS.set("sfs_review_" + uid, data); return; }
    const { db, F } = await loadFirebase();
    await F.setDoc(F.doc(db, "reviews", uid), data);
  },

  // Scorecards: one per scorer. Admin gets all; reviewer gets only their own.
  async getScores(appUid, role, uid) {
    if (DEMO_MODE) {
      const all = LS.get("sfs_scores_" + appUid, {});
      return role === "admin" ? all : (all[uid] ? { [uid]: all[uid] } : {});
    }
    const { db, F } = await loadFirebase();
    if (role === "admin") {
      const snap = await F.getDocs(F.collection(db, "reviews", appUid, "scores"));
      return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
    }
    const s = await F.getDoc(F.doc(db, "reviews", appUid, "scores", uid));
    return s.exists() ? { [uid]: s.data() } : {};
  },

  async saveScore(appUid, uid, card) {
    const c = { ...card, at: new Date().toISOString() };
    if (DEMO_MODE) { const all = LS.get("sfs_scores_" + appUid, {}); all[uid] = c; LS.set("sfs_scores_" + appUid, all); return; }
    const { db, F } = await loadFirebase();
    await F.setDoc(F.doc(db, "reviews", appUid, "scores", uid), c);
  },

  // Reviewer accounts: { uid, name, email }
  async listReviewers() {
    if (DEMO_MODE) return Object.entries(LS.get("sfs_reviewers", {})).map(([uid, r]) => ({ uid, ...r }));
    const { db, F } = await loadFirebase();
    const snap = await F.getDocs(F.collection(db, "reviewers"));
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  },

  async addReviewer(uid, info) {
    if (DEMO_MODE) { const r = LS.get("sfs_reviewers", {}); r[uid] = info; LS.set("sfs_reviewers", r); return; }
    const { db, F } = await loadFirebase();
    await F.setDoc(F.doc(db, "reviewers", uid), { ...info, addedAt: new Date().toISOString() });
  },

  async removeReviewer(uid) {
    if (DEMO_MODE) { const r = LS.get("sfs_reviewers", {}); delete r[uid]; LS.set("sfs_reviewers", r); return; }
    const { db, F } = await loadFirebase();
    await F.deleteDoc(F.doc(db, "reviewers", uid));
  },

  // Progress / utilisation reports submitted by selected startups
  async getProgress(uid) {
    if (DEMO_MODE) return LS.get("sfs_progress_" + uid, { reports: [] });
    const { db, F } = await loadFirebase();
    const s = await F.getDoc(F.doc(db, "progress", uid));
    return s.exists() ? s.data() : { reports: [] };
  },

  async saveProgress(uid, data) {
    if (DEMO_MODE) { LS.set("sfs_progress_" + uid, data); return; }
    const { db, F } = await loadFirebase();
    await F.setDoc(F.doc(db, "progress", uid), data);
  },

  // Returns { name, size, type, path, url, uploadedAt }
  async uploadDocument(uid, key, file, folder = "applications") {
    const meta = { name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString() };
    if (DEMO_MODE) return { ...meta, path: "", url: "" };
    const { storage, S } = await loadFirebase();
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${folder}/${uid}/${key}/${Date.now()}_${safe}`;
    const r = S.ref(storage, path);
    await S.uploadBytes(r, file, { contentType: file.type });
    const url = await S.getDownloadURL(r);
    return { ...meta, path, url };
  }
};
