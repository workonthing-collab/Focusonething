// Applicant dashboard: verification gate, online application, status tracking,
// documents, remarks, notifications, messages and profile.
import "./common.js";
import { toast, esc } from "./common.js";
import { store, friendlyError } from "./store.js";
import { site } from "./config.js";
import { mailSubmitted } from "./mail.js";
import { STEPS, STATUS, STAGES, stageIndex, flatFields, MONEY, money } from "./schema.js";

const root = document.getElementById("root");
let user = null;
let apps = [];          // all records visible to this applicant
let app = null;         // current record
let tab = "overview";
let stepIdx = 0, dirty = false, saveTimer = null;

const val = k => app.data?.[k] ?? "";
const show = k => MONEY.has(k) ? money(val(k)) : val(k);
const isLink = v => /^https?:\/\/\S+\.\S+/.test(v || "");
const fmt = d => d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const LSget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const LSset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (dirty) await save(true);
  await store.signOut();
  location.replace("login.html");
});
window.addEventListener("beforeunload", e => { if (dirty) { save(true); e.preventDefault(); } });

store.onUser(async u => {
  if (!u) { location.replace("login.html"); return; }
  if (user && user.uid === u.uid && user.verified === u.verified) return;
  user = u;
  document.getElementById("userEmail").textContent = u.email;
  if (!store.demo && !u.verified) return renderVerify();
  await load();
});

// ── Email verification gate ───────────────────────────────────
function renderVerify() {
  root.innerHTML = `
    <div class="panel" style="max-width:580px;margin:40px auto;text-align:center">
      <h2>Verify your email to continue</h2>
      <p class="muted">We sent a verification link to <b>${esc(user.email)}</b>. Open it, then return here and click the button below.</p>
      <p class="small muted">Can't find it? Check your spam or promotions folder.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">
        <button class="btn btn-primary" id="checkBtn">I've verified, continue</button>
        <button class="btn btn-outline" id="resendBtn">Resend link</button>
      </div>
    </div>`;
  root.querySelector("#checkBtn").addEventListener("click", async () => {
    try {
      const u = await store.refreshUser();
      if (u?.verified) { user = u; await load(); }
      else toast("Not verified yet. Open the link in your email first.");
    } catch (e) { toast(friendlyError(e)); }
  });
  root.querySelector("#resendBtn").addEventListener("click", async e => {
    e.target.disabled = true;
    try { await store.resendVerification(); toast("Verification email sent"); }
    catch (err) { toast(friendlyError(err)); }
    setTimeout(() => (e.target.disabled = false), 30000);
  });
}

// ── Load ──────────────────────────────────────────────────────
async function load(selectId) {
  root.innerHTML = `<div class="spinner"></div>`;
  try { apps = await store.getMyApplications(user.email); }
  catch (e) {
    try { if (!store.demo && await store.getRole(user.uid)) { location.replace("admin.html"); return; } } catch {}
    root.innerHTML = `<div class="alert alert-error">Couldn't load your application. ${esc(friendlyError(e))}</div>`; return;
  }
  apps.forEach(a => { a.data ||= {}; a.docs ||= {}; a.timeline ||= []; a.messages ||= []; });
  apps.sort((a, b) => (b.submittedAt || b.updatedAt || "").localeCompare(a.submittedAt || a.updatedAt || ""));

  if (!apps.length) {
    try { if (!store.demo && await store.getRole(user.uid)) { location.replace("admin.html"); return; } } catch {}
    return renderWelcome();
  }
  app = apps.find(a => a.uid === selectId) || apps.find(a => a.status !== "draft") || apps[0];
  app.status === "draft" ? renderForm() : renderStatus();
}

function newDraft() {
  const now = new Date().toISOString();
  return { uid: user.uid, status: "draft", founderEmail: user.email.toLowerCase(), createdAt: now,
    data: { founderName: user.name || "", founderEmail: user.email.toLowerCase() }, docs: {}, timeline: [], messages: [] };
}

function renderWelcome() {
  root.innerHTML = `
    <div class="panel" style="max-width:760px;margin:24px auto">
      <span class="badge badge-draft">New application</span>
      <h1 style="font-size:1.6rem;margin-top:12px">Welcome, ${esc(user.name || "founder")}</h1>
      <p class="muted">You haven't started an application yet. It takes about 20–30 minutes. You can save and return at any time before submitting.</p>
      <div class="grid-2" style="margin:20px 0">
        <div class="card"><h3 style="font-size:1rem">Before you begin</h3><ul class="checklist small"><li>Company registration details (CIN / LLPIN)</li><li>Founder and team details</li><li>Your pitch and funding requirement</li><li>Links to your documents (Google Drive / Dropbox)</li></ul></div>
        <div class="card"><h3 style="font-size:1rem">Please note</h3><ul class="checklist small"><li>There's one application per account</li><li>Once submitted, it's locked for review</li><li>Applying does not guarantee funding</li><li>Check <a href="index.html#eligibility">eligibility</a> first</li></ul></div>
      </div>
      <button class="btn btn-apply btn-lg" id="startBtn">Start application</button>
    </div>`;
  root.querySelector("#startBtn").addEventListener("click", () => { app = newDraft(); apps = [app]; stepIdx = 0; renderForm(); });
}

// ── Draft saving ──────────────────────────────────────────────
async function save(silent = false) {
  clearTimeout(saveTimer);
  setSaveState("Saving…");
  try {
    await store.saveApplication(user.uid, app);
    app.updatedAt = new Date().toISOString();
    dirty = false; setSaveState("All changes saved");
    if (!silent) toast("Draft saved");
    return true;
  } catch (e) { setSaveState("Not saved"); toast(friendlyError(e)); return false; }
}
function queueSave() { dirty = true; setSaveState("Unsaved changes"); clearTimeout(saveTimer); saveTimer = setTimeout(() => save(true), 1500); }
function setSaveState(t) { const el = document.getElementById("saveState"); if (el) el.textContent = t; }

// ── Form ──────────────────────────────────────────────────────
function stepComplete(s) {
  if (s.id === "review") return false;
  return flatFields(s).every(f => !f.req || String(val(f.k)).trim() !== "") && (s.docs || []).every(d => !d.req || app.docs[d.k]);
}
function progressPct() { const real = STEPS.filter(s => s.id !== "review"); return Math.round(real.filter(stepComplete).length / real.length * 100); }

function fieldHTML(f) {
  const v = esc(val(f.k));
  const req = f.req ? ' <span class="req">*</span>' : "";
  const locked = f.k === "founderEmail";
  const common = `id="f-${f.k}" data-k="${f.k}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""} ${locked ? "readonly" : ""} ${f.req ? 'aria-required="true"' : ""}`;
  let input;
  if (f.type === "select") input = `<select ${common}><option value="">Select…</option>${f.options.map(o => `<option${o === val(f.k) ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  else if (f.type === "textarea") input = `<textarea ${common} ${f.max ? `maxlength="${f.max}"` : ""}>${v}</textarea>${f.max ? `<div class="char-count" data-count="${f.k}">${String(val(f.k)).length} / ${f.max}</div>` : ""}`;
  else {
    const attrs = [f.min != null ? `min="${f.min}"` : "", f.max && f.type === "number" ? `max="${f.max}"` : "", f.max && f.type !== "number" ? `maxlength="${f.max}"` : ""].join(" ");
    input = `<input ${common} type="${f.type || "text"}" value="${v}" ${attrs}>`;
  }
  const hint = locked ? "Your login email. Updates about this application are sent here." : f.hint;
  return `<div class="field" data-field="${f.k}"><label for="f-${f.k}">${esc(f.label)}${req}</label>${input}${hint ? `<p class="hint">${esc(hint)}</p>` : ""}<p class="err" role="alert"></p></div>`;
}

function docHTML(d, doc) {
  const url = doc?.url || "";
  return `<div class="upload${isLink(url) ? " has-file" : ""}" data-doc="${d.k}" style="display:block">
    <label for="doc-${d.k}" style="margin-bottom:4px">${esc(d.label)}${d.req ? ' <span class="req">*</span>' : ""}</label>
    <input id="doc-${d.k}" type="url" data-link="${d.k}" value="${esc(url)}" placeholder="https://drive.google.com/...">
    <p class="hint">${esc(d.hint ? d.hint + " · " : "")}${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Open link</a> to check it works` : "Paste a Google Drive / Dropbox / OneDrive link"}</p>
    <p class="err" style="display:none" role="alert">Paste a full link starting with https://</p>
  </div>`;
}
const DOC_HELP = `<div class="alert alert-info"><b>How to share documents:</b> upload each file to Google Drive (or Dropbox/OneDrive) → <b>Share</b> → set access to <b>"Anyone with the link can view"</b> → copy the link and paste it below.</div>`;

function renderForm() {
  const s = STEPS[stepIdx];
  const pct = progressPct();
  root.innerHTML = `
    <div class="dash-head">
      <div>
        <p class="small muted" style="margin:0 0 4px">New application · <span class="badge badge-draft">Draft</span></p>
        <h1>${esc(val("companyName") || "Your startup application")}</h1>
      </div>
      <span class="save-state" id="saveState" aria-live="polite">${app.updatedAt ? "All changes saved" : ""}</span>
    </div>
    <div class="dash-grid">
      <aside class="side-card">
        <ol class="stepper">${STEPS.map((st, i) => `
          <li><button type="button" data-go="${i}" class="${i === stepIdx ? "active" : ""} ${stepComplete(st) ? "done" : ""}" ${i === stepIdx ? 'aria-current="step"' : ""}>
            <span class="num">${stepComplete(st) && i !== stepIdx ? "✓" : i + 1}</span>${esc(st.title)}
          </button></li>`).join("")}
        </ol>
        <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div style="width:${pct}%"></div></div>
        <p class="small muted" style="margin:0">${pct}% complete</p>
      </aside>
      <section class="panel">
        <h2>${esc(s.title)}</h2>
        ${s.id === "review" ? reviewHTML() : `
          ${s.id === "documents" ? `${DOC_HELP}${s.docs.map(d => docHTML(d, app.docs[d.k])).join("")}<div style="height:8px"></div>` : ""}
          ${(s.fields || []).map(f => f.row ? `<div class="field-row">${f.row.map(fieldHTML).join("")}</div>` : fieldHTML(f)).join("")}`}
        <div class="panel-actions">
          <button type="button" class="btn btn-ghost" data-nav="-1" ${stepIdx === 0 ? "disabled" : ""}>← Back</button>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${s.id === "review"
              ? `<button type="button" class="btn btn-apply" id="submitBtn">Submit application</button>`
              : `<button type="button" class="btn btn-outline" id="saveBtn">Save draft</button>
                 <button type="button" class="btn btn-primary" data-nav="1">Save &amp; continue →</button>`}
          </div>
        </div>
      </section>
    </div>`;
  bindForm();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindForm() {
  root.querySelectorAll("[data-k]").forEach(el => {
    if (el.readOnly) return;
    el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
      app.data[el.dataset.k] = el.value;
      const c = root.querySelector(`[data-count="${el.dataset.k}"]`);
      if (c) c.textContent = `${el.value.length} / ${el.maxLength}`;
      el.closest(".field")?.classList.remove("invalid");
      queueSave();
    });
  });
  root.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(+b.dataset.go)));
  root.querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => {
    const d = +b.dataset.nav;
    if (d > 0 && !validateStep(STEPS[stepIdx])) { toast("Please fix the highlighted fields"); return; }
    go(stepIdx + d);
  }));
  root.querySelector("#saveBtn")?.addEventListener("click", () => save());
  root.querySelector("#submitBtn")?.addEventListener("click", submit);
  bindLinks(app.docs, queueSave);
  root.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => go(+b.dataset.edit)));
}

function bindLinks(target, onChange) {
  root.querySelectorAll("[data-link]").forEach(inp => inp.addEventListener("input", () => {
    const v = inp.value.trim(), box = inp.closest(".upload");
    if (v) target[inp.dataset.link] = { url: v, name: v, addedAt: new Date().toISOString() };
    else delete target[inp.dataset.link];
    box.classList.toggle("has-file", isLink(v));
    box.style.borderColor = ""; box.querySelector(".err").style.display = "none";
    onChange();
  }));
}

async function go(i) {
  if (i < 0 || i >= STEPS.length) return;
  if (dirty) await save(true);
  stepIdx = i; renderForm();
}

function validateDocs(docDefs, docs) {
  let ok = true;
  for (const d of docDefs) {
    const u = docs[d.k]?.url;
    const box = root.querySelector(`[data-doc="${d.k}"]`);
    const bad = (u && !isLink(u)) || (d.req && !u);
    if (bad) { ok = false; if (box) { box.style.setProperty("border-color", "var(--danger)"); if (u) box.querySelector(".err").style.display = "block"; } }
  }
  return ok;
}

function validateStep(s) {
  let ok = true;
  for (const f of flatFields(s)) {
    const v = String(val(f.k)).trim();
    let msg = "";
    if (f.req && !v) msg = "This field is required";
    else if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = "Enter a valid email";
    else if (v && f.type === "url" && !isLink(v)) msg = "Enter a full link starting with https://";
    else if (v && f.pattern && !new RegExp(f.pattern).test(v)) msg = f.patternMsg || "Invalid format";
    else if (v && f.type === "number" && ((f.min != null && +v < f.min) || (f.max != null && +v > f.max))) msg = `Enter a value between ${f.min ?? 0} and ${f.max ?? "∞"}`;
    else if (v && f.type === "date" && new Date(v) > new Date()) msg = "Date can't be in the future";
    const el = root.querySelector(`[data-field="${f.k}"]`);
    if (el) { el.classList.toggle("invalid", !!msg); el.querySelector(".err").textContent = msg; }
    if (msg) ok = false;
  }
  if (s.docs && !validateDocs(s.docs, app.docs)) ok = false;
  if (!ok) root.querySelector(".invalid, .upload[style*=danger]")?.scrollIntoView({ behavior: "smooth", block: "center" });
  return ok;
}

function reviewHTML() {
  const incomplete = STEPS.filter(s => s.id !== "review" && !stepComplete(s));
  const groups = STEPS.filter(s => s.id !== "review").map((s, i) => {
    const docRows = (s.docs || []).map(d => `<tr><th>${esc(d.label)}</th><td>${app.docs[d.k] ? `<a href="${esc(app.docs[d.k].url)}" target="_blank" rel="noopener">Open link</a>` : '<span class="muted">Not provided</span>'}</td></tr>`);
    const rows = flatFields(s).map(f => `<tr><th>${esc(f.label)}</th><td>${esc(show(f.k)) || '<span class="muted">—</span>'}</td></tr>`);
    return `<div class="summary-group"><h3>${esc(s.title)} <button type="button" class="link-btn" data-edit="${i}">Edit</button></h3><table class="summary-table">${docRows.join("")}${rows.join("")}</table></div>`;
  }).join("");
  return `
    ${incomplete.length ? `<div class="alert alert-error">Complete these sections before submitting: ${incomplete.map(s => esc(s.title)).join(", ")}.</div>` : `<div class="alert alert-ok">Everything looks complete. Review your answers, then submit.</div>`}
    ${groups}
    <div class="field" style="display:flex;gap:10px;align-items:flex-start;margin-top:8px">
      <input id="declare" type="checkbox" style="margin-top:5px;width:18px;height:18px;flex:none">
      <label for="declare" style="font-weight:400;font-size:.9rem">I declare that the information and documents submitted are true and complete to the best of my knowledge. I understand that false information may lead to rejection, that applying does not guarantee funding, and that I won't be able to edit this application after submitting.</label>
    </div>`;
}

async function submit() {
  if (STEPS.some(s => s.id !== "review" && !stepComplete(s))) { toast("Some sections are incomplete"); return; }
  if (!document.getElementById("declare").checked) { toast("Please tick the declaration"); return; }
  const btn = document.getElementById("submitBtn");
  if (btn.dataset.confirm !== "1") {
    btn.dataset.confirm = "1"; btn.textContent = "Click again to confirm submission";
    setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ""; btn.textContent = "Submit application"; } }, 5000);
    return;
  }
  btn.disabled = true; btn.textContent = "Submitting…";
  const now = new Date().toISOString();
  const prev = { status: app.status, timeline: app.timeline, applicationId: app.applicationId, submittedAt: app.submittedAt };
  app.status = "submitted";
  app.applicationId ||= "SFS-" + new Date().getFullYear() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  app.submittedAt = now;
  app.timeline = [{ status: "submitted", at: now, by: "applicant" }];
  if (await save(true)) { toast("Application submitted"); tab = "overview"; renderStatus(); mailSubmitted(app); }
  else { Object.assign(app, prev); btn.disabled = false; btn.textContent = "Submit application"; }
}

// ── Status dashboard ──────────────────────────────────────────
function events(a) {
  const ev = (a.timeline || []).map(t => ({ at: t.at, kind: "status", status: t.status, text: t.remark || "", title: `Status changed to ${STATUS[t.status] || t.status}` }));
  (a.messages || []).forEach(m => ev.push({ at: m.at, kind: "message", text: m.text, title: "Message from the programme team" }));
  if (a.docsUpdatedAt) ev.push({ at: a.docsUpdatedAt, kind: "docs", title: "You updated your documents", own: true });
  return ev.filter(e => e.at).sort((x, y) => y.at.localeCompare(x.at));
}
const seenKey = a => "sfs_seen_" + (a.uid || a.applicationId);
const unread = a => { const seen = LSget(seenKey(a), ""); return events(a).filter(e => !e.own && e.at > seen).length; };
const markSeen = a => { const e = events(a)[0]; if (e) LSset(seenKey(a), e.at); };

function progressHTML(a) {
  const st = a.status, idx = stageIndex(st);
  return `<ol class="track" aria-label="Application progress">${STAGES.map((s, i) => {
    let cls = i < idx ? "done" : i === idx ? "now" : "";
    if (i === idx && st === "selected") cls = "done";
    if (i === idx && st === "rejected") cls = "fail";
    if (i === idx && st === "documents_pending") cls = "warn";
    const label = i === idx && (st === "documents_pending" || st === "rejected" || st === "selected") ? STATUS[st] : s.label;
    return `<li class="${cls}"><span class="dot">${cls === "done" ? "✓" : cls === "fail" ? "✕" : cls === "warn" ? "!" : i + 1}</span><span class="lbl">${esc(label)}</span></li>`;
  }).join("")}</ol>`;
}

const NOTE = {
  submitted: "Your application has been received and is waiting for initial review.",
  initial_review: "Our team is screening your application and verifying your documents.",
  documents_pending: "Some documents are missing or need to be updated. Please update them in the Documents tab.",
  under_evaluation: "Your application is being scored by the assigned reviewers.",
  under_review: "Your application is being scored by the assigned reviewers.",
  shortlisted: "Your application has been shortlisted. The programme team will contact you about the next step.",
  selected: "Your startup has been selected. Funding terms will be shared and confirmed through a signed funding agreement.",
  rejected: "Your application was not selected in this cycle. Thank you for applying."
};

function renderStatus() {
  const a = app, d = a.data, st = a.status;
  const n = unread(a);
  const latestRemark = (a.timeline || []).slice().reverse().find(t => t.remark);
  const tabs = [["overview", "Overview"], ["application", "Application"], ["documents", "Documents"], ["messages", `Messages${n ? ` <span class="count">${n}</span>` : ""}`], ["profile", "Profile"]];
  root.innerHTML = `
    ${apps.length > 1 ? `<div class="field" style="max-width:420px"><label for="appSel">Application</label><select id="appSel">${apps.map(x => `<option value="${esc(x.uid)}"${x === a ? " selected" : ""}>${esc(x.data?.companyName || "Application")} · ${esc(x.applicationId || "Draft")}</option>`).join("")}</select></div>` : ""}
    <div class="dash-head">
      <div>
        <p class="small muted" style="margin:0 0 4px">Application ID · <b>${esc(a.applicationId || "—")}</b> · Submitted ${esc(fmtDate(a.submittedAt))}</p>
        <h1>${esc(d.companyName || "Your application")}</h1>
      </div>
      <span class="badge badge-${esc(st)}">${esc(STATUS[st] || st)}</span>
    </div>
    <div class="panel" style="margin-bottom:20px">${progressHTML(a)}</div>
    <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? "active" : ""}" data-tab="${k}">${l}</button>`).join("")}</nav>
    <section class="panel" id="tabPanel">${tabHTML(tab, a, latestRemark)}</section>`;
  root.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tab; renderStatus(); }));
  root.querySelector("#appSel")?.addEventListener("change", e => { app = apps.find(x => x.uid === e.target.value); tab = "overview"; app.status === "draft" ? renderForm() : renderStatus(); });
  if (tab === "overview" || tab === "messages") markSeen(a);
  bindTab(tab, a);
}

function tabHTML(t, a, latestRemark) {
  const st = a.status;
  if (t === "overview") {
    const ev = events(a).slice(0, 6), seen = LSget(seenKey(a), "");
    return `
      <div class="alert ${st === "rejected" ? "alert-error" : st === "documents_pending" ? "alert-warn" : st === "selected" ? "alert-ok" : "alert-info"}">${esc(NOTE[st] || "")}</div>
      ${latestRemark ? `<div class="remark"><span>Latest remark from the programme team · ${esc(fmt(latestRemark.at))}</span>${esc(latestRemark.remark)}</div>` : ""}
      ${st === "documents_pending" ? `<button class="btn btn-primary" data-tab-go="documents" style="margin-bottom:18px">Update documents</button>` : ""}
      ${fundingHTML(a)}
      <h2 style="font-size:1.1rem;margin-top:8px">Notifications</h2>
      ${ev.length ? `<ul class="notif">${ev.map(e => `<li class="${!e.own && e.at > seen ? "new" : ""}"><b>${esc(e.title)}</b>${e.text ? `<p>${esc(e.text)}</p>` : ""}<time>${esc(fmt(e.at))}</time></li>`).join("")}</ul>` : '<p class="small muted">No notifications yet.</p>'}`;
  }
  if (t === "application") {
    return `<p class="small muted">Submitted on ${esc(fmt(a.submittedAt))}. The application is locked for review. For corrections, email <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> quoting your Application ID.</p>
      ${STEPS.filter(s => s.id !== "review" && s.id !== "documents").map(s => {
        const rows = flatFields(s).filter(f => a.data[f.k] !== undefined && a.data[f.k] !== "").map(f => `<tr><th>${esc(f.label)}</th><td>${esc(MONEY.has(f.k) ? money(a.data[f.k]) : a.data[f.k])}</td></tr>`).join("");
        return rows ? `<div class="summary-group"><h3>${esc(s.title)}</h3><table class="summary-table">${rows}</table></div>` : "";
      }).join("") || '<p class="muted">Details were recorded by the programme team.</p>'}`;
  }
  if (t === "documents") {
    const defs = STEPS.find(s => s.id === "documents").docs;
    if (a.status === "documents_pending") {
      return `<div class="alert alert-warn">The programme team has asked for updated documents. Update the links below and click Submit.</div>${DOC_HELP}
        <div id="docEdit">${defs.map(d => docHTML(d, a.docs[d.k])).join("")}</div>
        <div class="panel-actions"><span class="small muted">${a.docsUpdatedAt ? "Last updated " + esc(fmt(a.docsUpdatedAt)) : ""}</span><button class="btn btn-primary" id="docSubmit">Submit updated documents</button></div>`;
    }
    return `<table class="summary-table">${defs.map(d => `<tr><th>${esc(d.label)}</th><td>${a.docs[d.k]?.url ? `<a href="${esc(a.docs[d.k].url)}" target="_blank" rel="noopener">Open document</a>` : '<span class="muted">Not provided</span>'}</td></tr>`).join("")}</table>
      <p class="small muted" style="margin-top:14px">Documents can be updated only when the programme team requests it (status "Documents Pending"). Please keep your shared links accessible until a decision is made.</p>`;
  }
  if (t === "messages") {
    const items = [...(a.messages || []).map(m => ({ at: m.at, text: m.text, kind: "Message" })), ...(a.timeline || []).filter(x => x.remark).map(x => ({ at: x.at, text: x.remark, kind: `Remark · ${STATUS[x.status] || x.status}` }))].sort((x, y) => y.at.localeCompare(x.at));
    return items.length ? items.map(m => `<div class="note"><div class="meta" style="margin:0 0 4px">${esc(m.kind)} · ${esc(fmt(m.at))}</div>${esc(m.text)}</div>`).join("") : '<p class="muted">No messages yet. Messages and review remarks from the programme team will appear here.</p>';
  }
  if (t === "profile") {
    return `<div id="profileBox"><div class="spinner" style="margin:20px auto"></div></div>`;
  }
  return "";
}

function bindTab(t, a) {
  root.querySelectorAll("[data-tab-go]").forEach(b => b.addEventListener("click", () => { tab = b.dataset.tabGo; renderStatus(); }));
  if (t === "documents" && root.querySelector("#docSubmit")) {
    const defs = STEPS.find(s => s.id === "documents").docs;
    const docs = JSON.parse(JSON.stringify(a.docs || {}));
    bindLinks(docs, () => {});
    root.querySelector("#docSubmit").addEventListener("click", async e => {
      if (!validateDocs(defs, docs)) { toast("Please fix the highlighted links"); return; }
      e.target.disabled = true;
      try { const p = await store.updateMyDocs(a.uid, docs); Object.assign(a, { docs }, p); toast("Documents submitted. The team will review them."); renderStatus(); }
      catch (err) { toast(friendlyError(err)); e.target.disabled = false; }
    });
  }
  if (t === "profile") renderProfile();
}

async function renderProfile() {
  const box = root.querySelector("#profileBox");
  let p = {};
  try { p = await store.getProfile(user.uid); } catch {}
  const v = k => esc(p[k] ?? (k === "name" ? user.name : ""));
  box.innerHTML = `
    <div class="field-row">
      <div class="field"><label for="p-name">Full name</label><input id="p-name" value="${v("name")}"></div>
      <div class="field"><label>Login email</label><input value="${esc(user.email)}" readonly><p class="hint">✓ Verified</p></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="p-phone">Mobile</label><input id="p-phone" type="tel" value="${v("phone")}" placeholder="10-digit mobile"></div>
      <div class="field"><label for="p-role">Designation</label><input id="p-role" value="${v("role")}" placeholder="e.g. Founder & CEO"></div>
    </div>
    <div class="field"><label for="p-li">LinkedIn profile</label><input id="p-li" type="url" value="${v("linkedin")}" placeholder="https://linkedin.com/in/..."></div>
    <div class="panel-actions"><span class="small muted">Your profile is separate from your submitted application.</span><button class="btn btn-primary" id="pSave">Save profile</button></div>`;
  box.querySelector("#pSave").addEventListener("click", async e => {
    const phone = box.querySelector("#p-phone").value.trim(), li = box.querySelector("#p-li").value.trim();
    if (phone && !/^[6-9]\d{9}$/.test(phone.replace(/\D/g, "").slice(-10))) { toast("Enter a valid 10-digit mobile number"); return; }
    if (li && !isLink(li)) { toast("LinkedIn link must start with https://"); return; }
    e.target.disabled = true;
    try { await store.saveProfile(user.uid, { name: box.querySelector("#p-name").value.trim(), phone, role: box.querySelector("#p-role").value.trim(), linkedin: li }); toast("Profile saved"); }
    catch (err) { toast(friendlyError(err)); }
    e.target.disabled = false;
  });
}

// ── Funding (shown only when the team has entered real details) ──
const TR_LABEL = { planned: "Planned", due: "Due", released: "Released", on_hold: "On hold" };
const TR_BADGE = { planned: "draft", due: "documents_pending", released: "selected", on_hold: "rejected" };
function fundingHTML(a) {
  const f = a.funding;
  if (a.status !== "selected") return "";
  if (!f || !f.sanctioned) return `<div class="card" style="margin-bottom:18px"><h3 style="font-size:1rem">Funding</h3><p class="small muted" style="margin:0">Funding terms will appear here once they are finalised in your funding agreement.</p></div>`;
  const tr = f.tranches || [];
  const released = tr.filter(t => t.status === "released").reduce((x, t) => x + (+t.amount || 0), 0);
  return `<div class="card" style="margin-bottom:18px">
    <h3 style="font-size:1rem">Funding</h3>
    <table class="summary-table" style="margin-bottom:12px">
      <tr><th>Sanctioned amount</th><td><b>${esc(money(f.sanctioned))}</b></td></tr>
      <tr><th>Instrument</th><td>${esc(f.instrument || "—")}</td></tr>
      ${f.agreementDate ? `<tr><th>Agreement date</th><td>${esc(fmtDate(f.agreementDate))}</td></tr>` : ""}
      <tr><th>Released so far</th><td>${esc(money(released) || "₹0")}</td></tr>
    </table>
    ${tr.length ? `<div class="table-wrap"><table class="data" style="min-width:520px"><thead><tr><th>Tranche</th><th>Amount</th><th>Milestone</th><th>Status</th><th>Released on</th></tr></thead><tbody>
      ${tr.map(t => `<tr style="cursor:default"><td><b>${esc(t.label)}</b></td><td>${esc(money(t.amount) || "—")}</td><td>${esc(t.milestone || "—")}</td><td><span class="badge badge-${TR_BADGE[t.status] || "draft"}">${TR_LABEL[t.status] || esc(t.status)}</span></td><td class="small">${t.releasedOn ? esc(fmtDate(t.releasedOn)) : "—"}${t.reference ? `<div class="muted">Ref: ${esc(t.reference)}</div>` : ""}</td></tr>`).join("")}
    </tbody></table></div>` : ""}
  </div>`;
}
