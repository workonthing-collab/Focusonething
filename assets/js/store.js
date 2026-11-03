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
    "auth/network-request-failed": "Network error. Check your internet connection."
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

  // Returns { name, size, type, path, url, uploadedAt }
  async uploadDocument(uid, key, file) {
    const meta = { name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString() };
    if (DEMO_MODE) return { ...meta, path: "", url: "" };
    const { storage, S } = await loadFirebase();
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `applications/${uid}/${key}/${Date.now()}_${safe}`;
    const r = S.ref(storage, path);
    await S.uploadBytes(r, file, { contentType: file.type });
    const url = await S.getDownloadURL(r);
    return { ...meta, path, url };
  }
};
