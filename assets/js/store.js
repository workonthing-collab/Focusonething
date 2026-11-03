// Data layer: Firebase when configured, browser-only demo store otherwise.
import { firebaseConfig, DEMO_MODE } from "./config.js";

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
  fb = { auth: auth.getAuth(a), db: fs.getFirestore(a), storage: st.getStorage(a), A: auth, F: fs, S: st };
  return fb;
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
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
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
    await A.signInWithEmailAndPassword(auth, email, password);
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

  async saveApplication(uid, data) {
    const payload = { ...data, updatedAt: new Date().toISOString() };
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
