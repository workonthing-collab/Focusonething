// Applicant dashboard: multi-step application, uploads, review & submit, status.
import "./common.js";
import { toast, esc } from "./common.js";
import { store, friendlyError } from "./store.js";
import { site } from "./config.js";
import { mailSubmitted } from "./mail.js";
import { STEPS, STATUS, FLOW, flatFields, MONEY, money } from "./schema.js";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.ppt,.pptx,.doc,.docx,.xls,.xlsx";

// ── State ─────────────────────────────────────────────────────
let user = null;
let app = null;
let stepIdx = 0;
let dirty = false;
let saveTimer = null;
const root = document.getElementById("root");

const val = k => app.data?.[k] ?? "";
const show = k => MONEY.has(k) ? money(val(k)) : val(k);

// ── Boot ──────────────────────────────────────────────────────
document.getElementById("logoutBtn").addEventListener("click", async () => {
  if (dirty) await save(true);
  await store.signOut();
  location.replace("login.html");
});

store.onUser(async u => {
  if (!u) { location.replace("login.html"); return; }
  if (user && user.uid === u.uid) return;
  user = u;
  document.getElementById("userEmail").textContent = u.email;
  try {
    app = await store.getApplication(u.uid);
  } catch (e) {
    root.innerHTML = `<div class="alert alert-error">Couldn't load your application. ${esc(friendlyError(e))}</div>`;
    return;
  }
  if (!app) {
    app = { status: "draft", data: { founderName: u.name || "", founderEmail: u.email }, docs: {}, timeline: [], createdAt: new Date().toISOString() };
  }
  app.data ||= {}; app.docs ||= {}; app.timeline ||= [];
  app.status === "draft" ? renderForm() : renderStatus();
});

window.addEventListener("beforeunload", e => { if (dirty) { save(true); e.preventDefault(); } });

// ── Saving ────────────────────────────────────────────────────
async function save(silent = false) {
  clearTimeout(saveTimer);
  setSaveState("Saving…");
  try {
    await store.saveApplication(user.uid, app);
    dirty = false;
    setSaveState("All changes saved");
    if (!silent) toast("Saved");
    return true;
  } catch (e) {
    setSaveState("Not saved");
    toast(friendlyError(e));
    return false;
  }
}
function queueSave() {
  dirty = true; setSaveState("Unsaved changes");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(true), 1500);
}
function setSaveState(t) { const el = document.getElementById("saveState"); if (el) el.textContent = t; }

// ── Completion ────────────────────────────────────────────────
function stepComplete(s) {
  if (s.id === "review") return false;
  const fieldsOk = flatFields(s).every(f => !f.req || String(val(f.k)).trim() !== "");
  const docsOk = (s.docs || []).every(d => !d.req || app.docs[d.k]);
  return fieldsOk && docsOk;
}
function progressPct() {
  const real = STEPS.filter(s => s.id !== "review");
  return Math.round(real.filter(stepComplete).length / real.length * 100);
}

// ── Form rendering ────────────────────────────────────────────
function fieldHTML(f) {
  const v = esc(val(f.k));
  const req = f.req ? ' <span class="req">*</span>' : "";
  const common = `id="f-${f.k}" data-k="${f.k}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""}`;
  let input;
  if (f.type === "select") {
    input = `<select ${common}><option value="">Select…</option>${f.options.map(o => `<option${o === val(f.k) ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  } else if (f.type === "textarea") {
    input = `<textarea ${common} ${f.max ? `maxlength="${f.max}"` : ""}>${v}</textarea>${f.max ? `<div class="char-count" data-count="${f.k}">${String(val(f.k)).length} / ${f.max}</div>` : ""}`;
  } else {
    const attrs = [f.min != null ? `min="${f.min}"` : "", f.max && f.type === "number" ? `max="${f.max}"` : "", f.max && f.type !== "number" ? `maxlength="${f.max}"` : ""].join(" ");
    input = `<input ${common} type="${f.type || "text"}" value="${v}" ${attrs}>`;
  }
  return `<div class="field" data-field="${f.k}"><label for="f-${f.k}">${esc(f.label)}${req}</label>${input}${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ""}<p class="err"></p></div>`;
}

function docHTML(d) {
  const file = app.docs[d.k];
  return `<div class="upload${file ? " has-file" : ""}" data-doc="${d.k}">
    <div>
      <b>${esc(d.label)}${d.req ? ' <span style="color:var(--danger)">*</span>' : ""}</b>
      ${file ? `<span class="file-name">${file.url ? `<a href="${esc(file.url)}" target="_blank" rel="noopener">${esc(file.name)}</a>` : esc(file.name)} · ${(file.size / 1024 / 1024).toFixed(2)} MB</span>` : `<span class="small muted">${esc(d.hint || "PDF, image or Office file")} · max ${site.maxUploadMB} MB</span>`}
    </div>
    <div style="display:flex;gap:8px">
      ${file ? `<button type="button" class="btn btn-ghost btn-sm" data-remove="${d.k}">Remove</button>` : ""}
      <label class="btn btn-outline btn-sm" style="margin:0">${file ? "Replace" : "Upload"}<input type="file" accept="${ACCEPT}" data-file="${d.k}"></label>
    </div>
  </div>`;
}

function renderForm() {
  const s = STEPS[stepIdx];
  const pct = progressPct();
  root.innerHTML = `
    <div class="dash-head">
      <div>
        <p class="small muted" style="margin:0 0 4px">Application · <span class="badge badge-draft">Draft</span></p>
        <h1>${esc(val("companyName") || "Your startup application")}</h1>
      </div>
      <span class="save-state" id="saveState">${app.updatedAt ? "All changes saved" : ""}</span>
    </div>
    <div class="dash-grid">
      <aside class="side-card">
        <ol class="stepper">${STEPS.map((st, i) => `
          <li><button type="button" data-go="${i}" class="${i === stepIdx ? "active" : ""} ${stepComplete(st) ? "done" : ""}">
            <span class="num">${stepComplete(st) && i !== stepIdx ? "✓" : i + 1}</span>${esc(st.title)}
          </button></li>`).join("")}
        </ol>
        <div class="progress"><div style="width:${pct}%"></div></div>
        <p class="small muted" style="margin:0">${pct}% complete</p>
      </aside>
      <section class="panel">
        <h2>${esc(s.title)}</h2>
        ${s.id === "review" ? reviewHTML() : `
          ${s.id === "documents" ? `<p class="muted small">Upload clear, readable copies. Files marked * are required.</p>${s.docs.map(docHTML).join("")}<div style="height:8px"></div>` : ""}
          ${(s.fields || []).map(f => f.row ? `<div class="field-row">${f.row.map(fieldHTML).join("")}</div>` : fieldHTML(f)).join("")}
        `}
        <div class="panel-actions">
          <button type="button" class="btn btn-ghost" data-nav="-1" ${stepIdx === 0 ? "disabled" : ""}>← Back</button>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${s.id === "review"
              ? `<button type="button" class="btn btn-primary" id="submitBtn">Submit application</button>`
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
    const ev = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(ev, () => {
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
  root.querySelectorAll("[data-file]").forEach(inp => inp.addEventListener("change", () => upload(inp.dataset.file, inp.files[0])));
  root.querySelectorAll("[data-remove]").forEach(b => b.addEventListener("click", () => {
    delete app.docs[b.dataset.remove]; queueSave(); renderForm();
  }));
  root.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => go(+b.dataset.edit)));
}

async function go(i) {
  if (i < 0 || i >= STEPS.length) return;
  if (dirty) await save(true);
  stepIdx = i;
  renderForm();
}

// ── Validation ────────────────────────────────────────────────
function validateStep(s) {
  let ok = true;
  for (const f of flatFields(s)) {
    const v = String(val(f.k)).trim();
    let msg = "";
    if (f.req && !v) msg = "This field is required";
    else if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) msg = "Enter a valid email";
    else if (v && f.type === "url" && !/^https?:\/\/\S+\.\S+/.test(v)) msg = "Enter a full link starting with https://";
    else if (v && f.pattern && !new RegExp(f.pattern).test(v)) msg = f.patternMsg || "Invalid format";
    else if (v && f.type === "number" && ((f.min != null && +v < f.min) || (f.max != null && +v > f.max))) msg = `Enter a value between ${f.min ?? 0} and ${f.max ?? "∞"}`;
    else if (v && f.type === "date" && new Date(v) > new Date()) msg = "Date can't be in the future";
    const el = root.querySelector(`[data-field="${f.k}"]`);
    if (el) { el.classList.toggle("invalid", !!msg); el.querySelector(".err").textContent = msg; }
    if (msg) ok = false;
  }
  for (const d of s.docs || []) {
    if (d.req && !app.docs[d.k]) {
      ok = false;
      root.querySelector(`[data-doc="${d.k}"]`)?.style.setProperty("border-color", "var(--danger)");
    }
  }
  if (!ok) root.querySelector(".invalid")?.scrollIntoView({ behavior: "smooth", block: "center" });
  return ok;
}

// ── Uploads ───────────────────────────────────────────────────
async function upload(key, file) {
  if (!file) return;
  if (file.size > site.maxUploadMB * 1024 * 1024) { toast(`File is larger than ${site.maxUploadMB} MB`); return; }
  const box = root.querySelector(`[data-doc="${key}"]`);
  box.querySelector(".btn-outline").textContent = "Uploading…";
  try {
    app.docs[key] = await store.uploadDocument(user.uid, key, file);
    await save(true);
    toast("Uploaded");
  } catch (e) {
    toast("Upload failed. " + friendlyError(e));
  }
  renderForm();
}

// ── Review & submit ───────────────────────────────────────────
function reviewHTML() {
  const incomplete = STEPS.filter(s => s.id !== "review" && !stepComplete(s));
  const groups = STEPS.filter(s => s.id !== "review").map((s, i) => {
    const rows = flatFields(s).map(f => `<tr><th>${esc(f.label)}</th><td>${esc(show(f.k)) || '<span class="muted">—</span>'}</td></tr>`);
    const docRows = (s.docs || []).map(d => `<tr><th>${esc(d.label)}</th><td>${app.docs[d.k] ? esc(app.docs[d.k].name) : '<span class="muted">Not uploaded</span>'}</td></tr>`);
    return `<div class="summary-group"><h3>${esc(s.title)} <button type="button" class="link-btn" data-edit="${i}">Edit</button></h3>
      <table class="summary-table">${docRows.join("")}${rows.join("")}</table></div>`;
  }).join("");
  return `
    ${incomplete.length
      ? `<div class="alert alert-error">Complete these sections before submitting: ${incomplete.map(s => esc(s.title)).join(", ")}.</div>`
      : `<div class="alert alert-ok">Everything looks complete. Review your answers, then submit.</div>`}
    ${groups}
    <div class="field" style="display:flex;gap:10px;align-items:flex-start;margin-top:8px">
      <input id="declare" type="checkbox" style="margin-top:5px">
      <label for="declare" style="font-weight:400;font-size:.9rem">I declare that the information and documents submitted are true and complete to the best of my knowledge. I understand that false information may lead to rejection. After submitting, I won't be able to edit this application.</label>
    </div>`;
}

async function submit() {
  const incomplete = STEPS.filter(s => s.id !== "review" && !stepComplete(s));
  if (incomplete.length) { toast("Some sections are incomplete"); return; }
  if (!document.getElementById("declare").checked) { toast("Please tick the declaration"); return; }
  if (!confirmSubmit()) return;
  const btn = document.getElementById("submitBtn");
  btn.disabled = true; btn.textContent = "Submitting…";
  const now = new Date().toISOString();
  const prev = { status: app.status, timeline: app.timeline };
  app.status = "submitted";
  app.applicationId ||= "SFS-" + new Date().getFullYear() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();
  app.submittedAt = now;
  app.timeline = [...app.timeline, { status: "submitted", at: now }];
  if (await save(true)) { toast("Application submitted"); renderStatus(); mailSubmitted(app); }
  else { Object.assign(app, prev); btn.disabled = false; btn.textContent = "Submit application"; }
}

// Inline confirmation instead of window.confirm (keeps it consistent across devices)
function confirmSubmit() {
  const btn = document.getElementById("submitBtn");
  if (btn.dataset.confirm === "1") return true;
  btn.dataset.confirm = "1";
  btn.textContent = "Click again to confirm";
  btn.classList.replace("btn-primary", "btn-accent");
  setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ""; btn.textContent = "Submit application"; btn.classList.replace("btn-accent", "btn-primary"); } }, 5000);
  return false;
}

// ── Status view ───────────────────────────────────────────────
function fmt(d) { return d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""; }

function renderStatus() {
  const st = app.status;
  const reached = Object.fromEntries(app.timeline.map(t => [t.status, t.at]));
  const rejected = st === "rejected";
  const curIdx = FLOW.indexOf(st);
  const items = FLOW.map((k, i) => {
    let cls = "";
    if (reached[k] || i < curIdx) cls = "done";
    if (k === st) cls = st === "selected" ? "done" : "current";
    return { k, cls, at: reached[k] };
  });
  if (rejected) items.splice(Math.max(...items.map((x, i) => x.cls ? i : 0)) + 1, items.length, { k: "rejected", cls: "fail", at: reached.rejected });

  const note = {
    submitted: "We've received your application. It will be screened by our team shortly.",
    under_review: "Your application is being evaluated by our review team.",
    shortlisted: "Congratulations — you've been shortlisted. We'll contact you about the next round.",
    selected: "Congratulations — your startup has been selected. Our team will reach out with next steps.",
    rejected: "Thank you for applying. Your application was not selected this time. You're welcome to apply again in a future cycle."
  }[st] || "";

  root.innerHTML = `
    <div class="dash-head">
      <div>
        <p class="small muted" style="margin:0 0 4px">Application ID · <b>${esc(app.applicationId || "—")}</b></p>
        <h1>${esc(val("companyName"))}</h1>
      </div>
      <span class="badge badge-${st}">${STATUS[st] || st}</span>
    </div>
    <div class="dash-grid">
      <aside class="side-card">
        <h3 style="font-size:1rem">Application status</h3>
        <ul class="timeline">${items.map(it => `<li class="${it.cls}"><span class="dot"></span><b>${STATUS[it.k]}</b><span>${it.at ? fmt(it.at) : "Pending"}</span></li>`).join("")}</ul>
      </aside>
      <section class="panel">
        <div class="alert ${rejected ? "alert-error" : "alert-ok"}">${esc(note)}</div>
        ${app.adminNote ? `<div class="alert alert-info"><b>Message from the team:</b><br>${esc(app.adminNote)}</div>` : ""}
        ${st === "selected" ? `<div id="fundingBox"><div class="spinner" style="margin:20px auto"></div></div>` : ""}
        <p class="small muted">Submitted on ${fmt(app.submittedAt)}. Your application is locked for review. For changes, email <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> with your application ID.</p>
        <h2 style="margin-top:24px">Your submission</h2>
        ${STEPS.filter(s => s.id !== "review").map(s => `
          <div class="summary-group"><h3>${esc(s.title)}</h3><table class="summary-table">
            ${(s.docs || []).filter(d => app.docs[d.k]).map(d => `<tr><th>${esc(d.label)}</th><td>${app.docs[d.k].url ? `<a href="${esc(app.docs[d.k].url)}" target="_blank" rel="noopener">${esc(app.docs[d.k].name)}</a>` : esc(app.docs[d.k].name)}</td></tr>`).join("")}
            ${flatFields(s).filter(f => val(f.k)).map(f => `<tr><th>${esc(f.label)}</th><td>${esc(show(f.k))}</td></tr>`).join("")}
          </table></div>`).join("")}
      </section>
    </div>`;
  if (st === "selected") renderFunding();
}

// ── Funding & progress reports (selected startups) ────────────
const TR_LABEL = { planned: "Planned", due: "Due", released: "Released", on_hold: "On hold" };
const TR_BADGE = { planned: "draft", due: "shortlisted", released: "selected", on_hold: "rejected" };

async function renderFunding() {
  const box = document.getElementById("fundingBox");
  if (!box) return;
  let progress = { reports: [] };
  try { progress = await store.getProgress(user.uid); } catch {}
  progress.reports ||= [];
  const f = app.funding || {};
  const tr = f.tranches || [];
  const released = tr.filter(t => t.status === "released").reduce((x, t) => x + (+t.amount || 0), 0);

  box.innerHTML = `
    <h2 style="margin-top:8px">Funding</h2>
    ${f.sanctioned ? `
      <table class="summary-table" style="margin-bottom:14px">
        <tr><th>Sanctioned amount</th><td><b>${esc(money(f.sanctioned))}</b></td></tr>
        <tr><th>Instrument</th><td>${esc(f.instrument || "—")}</td></tr>
        ${f.agreementDate ? `<tr><th>Agreement date</th><td>${esc(new Date(f.agreementDate).toLocaleDateString("en-IN"))}</td></tr>` : ""}
        <tr><th>Released so far</th><td>${esc(money(released) || "₹0")}</td></tr>
      </table>
      ${tr.length ? `<div class="table-wrap" style="margin-bottom:22px"><table class="data" style="min-width:520px"><thead><tr><th>Tranche</th><th>Amount</th><th>Milestone</th><th>Status</th><th>Released on</th></tr></thead><tbody>
        ${tr.map(t => `<tr style="cursor:default"><td><b>${esc(t.label)}</b></td><td>${esc(money(t.amount) || "—")}</td><td>${esc(t.milestone || "—")}</td><td><span class="badge badge-${TR_BADGE[t.status] || "draft"}">${TR_LABEL[t.status] || t.status}</span></td><td class="small">${t.releasedOn ? esc(new Date(t.releasedOn).toLocaleDateString("en-IN")) : "—"}${t.reference ? `<div class="muted">Ref: ${esc(t.reference)}</div>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : ""}`
    : `<p class="muted small">Your funding details and tranche schedule will appear here once finalised.</p>`}

    <h2>Progress &amp; utilisation reports</h2>
    <p class="small muted">Share milestone progress and how released funds were used. Attach a utilisation certificate where required.</p>
    ${progress.reports.slice().reverse().map(r => `<div class="note"><b>${esc(r.title)}</b>${r.tranche ? ` · ${esc(r.tranche)}` : ""}${r.amountUsed ? ` · ${esc(money(r.amountUsed))} utilised` : ""}<div style="margin-top:4px">${esc(r.text)}</div>${r.file ? `<div style="margin-top:4px">📎 ${r.file.url ? `<a href="${esc(r.file.url)}" target="_blank" rel="noopener">${esc(r.file.name)}</a>` : esc(r.file.name)}</div>` : ""}<div class="meta">${fmt(r.at)}</div></div>`).join("")}
    <div class="card" style="margin-top:12px">
      <div class="field-row">
        <div class="field"><label for="pTitle">Report title <span class="req">*</span></label><input id="pTitle" type="text" placeholder="e.g. Q1 progress, MVP launch"></div>
        <div class="field"><label for="pTr">Related tranche</label><select id="pTr"><option value="">—</option>${tr.map(t => `<option>${esc(t.label)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label for="pAmt">Amount utilised (₹)</label><input id="pAmt" type="number" min="0"></div>
      <div class="field"><label for="pText">What did you achieve, and how were funds used? <span class="req">*</span></label><textarea id="pText" maxlength="2000"></textarea></div>
      <div class="field"><label for="pFile">Attachment (utilisation certificate, photos, report)</label><input id="pFile" type="file" accept="${ACCEPT}"></div>
      <button class="btn btn-primary btn-sm" id="pSubmit">Submit report</button>
    </div>`;

  box.querySelector("#pSubmit").addEventListener("click", async e => {
    const title = box.querySelector("#pTitle").value.trim(), text = box.querySelector("#pText").value.trim();
    if (!title || !text) { toast("Add a title and description"); return; }
    const file = box.querySelector("#pFile").files[0];
    if (file && file.size > site.maxUploadMB * 1024 * 1024) { toast(`File is larger than ${site.maxUploadMB} MB`); return; }
    e.target.disabled = true; e.target.textContent = "Submitting…";
    try {
      const report = { title, text, tranche: box.querySelector("#pTr").value, amountUsed: box.querySelector("#pAmt").value, at: new Date().toISOString() };
      if (file) report.file = await store.uploadDocument(user.uid, "report_" + Date.now(), file, "progress");
      progress.reports.push(report);
      await store.saveProgress(user.uid, progress);
      toast("Report submitted");
      renderFunding();
    } catch (err) { toast(friendlyError(err)); e.target.disabled = false; e.target.textContent = "Submit report"; }
  });
}
