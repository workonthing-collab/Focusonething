// Admin console: list, filter, review, change status, notes, scoring, CSV export.
import "./common.js";
import { toast, esc } from "./common.js";
import { store, friendlyError } from "./store.js";
import { STEPS, STATUS, STATES, SECTORS, flatFields, MONEY, money } from "./schema.js";

const root = document.getElementById("root");
const ORDER = ["submitted", "under_review", "shortlisted", "selected", "rejected", "draft"];
const CRITERIA = [
  ["team", "Team & founder fit"], ["problem", "Problem clarity"], ["solution", "Solution & innovation"],
  ["market", "Market size"], ["model", "Business model"], ["traction", "Traction"]
];

let user = null;
let apps = [];
const filt = { q: "", status: "", sector: "", state: "", sort: "submittedAt", dir: -1 };

const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtDT = d => d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const D = a => a.data || {};
const badge = s => `<span class="badge badge-${s}">${STATUS[s] || s}</span>`;

document.getElementById("logoutBtn").addEventListener("click", async () => { await store.signOut(); location.replace("login.html?next=admin"); });

store.onUser(async u => {
  if (!u) { location.replace("login.html?next=admin"); return; }
  if (user && user.uid === u.uid) return;
  user = u;
  document.getElementById("userEmail").textContent = u.email;
  if (!(await store.isAdmin(u.uid))) {
    root.innerHTML = `<div class="panel" style="max-width:560px;margin:40px auto;text-align:center">
      <h2>Admin access required</h2>
      <p class="muted">This account (${esc(u.email)}) is not an admin. Ask the portal owner to add your user ID to the <code>admins</code> list.</p>
      <p class="small muted">Your user ID: <code>${esc(u.uid)}</code></p>
      <a class="btn btn-outline" href="dashboard.html">Go to applicant dashboard</a></div>`;
    return;
  }
  await load();
  window.addEventListener("hashchange", route);
  route();
});

async function load() {
  try { apps = await store.listApplications(); }
  catch (e) { root.innerHTML = `<div class="alert alert-error">Couldn't load applications. ${esc(friendlyError(e))}</div>`; apps = []; }
}

function route() {
  const id = new URLSearchParams(location.hash.slice(1)).get("app");
  id ? renderDetail(id) : renderList();
}

// ── List ──────────────────────────────────────────────────────
function filtered() {
  const q = filt.q.trim().toLowerCase();
  return apps.filter(a => {
    if (filt.status ? a.status !== filt.status : a.status === "draft") return false;
    if (filt.sector && D(a).sector !== filt.sector) return false;
    if (filt.state && D(a).state !== filt.state) return false;
    if (q) {
      const hay = [a.applicationId, D(a).companyName, D(a).brandName, D(a).founderName, D(a).founderEmail, D(a).city].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((x, y) => {
    const get = a => filt.sort === "amountAsked" ? +D(a).amountAsked || 0 : filt.sort === "companyName" ? (D(a).companyName || "").toLowerCase() : a[filt.sort] || a.updatedAt || "";
    const vx = get(x), vy = get(y);
    return (vx > vy ? 1 : vx < vy ? -1 : 0) * filt.dir;
  });
}

function renderList() {
  const counts = Object.fromEntries(ORDER.map(s => [s, apps.filter(a => a.status === s).length]));
  const total = apps.length - counts.draft;
  const sel = (id, label, opts, cur) => `<select id="${id}"><option value="">${label}</option>${opts.map(o => `<option value="${esc(o[0] ?? o)}"${(o[0] ?? o) === cur ? " selected" : ""}>${esc(o[1] ?? o)}</option>`).join("")}</select>`;

  root.innerHTML = `
    <div class="dash-head">
      <div><p class="small muted" style="margin:0 0 4px">Admin console</p><h1>Applications</h1></div>
      <div style="display:flex;gap:8px"><button class="btn btn-outline btn-sm" id="refreshBtn">Refresh</button><button class="btn btn-primary btn-sm" id="csvBtn">Export CSV</button></div>
    </div>
    <div class="stats">
      <button class="stat${!filt.status ? " active" : ""}" data-st=""><div class="n">${total}</div><div class="l">All submitted</div></button>
      ${["under_review", "shortlisted", "selected", "rejected", "draft"].map(s => `<button class="stat${filt.status === s ? " active" : ""}" data-st="${s}"><div class="n">${counts[s]}</div><div class="l">${s === "draft" ? "Drafts (not submitted)" : STATUS[s]}</div></button>`).join("")}
    </div>
    <div class="filters">
      <input id="q" type="text" placeholder="Search company, founder, email, ID…" value="${esc(filt.q)}">
      ${sel("fStatus", "Submitted (all)", ORDER.map(s => [s, STATUS[s]]), filt.status)}
      ${sel("fSector", "All sectors", SECTORS, filt.sector)}
      ${sel("fState", "All states", STATES, filt.state)}
      <button class="btn btn-ghost btn-sm" id="clearBtn">Clear</button>
    </div>
    <div class="table-wrap" id="tableWrap"></div>`;

  drawTable();
  root.querySelectorAll("[data-st]").forEach(b => b.addEventListener("click", () => { filt.status = b.dataset.st; renderList(); }));
  root.querySelector("#q").addEventListener("input", e => { filt.q = e.target.value; drawTable(); });
  root.querySelector("#fStatus").addEventListener("change", e => { filt.status = e.target.value; renderList(); });
  root.querySelector("#fSector").addEventListener("change", e => { filt.sector = e.target.value; drawTable(); });
  root.querySelector("#fState").addEventListener("change", e => { filt.state = e.target.value; drawTable(); });
  root.querySelector("#clearBtn").addEventListener("click", () => { Object.assign(filt, { q: "", status: "", sector: "", state: "" }); renderList(); });
  root.querySelector("#refreshBtn").addEventListener("click", async () => { await load(); renderList(); toast("Refreshed"); });
  root.querySelector("#csvBtn").addEventListener("click", exportCSV);
}

function drawTable() {
  const rows = filtered();
  const th = (k, l) => `<th data-sort="${k}">${l}${filt.sort === k ? (filt.dir > 0 ? " ↑" : " ↓") : ""}</th>`;
  const wrap = root.querySelector("#tableWrap");
  wrap.innerHTML = rows.length ? `<table class="data"><thead><tr>
      <th>App ID</th>${th("companyName", "Company")}<th>Founder</th><th>Location</th><th>Sector / stage</th>${th("amountAsked", "Ask")}${th("submittedAt", "Submitted")}<th>Status</th>
    </tr></thead><tbody>${rows.map(a => `<tr data-open="${esc(a.uid)}">
      <td class="small">${esc(a.applicationId || "—")}</td>
      <td><b>${esc(D(a).companyName || "Untitled")}</b>${D(a).brandName ? `<div class="small muted">${esc(D(a).brandName)}</div>` : ""}</td>
      <td>${esc(D(a).founderName || "")}<div class="small muted">${esc(D(a).founderEmail || "")}</div></td>
      <td>${esc([D(a).city, D(a).state].filter(Boolean).join(", "))}</td>
      <td>${esc(D(a).sector || "")}<div class="small muted">${esc(D(a).stage || "")}</div></td>
      <td>${esc(money(D(a).amountAsked) || "—")}</td>
      <td class="small">${fmtDate(a.submittedAt)}</td>
      <td>${badge(a.status)}</td></tr>`).join("")}</tbody></table>`
    : `<div class="empty">No applications match these filters.</div>`;
  wrap.querySelectorAll("[data-sort]").forEach(h => h.addEventListener("click", () => {
    filt.dir = filt.sort === h.dataset.sort ? -filt.dir : -1; filt.sort = h.dataset.sort; drawTable();
  }));
  wrap.querySelectorAll("[data-open]").forEach(r => r.addEventListener("click", () => { location.hash = "app=" + encodeURIComponent(r.dataset.open); }));
}

function exportCSV() {
  const rows = filtered();
  if (!rows.length) { toast("Nothing to export"); return; }
  const fields = STEPS.flatMap(s => flatFields(s));
  const docKeys = STEPS.flatMap(s => s.docs || []);
  const head = ["Application ID", "Status", "Submitted at", ...fields.map(f => f.label), ...docKeys.map(d => d.label)];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.map(cell).join(",")].concat(rows.map(a => [
    a.applicationId, STATUS[a.status] || a.status, a.submittedAt ? fmtDT(a.submittedAt) : "",
    ...fields.map(f => D(a)[f.k]), ...docKeys.map(d => a.docs?.[d.k]?.url || a.docs?.[d.k]?.name || "")
  ].map(cell).join(",")));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `srujan-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// ── Detail ────────────────────────────────────────────────────
async function renderDetail(uid) {
  const a = apps.find(x => x.uid === uid);
  if (!a) { root.innerHTML = `<div class="alert alert-error">Application not found.</div><a class="btn btn-outline" href="admin.html">← All applications</a>`; return; }
  root.innerHTML = `<div class="spinner"></div>`;
  let review;
  try { review = await store.getReview(uid); } catch { review = { notes: [] }; }
  review.notes ||= []; review.scores ||= {};

  const groups = STEPS.filter(s => s.id !== "review").map(s => {
    const docs = (s.docs || []).map(d => {
      const f = a.docs?.[d.k];
      return `<tr><th>${esc(d.label)}</th><td>${f ? (f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.name)}</a>` : `${esc(f.name)} <span class="small muted">(demo — no file stored)</span>`) : '<span class="muted">Not uploaded</span>'}</td></tr>`;
    }).join("");
    const fields = flatFields(s).map(f => {
      const v = MONEY.has(f.k) ? money(D(a)[f.k]) : D(a)[f.k];
      const shown = f.type === "url" && v ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v);
      return `<tr><th>${esc(f.label)}</th><td>${shown || '<span class="muted">—</span>'}</td></tr>`;
    }).join("");
    return `<div class="summary-group"><h3>${esc(s.title)}</h3><table class="summary-table">${docs}${fields}</table></div>`;
  }).join("");

  const total = CRITERIA.reduce((t, [k]) => t + (+review.scores[k] || 0), 0);

  root.innerHTML = `
    <p style="margin:0 0 12px"><a href="admin.html" class="small">← All applications</a></p>
    <div class="dash-head">
      <div>
        <p class="small muted" style="margin:0 0 4px">${esc(a.applicationId || "Draft")} · submitted ${fmtDate(a.submittedAt)}</p>
        <h1>${esc(D(a).companyName || "Untitled")}</h1>
        <p class="muted" style="margin:4px 0 0">${esc(D(a).oneLiner || "")}</p>
      </div>
      ${badge(a.status)}
    </div>
    <div class="admin-grid">
      <section class="panel">${groups}</section>
      <aside class="admin-side">
        <div class="panel">
          <h2 style="font-size:1.05rem">Update status</h2>
          <div class="field"><label for="newStatus">Status</label>
            <select id="newStatus">${ORDER.map(s => `<option value="${s}"${s === a.status ? " selected" : ""}>${s === "draft" ? "Draft (reopen for applicant edits)" : STATUS[s]}</option>`).join("")}</select></div>
          <div class="field"><label for="adminNote">Message to applicant</label>
            <textarea id="adminNote" style="min-height:90px" placeholder="Shown on the applicant's dashboard">${esc(a.adminNote || "")}</textarea>
            <p class="hint">Visible to the applicant. Leave blank for none.</p></div>
          <button class="btn btn-primary" style="width:100%" id="saveStatus">Save</button>
        </div>
        <div class="panel">
          <h2 style="font-size:1.05rem">Score <span class="small muted">(private)</span></h2>
          ${CRITERIA.map(([k, l]) => `<div class="score-row"><span>${l}</span><select data-score="${k}"><option value="">–</option>${[1, 2, 3, 4, 5].map(n => `<option${+review.scores[k] === n ? " selected" : ""}>${n}</option>`).join("")}</select></div>`).join("")}
          <div class="score-row" style="border-top:1px solid var(--line);padding-top:10px"><b>Total</b><span class="score-total" id="scoreTotal">${total} / ${CRITERIA.length * 5}</span></div>
        </div>
        <div class="panel">
          <h2 style="font-size:1.05rem">Internal notes <span class="small muted">(private)</span></h2>
          <div id="notes">${review.notes.length ? review.notes.map(n => `<div class="note">${esc(n.text)}<div class="meta">${esc(n.by)} · ${fmtDT(n.at)}</div></div>`).join("") : '<p class="small muted">No notes yet.</p>'}</div>
          <textarea id="newNote" style="min-height:70px;margin-top:8px" placeholder="Add a note for your team"></textarea>
          <button class="btn btn-outline btn-sm" style="margin-top:8px" id="addNote">Add note</button>
        </div>
        <div class="panel">
          <h2 style="font-size:1.05rem">History</h2>
          <ul class="timeline">${(a.timeline || []).slice().reverse().map(t => `<li class="done"><span class="dot"></span><b>${STATUS[t.status] || t.status}</b><span>${fmtDT(t.at)}${t.by ? " · " + esc(t.by) : ""}</span></li>`).join("") || '<li><span class="dot"></span><b>Draft</b><span>Not submitted yet</span></li>'}</ul>
        </div>
      </aside>
    </div>`;

  root.querySelector("#saveStatus").addEventListener("click", async e => {
    const btn = e.target; btn.disabled = true;
    const status = root.querySelector("#newStatus").value;
    const adminNote = root.querySelector("#adminNote").value.trim();
    const patch = { adminNote };
    if (status !== a.status) {
      patch.status = status;
      patch.timeline = [...(a.timeline || []), { status, at: new Date().toISOString(), by: user.email }];
    }
    try { await store.updateApplication(uid, patch); Object.assign(a, patch); toast("Saved"); renderDetail(uid); }
    catch (err) { toast(friendlyError(err)); btn.disabled = false; }
  });

  root.querySelectorAll("[data-score]").forEach(s => s.addEventListener("change", async () => {
    review.scores[s.dataset.score] = s.value ? +s.value : "";
    root.querySelector("#scoreTotal").textContent = `${CRITERIA.reduce((t, [k]) => t + (+review.scores[k] || 0), 0)} / ${CRITERIA.length * 5}`;
    try { await store.saveReview(uid, review); } catch (err) { toast(friendlyError(err)); }
  }));

  root.querySelector("#addNote").addEventListener("click", async () => {
    const text = root.querySelector("#newNote").value.trim();
    if (!text) return;
    review.notes.push({ text, by: user.email, at: new Date().toISOString() });
    try { await store.saveReview(uid, review); toast("Note added"); renderDetail(uid); }
    catch (err) { review.notes.pop(); toast(friendlyError(err)); }
  });
}
