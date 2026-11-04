// Staff console. Admin: everything. Reviewer: assigned applications + own scorecard.
import "./common.js";
import { toast, esc } from "./common.js";
import { store, friendlyError } from "./store.js";
import { mailStatus, mailEnabled } from "./mail.js";
import { STEPS, STATUS, STATES, SECTORS, ADMIN_STATUSES, STAGES as PSTAGES, stageIndex, flatFields, MONEY, money } from "./schema.js";

const root = document.getElementById("root");
const ORDER = ADMIN_STATUSES;
const STAGES = ["Idea", "Prototype / MVP", "Early revenue", "Scaling"];
// Fields the admin enters for each startup record.
const REC = [
  { k: "companyName", label: "Registered company name", req: true },
  { k: "brandName", label: "Brand / product name" },
  { k: "founderName", label: "Founder name", req: true },
  { k: "founderEmail", label: "Founder email (they log in with this)", type: "email", req: true },
  { k: "founderPhone", label: "Founder mobile", type: "tel" },
  { k: "sector", label: "Sector", type: "select", options: SECTORS },
  { k: "stage", label: "Stage", type: "select", options: STAGES },
  { k: "state", label: "State", type: "select", options: STATES },
  { k: "city", label: "City" },
  { k: "amountAsked", label: "Amount requested (₹)", type: "number" },
  { k: "oneLiner", label: "One-line description" }
];
const CRITERIA = [
  ["team", "Team & founder fit"], ["problem", "Problem clarity"], ["solution", "Solution & innovation"],
  ["market", "Market size"], ["model", "Business model"], ["traction", "Traction"]
];

let user = null;
let role = null;
let apps = [];
let reviewers = [];
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
  role = await store.getRole(u.uid);
  if (store.demo) demoRoleSwitch();
  if (!role) {
    root.innerHTML = `<div class="panel" style="max-width:560px;margin:40px auto;text-align:center">
      <h2>Staff access required</h2>
      <p class="muted">This account (${esc(u.email)}) is not an admin or reviewer. Send the user ID below to the portal admin to get access.</p>
      <p class="small muted">Your user ID: <code>${esc(u.uid)}</code></p>
      <a class="btn btn-outline" href="dashboard.html">Go to founder dashboard</a></div>`;
    return;
  }
  await load();
  window.addEventListener("hashchange", route);
  route();
});

async function load() {
  try {
    apps = await store.listApplications(role, user.uid);
    if (role === "admin") reviewers = await store.listReviewers();
  }
  catch (e) { root.innerHTML = `<div class="alert alert-error">Couldn't load applications. ${esc(friendlyError(e))}</div>`; apps = []; }
}

function route() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has("team") && role === "admin") return renderTeam();
  if (h.has("reports") && role === "admin") return renderReports();
  if (h.has("new") && role === "admin") return renderEdit(null);
  if (h.get("edit") && role === "admin") return renderEdit(h.get("edit"));
  const id = h.get("app");
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
  const total = apps.filter(a => a.status !== "draft").length;
  const sel = (id, label, opts, cur) => `<select id="${id}"><option value="">${label}</option>${opts.map(o => `<option value="${esc(o[0] ?? o)}"${(o[0] ?? o) === cur ? " selected" : ""}>${esc(o[1] ?? o)}</option>`).join("")}</select>`;

  root.innerHTML = `
    <div class="dash-head">
      <div><p class="small muted" style="margin:0 0 4px">${role === "admin" ? "Admin console" : "Reviewer console"}</p><h1>${role === "admin" ? "Applications" : "Assigned to you"}</h1></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${role === "admin" ? `<a class="btn btn-primary btn-sm" href="#new">+ Add startup</a><a class="btn btn-outline btn-sm" href="#reports">Reports</a><a class="btn btn-outline btn-sm" href="#team">Reviewers (${reviewers.length})</a>` : ""}
        <button class="btn btn-outline btn-sm" id="refreshBtn">Refresh</button>
        ${role === "admin" ? `<button class="btn btn-primary btn-sm" id="csvBtn">Export CSV</button>` : ""}
      </div>
    </div>
    <div class="stats">
      <button class="stat${!filt.status ? " active" : ""}" data-st=""><div class="n">${total}</div><div class="l">All startups</div></button>
      ${["submitted", "initial_review", "documents_pending", "under_evaluation", "shortlisted", "selected", "rejected", ...(role === "admin" ? ["draft"] : [])].map(s => `<button class="stat${filt.status === s ? " active" : ""}" data-st="${s}"><div class="n">${s === "under_evaluation" ? counts[s] + apps.filter(a => a.status === "under_review").length : counts[s] ?? apps.filter(a => a.status === s).length}</div><div class="l">${s === "submitted" ? "New" : s === "draft" ? "Drafts (not submitted)" : STATUS[s]}</div></button>`).join("")}
    </div>
    <div class="filters">
      <input id="q" type="text" placeholder="Search company, founder, email, ID…" value="${esc(filt.q)}">
      ${sel("fStatus", "All submitted", [...ORDER, "draft"].map(s => [s, STATUS[s]]), filt.status)}
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
  root.querySelector("#csvBtn")?.addEventListener("click", exportCSV);
}

function drawTable() {
  const rows = filtered();
  const th = (k, l) => `<th data-sort="${k}">${l}${filt.sort === k ? (filt.dir > 0 ? " ↑" : " ↓") : ""}</th>`;
  const wrap = root.querySelector("#tableWrap");
  wrap.innerHTML = rows.length ? `<table class="data"><thead><tr>
      <th>App ID</th>${th("companyName", "Company")}<th>Founder</th><th>Location</th><th>Sector / stage</th>${th("amountAsked", "Ask")}${th("submittedAt", "Submitted")}${role === "admin" ? "<th>Reviewers</th>" : ""}<th>Status</th>
    </tr></thead><tbody>${rows.map(a => `<tr data-open="${esc(a.uid)}">
      <td class="small">${esc(a.applicationId || "—")}</td>
      <td><b>${esc(D(a).companyName || "Untitled")}</b>${D(a).brandName ? `<div class="small muted">${esc(D(a).brandName)}</div>` : ""}</td>
      <td>${esc(D(a).founderName || "")}<div class="small muted">${esc(D(a).founderEmail || "")}</div></td>
      <td>${esc([D(a).city, D(a).state].filter(Boolean).join(", "))}</td>
      <td>${esc(D(a).sector || "")}<div class="small muted">${esc(D(a).stage || "")}</div></td>
      <td>${esc(money(D(a).amountAsked) || "—")}</td>
      <td class="small">${fmtDate(a.submittedAt)}</td>
      ${role === "admin" ? `<td class="small">${esc((a.assignedTo || []).map(rName).join(", ") || "—")}</td>` : ""}
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
  const fields = REC;
  const docKeys = [];
  const head = ["Application ID", "Status", "Applied on", ...fields.map(f => f.label), "Sanctioned (₹)", "Released (₹)"];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [head.map(cell).join(",")].concat(rows.map(a => [
    a.applicationId, STATUS[a.status] || a.status, a.submittedAt ? fmtDT(a.submittedAt) : "",
    ...fields.map(f => D(a)[f.k]), a.funding?.sanctioned || "",
    (a.funding?.tranches || []).filter(t => t.status === "released").reduce((x, t) => x + (+t.amount || 0), 0) || ""
  ].map(cell).join(",")));
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `srujan-applications-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

const rName = id => reviewers.find(r => r.uid === id)?.name || (id === user?.uid ? "You" : "Reviewer");

// Demo only: switch between admin and reviewer views to try both.
function demoRoleSwitch() {
  const bar = document.querySelector(".demo-banner");
  if (!bar || bar.querySelector("select")) return;
  bar.insertAdjacentHTML("beforeend", ` &nbsp;View as: <select id="demoRole" style="width:auto;padding:2px 6px;font-size:.8rem"><option value="admin">Admin</option><option value="reviewer">Reviewer</option></select>`);
  const s = bar.querySelector("#demoRole");
  s.value = role || "admin";
  s.addEventListener("change", () => { localStorage.setItem("sfs_demo_role", JSON.stringify(s.value)); location.hash = ""; location.reload(); });
}

// ── Detail ────────────────────────────────────────────────────
const scoreTotal = sc => CRITERIA.reduce((t, [k]) => t + (+sc?.[k] || 0), 0);
const MAX = CRITERIA.length * 5;

async function renderDetail(uid) {
  const a = apps.find(x => x.uid === uid);
  if (!a) { root.innerHTML = `<div class="alert alert-error">Application not found or not assigned to you.</div><a class="btn btn-outline" href="admin.html">← Back</a>`; return; }
  root.innerHTML = `<div class="spinner"></div>`;
  const isAdmin = role === "admin";
  let review = { notes: [] }, cards = {};
  try {
    [review, cards] = await Promise.all([isAdmin ? store.getReview(uid) : Promise.resolve({ notes: [] }), store.getScores(uid, role, user.uid)]);
  } catch (e) { toast(friendlyError(e)); }
  review.notes ||= [];
  let progress = { reports: [] };
  const mine = cards[user.uid] || { scores: {}, comment: "", recommendation: "" };
  mine.scores ||= {};

  const docDefs = STEPS.find(x => x.id === "documents").docs;
  const groups = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><h2 style="font-size:1.1rem;margin:0">Application</h2>${isAdmin ? `<a class="btn btn-outline btn-sm" href="#edit=${encodeURIComponent(uid)}">Edit details</a>` : ""}</div>
    <table class="summary-table" style="margin:12px 0 18px">
      <tr><th>Application ID</th><td>${esc(a.applicationId || "—")}</td></tr>
      <tr><th>Submitted on</th><td>${esc(fmtDT(a.submittedAt) || "Not submitted")}</td></tr>
      <tr><th>Source</th><td>${a.timeline?.[0]?.by === "applicant" ? "Submitted online by applicant" : "Recorded by programme team"}</td></tr>
      ${a.docsUpdatedAt ? `<tr><th>Documents updated</th><td>${esc(fmtDT(a.docsUpdatedAt))}</td></tr>` : ""}
    </table>
    <div class="summary-group"><h3>Documents</h3><table class="summary-table">${docDefs.map(d => `<tr><th>${esc(d.label)}</th><td>${a.docs?.[d.k]?.url ? `<a href="${esc(a.docs[d.k].url)}" target="_blank" rel="noopener">Open link</a>` : '<span class="muted">Not provided</span>'}</td></tr>`).join("")}</table></div>
    ${STEPS.filter(x => x.id !== "review").map(x => {
      const rows = flatFields(x).filter(f => D(a)[f.k] !== undefined && D(a)[f.k] !== "").map(f => {
        const v = MONEY.has(f.k) ? money(D(a)[f.k]) : D(a)[f.k];
        return `<tr><th>${esc(f.label)}</th><td>${f.type === "url" ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v)}</td></tr>`;
      }).join("");
      return rows ? `<div class="summary-group"><h3>${esc(x.title)}</h3><table class="summary-table">${rows}</table></div>` : "";
    }).join("")}
    <h3 style="font-size:.95rem;margin-top:22px">Messages &amp; remarks sent to applicant</h3>
    ${[...(a.messages || []).map(m => ({ ...m, kind: "Message" })), ...(a.timeline || []).filter(t => t.remark).map(t => ({ text: t.remark, at: t.at, by: t.by, kind: "Remark · " + (STATUS[t.status] || t.status) }))].sort((x, y) => (y.at || "").localeCompare(x.at || "")).map(m => `<div class="note"><div class="meta" style="margin:0 0 4px">${esc(m.kind)} · ${esc(m.by || "")} · ${fmtDT(m.at)}</div>${esc(m.text)}</div>`).join("") || '<p class="small muted">None yet.</p>'}`;

  // Other scorers' cards (admin only)
  const others = Object.entries(cards).filter(([k]) => k !== user.uid);
  const allTotals = Object.values(cards).map(c => scoreTotal(c.scores)).filter(t => t > 0);
  const avg = allTotals.length ? (allTotals.reduce((x, y) => x + y, 0) / allTotals.length).toFixed(1) : null;
  const assigned = a.assignedTo || [];

  root.innerHTML = `
    <p style="margin:0 0 12px"><a href="admin.html" class="small">← ${isAdmin ? "All applications" : "Assigned applications"}</a></p>
    <div class="dash-head">
      <div>
        <p class="small muted" style="margin:0 0 4px">${esc(a.applicationId || "Draft")} · submitted ${fmtDate(a.submittedAt)}</p>
        <h1>${esc(D(a).companyName || "Untitled")}</h1>
        <p class="muted" style="margin:4px 0 0">${esc(D(a).oneLiner || "")}</p>
      </div>
      ${badge(a.status)}
    </div>
    <div class="admin-grid">
      <section>
        ${isAdmin && a.status === "selected" ? fundingHTML(a, progress) : ""}
        <div class="panel">${groups}</div>
      </section>
      <aside class="admin-side">
        ${isAdmin ? `
        <div class="panel">
          <h2 style="font-size:1.05rem">Update status</h2>
          <div class="field"><label for="newStatus">Status</label>
            <select id="newStatus">${ORDER.map(s => `<option value="${s}"${s === a.status ? " selected" : ""}>${STATUS[s]}</option>`).join("")}</select></div>
          <div class="field"><label for="remark">Remark to applicant</label>
            <textarea id="remark" style="min-height:80px" placeholder="e.g. Please upload a clearer copy of the PAN card"></textarea>
            <p class="hint">Shown with the status change on the applicant's dashboard. Recommended for Documents Pending and Not Selected.</p></div>
          <div class="field"><label for="adminNote">Separate message (optional)</label>
            <textarea id="adminNote" style="min-height:60px" placeholder="General message to the applicant"></textarea></div>
          <div class="field" style="display:flex;gap:8px;align-items:flex-start">
            <input type="checkbox" id="sendMail" ${mailEnabled ? "checked" : "disabled"} style="margin-top:4px">
            <label for="sendMail" style="font-weight:400;font-size:.85rem;margin:0">Email the founder about this update${mailEnabled ? "" : " <span class='muted'>(set up email in config to enable)</span>"}</label>
          </div>
          <button class="btn btn-primary" style="width:100%" id="saveStatus">Save</button>
        </div>
        <div class="panel">
          <h2 style="font-size:1.05rem">Assigned reviewers</h2>
          ${reviewers.length ? reviewers.map(r => `<label style="display:flex;gap:8px;font-weight:400;font-size:.9rem;margin-bottom:8px"><input type="checkbox" data-assign="${esc(r.uid)}" ${assigned.includes(r.uid) ? "checked" : ""}> ${esc(r.name)} <span class="muted small">${esc(r.email || "")}</span></label>`).join("")
            : `<p class="small muted">No reviewers yet. <a href="#team">Add reviewers</a></p>`}
        </div>` : ""}
        <div class="panel">
          <h2 style="font-size:1.05rem">Your scorecard <span class="small muted">(private)</span></h2>
          ${CRITERIA.map(([k, l]) => `<div class="score-row"><span>${l}</span><select data-score="${k}"><option value="">–</option>${[1, 2, 3, 4, 5].map(n => `<option${+mine.scores[k] === n ? " selected" : ""}>${n}</option>`).join("")}</select></div>`).join("")}
          <div class="score-row" style="border-top:1px solid var(--line);padding-top:10px"><b>Total</b><span class="score-total" id="scoreTotal">${scoreTotal(mine.scores)} / ${MAX}</span></div>
          <div class="field"><label for="rec">Recommendation</label>
            <select id="rec"><option value="">—</option>${["Strongly recommend", "Recommend", "Neutral", "Do not recommend"].map(o => `<option${mine.recommendation === o ? " selected" : ""}>${o}</option>`).join("")}</select></div>
          <div class="field"><label for="comment">Comments</label><textarea id="comment" style="min-height:80px">${esc(mine.comment || "")}</textarea></div>
          <button class="btn btn-outline btn-sm" id="saveCard">Save scorecard</button>
          <span class="small muted" id="cardState" style="margin-left:8px">${mine.at ? "Saved " + fmtDT(mine.at) : ""}</span>
        </div>
        ${isAdmin ? `
        <div class="panel">
          <h2 style="font-size:1.05rem">All scorecards ${avg ? `<span class="score-total" style="float:right">avg ${avg} / ${MAX}</span>` : ""}</h2>
          ${others.length ? others.map(([k, c]) => `<div class="note"><b>${esc(c.by || rName(k))}</b> — ${scoreTotal(c.scores)} / ${MAX}${c.recommendation ? ` · ${esc(c.recommendation)}` : ""}${c.comment ? `<div style="margin-top:4px">${esc(c.comment)}</div>` : ""}<div class="meta">${fmtDT(c.at)}</div></div>`).join("") : '<p class="small muted">No reviewer scorecards yet.</p>'}
        </div>
        <div class="panel">
          <h2 style="font-size:1.05rem">Internal notes <span class="small muted">(private)</span></h2>
          <div id="notes">${review.notes.length ? review.notes.map(n => `<div class="note">${esc(n.text)}<div class="meta">${esc(n.by)} · ${fmtDT(n.at)}</div></div>`).join("") : '<p class="small muted">No notes yet.</p>'}</div>
          <textarea id="newNote" style="min-height:70px;margin-top:8px" placeholder="Add a note for your team"></textarea>
          <button class="btn btn-outline btn-sm" style="margin-top:8px" id="addNote">Add note</button>
        </div>` : ""}
        <div class="panel">
          <h2 style="font-size:1.05rem">Status history</h2>
          <ul class="timeline">${(a.timeline || []).slice().reverse().map(t => `<li class="done"><span class="dot"></span><b>${STATUS[t.status] || t.status}</b><span>${fmtDT(t.at)}${t.by && isAdmin ? " · " + esc(t.by) : ""}</span></li>`).join("") || '<li><span class="dot"></span><b>Draft</b><span>Not submitted yet</span></li>'}</ul>
        </div>
        ${isAdmin ? `<div class="panel"><h2 style="font-size:1.05rem">Audit trail</h2><div id="auditBox" class="small muted">Loading…</div></div>` : ""}
      </aside>
    </div>`;

  // Scorecard (admin + reviewer)
  root.querySelectorAll("[data-score]").forEach(s => s.addEventListener("change", () => {
    mine.scores[s.dataset.score] = s.value ? +s.value : "";
    root.querySelector("#scoreTotal").textContent = `${scoreTotal(mine.scores)} / ${MAX}`;
  }));
  root.querySelector("#saveCard").addEventListener("click", async e => {
    e.target.disabled = true;
    const card = { scores: mine.scores, recommendation: root.querySelector("#rec").value, comment: root.querySelector("#comment").value.trim(), by: user.name || user.email };
    try { await store.saveScore(uid, user.uid, card); root.querySelector("#cardState").textContent = "Saved just now"; toast("Scorecard saved"); }
    catch (err) { toast(friendlyError(err)); }
    e.target.disabled = false;
  });

  if (!isAdmin) return;
  if (a.status === "selected") bindFunding(a, uid);
  store.listAudit(uid).then(list => {
    const box = root.querySelector("#auditBox");
    if (!box) return;
    const label = e => e.action === "status" ? `Status: ${STATUS[e.from] || e.from || "—"} → ${STATUS[e.to] || e.to}${e.remark ? ` (remark: "${e.remark}")` : ""}`
      : e.action === "message" ? "Message sent to applicant" : e.action === "assign" ? `Reviewers set: ${(e.reviewers || []).join(", ") || "none"}`
      : e.action === "funding" ? "Funding details updated" : e.action === "create" ? "Record created by programme team" : e.action === "edit" ? "Application details edited" : e.action;
    box.innerHTML = list.length ? `<ul class="notif">${list.map(e => `<li><b style="font-size:.85rem">${esc(label(e))}</b><time>${esc(e.by || "")} · ${fmtDT(e.at)}</time></li>`).join("")}</ul>` : "No administrative actions recorded yet.";
  }).catch(() => { const box = root.querySelector("#auditBox"); if (box) box.textContent = "Couldn't load the audit trail."; });

  root.querySelector("#saveStatus").addEventListener("click", async e => {
    const btn = e.target; btn.disabled = true;
    const status = root.querySelector("#newStatus").value;
    let remark = root.querySelector("#remark").value.trim();
    let adminNote = root.querySelector("#adminNote").value.trim();
    const changed = status !== a.status;
    if (!changed && remark) { adminNote = [remark, adminNote].filter(Boolean).join("\n\n"); remark = ""; }
    if (!changed && !adminNote) { toast("Nothing to save"); btn.disabled = false; return; }
    const now = new Date().toISOString();
    const patch = {};
    if (adminNote) patch.messages = [...(a.messages || []), { text: adminNote, at: now, by: user.email }];
    if (changed) {
      patch.status = status;
      patch.timeline = [...(a.timeline || []), { status, at: now, by: user.email, ...(remark ? { remark } : {}) }];
    }
    try {
      await store.updateApplication(uid, patch);
      if (changed) await store.addAudit({ appId: uid, applicationId: a.applicationId || "", action: "status", from: a.status, to: status, remark, by: user.email });
      if (adminNote) await store.addAudit({ appId: uid, applicationId: a.applicationId || "", action: "message", text: adminNote, by: user.email });
      Object.assign(a, patch);
      adminNote = [remark, adminNote].filter(Boolean).join("\n\n");
      const mail = root.querySelector("#sendMail")?.checked && (changed || adminNote);
      if (mail) toast((await mailStatus(a, a.status, adminNote)) ? "Saved and emailed founder" : "Saved, but the email failed to send");
      else toast("Saved");
      renderDetail(uid);
    } catch (err) { toast(friendlyError(err)); btn.disabled = false; }
  });

  root.querySelectorAll("[data-assign]").forEach(cb => cb.addEventListener("change", async () => {
    const next = [...root.querySelectorAll("[data-assign]:checked")].map(x => x.dataset.assign);
    try { await store.updateApplication(uid, { assignedTo: next }); await store.addAudit({ appId: uid, applicationId: a.applicationId || "", action: "assign", reviewers: next.map(rName), by: user.email }); a.assignedTo = next; toast("Reviewers updated"); }
    catch (err) { cb.checked = !cb.checked; toast(friendlyError(err)); }
  }));

  root.querySelector("#addNote").addEventListener("click", async () => {
    const text = root.querySelector("#newNote").value.trim();
    if (!text) return;
    review.notes.push({ text, by: user.email, at: new Date().toISOString() });
    try { await store.saveReview(uid, review); toast("Note added"); renderDetail(uid); }
    catch (err) { review.notes.pop(); toast(friendlyError(err)); }
  });
}

// ── Reviewer management (admin) ───────────────────────────────
function renderTeam() {
  const load = uid => apps.filter(a => (a.assignedTo || []).includes(uid)).length;
  root.innerHTML = `
    <p style="margin:0 0 12px"><a href="admin.html" class="small">← All applications</a></p>
    <div class="dash-head"><div><p class="small muted" style="margin:0 0 4px">Admin console</p><h1>Reviewers</h1></div></div>
    <div class="admin-grid">
      <section class="table-wrap">
        ${reviewers.length ? `<table class="data" style="min-width:520px"><thead><tr><th>Name</th><th>Email</th><th>Assigned</th><th></th></tr></thead><tbody>
          ${reviewers.map(r => `<tr style="cursor:default"><td><b>${esc(r.name)}</b></td><td>${esc(r.email || "")}</td><td>${load(r.uid)}</td><td style="text-align:right"><button class="btn btn-ghost btn-sm" data-rm="${esc(r.uid)}">Remove</button></td></tr>`).join("")}
        </tbody></table>` : `<div class="empty">No reviewers yet. Add your first reviewer using the form.</div>`}
      </section>
      <aside class="panel">
        <h2 style="font-size:1.05rem">Add a reviewer</h2>
        <p class="small muted">Ask the reviewer to create an account on the portal, then open <b>${esc(location.host)}/admin.html</b>. It will show their user ID. Paste it below.</p>
        <div class="field"><label for="rUid">User ID</label><input id="rUid" type="text"></div>
        <div class="field"><label for="rName">Name</label><input id="rName" type="text"></div>
        <div class="field"><label for="rEmail">Email</label><input id="rEmail" type="email"></div>
        <button class="btn btn-primary" style="width:100%" id="addRev">Add reviewer</button>
      </aside>
    </div>`;
  root.querySelector("#addRev").addEventListener("click", async () => {
    const uid = root.querySelector("#rUid").value.trim(), name = root.querySelector("#rName").value.trim(), email = root.querySelector("#rEmail").value.trim();
    if (!uid || !name) { toast("User ID and name are required"); return; }
    try { await store.addReviewer(uid, { name, email }); reviewers = await store.listReviewers(); toast("Reviewer added"); renderTeam(); }
    catch (err) { toast(friendlyError(err)); }
  });
  root.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", async () => {
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Click again to remove"; return; }
    try { await store.removeReviewer(b.dataset.rm); reviewers = await store.listReviewers(); toast("Reviewer removed"); renderTeam(); }
    catch (err) { toast(friendlyError(err)); }
  }));
}

// ── Funding & tranches (admin, selected applications) ─────────
const TR_STATUS = { planned: "Planned", due: "Due", released: "Released", on_hold: "On hold" };

function fundingHTML(a, progress) {
  const f = a.funding || {};
  const tr = f.tranches?.length ? f.tranches : [{ label: "Tranche 1", amount: "", milestone: "", status: "planned" }];
  const released = tr.filter(t => t.status === "released").reduce((x, t) => x + (+t.amount || 0), 0);
  const planned = tr.reduce((x, t) => x + (+t.amount || 0), 0);
  const reports = progress.reports || [];
  return `<div class="panel" style="margin-bottom:24px">
    <h2 style="font-size:1.1rem">Funding &amp; tranches</h2>
    <div class="field-row">
      <div class="field"><label for="fSanc">Sanctioned amount (₹)</label><input id="fSanc" type="number" min="0" value="${esc(f.sanctioned ?? D(a).amountAsked ?? "")}"></div>
      <div class="field"><label for="fInst">Instrument</label><select id="fInst">${["Seed grant", "Equity investment", "Convertible note / debenture", "Debt", "Mentorship & services only"].map(o => `<option${(f.instrument || D(a).supportType) === o ? " selected" : ""}>${o}</option>`).join("")}</select></div>
    </div>
    <div class="field-row">
      <div class="field"><label for="fAgr">Agreement date</label><input id="fAgr" type="date" value="${esc(f.agreementDate || "")}"></div>
      <div class="field"><label>Released so far</label><div style="padding:11px 0;font-weight:700">${money(released) || "₹0"} <span class="muted small" style="font-weight:400">of ${money(planned) || "₹0"} planned</span></div></div>
    </div>
    <div class="table-wrap" style="margin-bottom:12px"><table class="data" style="min-width:640px"><thead><tr><th>Tranche</th><th>Amount (₹)</th><th>Milestone / condition</th><th>Status</th><th>Released on</th><th>Ref. no.</th><th></th></tr></thead>
      <tbody id="trBody">${tr.map((t, i) => trRow(t, i)).join("")}</tbody></table></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" id="addTr">+ Add tranche</button>
      <button class="btn btn-primary btn-sm" id="saveFund">Save funding</button>
    </div>
    <p class="hint">The founder sees this on their dashboard, including the sanctioned amount, tranches, milestones, release dates and reference numbers.</p>
  </div>`;
}

function trRow(t, i) {
  return `<tr style="cursor:default" data-tr="${i}">
    <td><input type="text" data-tf="label" value="${esc(t.label || "")}" style="min-width:110px"></td>
    <td><input type="number" min="0" data-tf="amount" value="${esc(t.amount ?? "")}" style="min-width:110px"></td>
    <td><input type="text" data-tf="milestone" value="${esc(t.milestone || "")}" style="min-width:160px"></td>
    <td><select data-tf="status">${Object.entries(TR_STATUS).map(([k, l]) => `<option value="${k}"${t.status === k ? " selected" : ""}>${l}</option>`).join("")}</select></td>
    <td><input type="date" data-tf="releasedOn" value="${esc(t.releasedOn || "")}"></td>
    <td><input type="text" data-tf="reference" value="${esc(t.reference || "")}" placeholder="UTR / cheque no." style="min-width:110px"></td>
    <td><button class="btn btn-ghost btn-sm" data-deltr="${i}">✕</button></td></tr>`;
}

function bindFunding(a, uid) {
  const body = root.querySelector("#trBody");
  const read = () => [...body.querySelectorAll("[data-tr]")].map(row => Object.fromEntries([...row.querySelectorAll("[data-tf]")].map(el => [el.dataset.tf, el.value.trim()])));
  const redraw = list => { body.innerHTML = list.map((t, i) => trRow(t, i)).join(""); bindDel(); };
  const bindDel = () => body.querySelectorAll("[data-deltr]").forEach(b => b.addEventListener("click", () => { const l = read(); l.splice(+b.dataset.deltr, 1); redraw(l); }));
  bindDel();
  root.querySelector("#addTr").addEventListener("click", () => { const l = read(); l.push({ label: `Tranche ${l.length + 1}`, amount: "", milestone: "", status: "planned" }); redraw(l); });
  root.querySelector("#saveFund").addEventListener("click", async e => {
    e.target.disabled = true;
    const funding = {
      sanctioned: root.querySelector("#fSanc").value, instrument: root.querySelector("#fInst").value,
      agreementDate: root.querySelector("#fAgr").value,
      tranches: read().filter(t => t.label || t.amount).map(t => ({ ...t, amount: t.amount === "" ? "" : +t.amount }))
    };
    try { await store.updateApplication(uid, { funding }); await store.addAudit({ appId: uid, applicationId: a.applicationId || "", action: "funding", sanctioned: funding.sanctioned, by: user.email }); a.funding = funding; toast("Funding saved"); renderDetail(uid); }
    catch (err) { toast(friendlyError(err)); e.target.disabled = false; }
  });
}

// ── Reports (admin) ───────────────────────────────────────────
function bars(title, entries, fmtV = v => v) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return `<div class="panel"><h2 style="font-size:1.05rem">${title}</h2>
    ${entries.length ? entries.map(([k, v]) => `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:.85rem;gap:8px"><span>${esc(k)}</span><b>${fmtV(v)}</b></div>
      <div class="progress" style="margin:4px 0 0"><div style="width:${(v / max) * 100}%"></div></div></div>`).join("") : '<p class="small muted">No data yet.</p>'}</div>`;
}

function renderReports() {
  const sub = apps.filter(a => a.status !== "draft");
  const sel = sub.filter(a => a.status === "selected");
  const sum = arr => arr.reduce((x, y) => x + (+y || 0), 0);
  const totalAsk = sum(sub.map(a => D(a).amountAsked));
  const sanctioned = sum(sel.map(a => a.funding?.sanctioned));
  const released = sum(sel.flatMap(a => (a.funding?.tranches || []).filter(t => t.status === "released").map(t => t.amount)));
  const group = key => Object.entries(sub.reduce((m, a) => { const k = D(a)[key] || "Not specified"; m[k] = (m[k] || 0) + 1; return m; }, {})).sort((x, y) => y[1] - x[1]);
  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push([d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), sub.filter(a => (a.submittedAt || "").slice(0, 7) === key).length]);
  }
  const furthest = a => Math.max(0, ...[a.status, ...(a.timeline || []).map(t => t.status)].map(x => x === "rejected" ? -1 : stageIndex(x)));
  const funnel = PSTAGES.map((st, i) => [i === PSTAGES.length - 1 ? "Selected" : st.label, i === PSTAGES.length - 1 ? sel.length : sub.filter(a => furthest(a) >= i).length]);
  const kpi = (n, l) => `<div class="stat" style="cursor:default"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  const rate = sub.length ? Math.round(sel.length / sub.length * 100) + "%" : "—";

  root.innerHTML = `
    <p style="margin:0 0 12px"><a href="admin.html" class="small">← All applications</a></p>
    <div class="dash-head"><div><p class="small muted" style="margin:0 0 4px">Admin console</p><h1>Reports</h1></div>
      <button class="btn btn-outline btn-sm" onclick="window.print()">Print / save PDF</button></div>
    <div class="stats">
      ${kpi(sub.length, "Applications submitted")}${kpi(sel.length, "Selected")}${kpi(rate, "Selection rate")}
      ${kpi(money(totalAsk) || "₹0", "Total funding asked")}${kpi(money(sanctioned) || "₹0", "Sanctioned")}${kpi(money(released) || "₹0", "Released")}
    </div>
    <div class="grid-2" style="margin-bottom:20px">
      ${bars("Selection funnel", funnel)}
      ${bars("Submissions — last 12 months", months)}
    </div>
    <div class="grid-3">
      ${bars("By sector", group("sector"))}
      ${bars("By state", group("state"))}
      ${bars("By stage", group("stage"))}
    </div>`;
}

// ── Add / edit a startup record (admin) ───────────────────────
function renderEdit(uid) {
  const a = uid ? apps.find(x => x.uid === uid) : null;
  if (uid && !a) { location.hash = ""; return; }
  const d = a?.data || {};
  const today = new Date().toISOString().slice(0, 10);
  const field = f => {
    const v = esc(d[f.k] ?? "");
    const lab = `<label for="e-${f.k}">${esc(f.label)}${f.req ? ' <span class="req">*</span>' : ""}</label>`;
    const input = f.type === "select"
      ? `<select id="e-${f.k}" data-e="${f.k}"><option value="">Select…</option>${f.options.map(o => `<option${o === d[f.k] ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`
      : `<input id="e-${f.k}" data-e="${f.k}" type="${f.type || "text"}" value="${v}" ${f.type === "number" ? 'min="0"' : ""}>`;
    return `<div class="field">${lab}${input}</div>`;
  };
  const pairs = [];
  for (let i = 0; i < REC.length; i += 2) pairs.push(`<div class="field-row">${field(REC[i])}${REC[i + 1] ? field(REC[i + 1]) : "<div></div>"}</div>`);
  root.innerHTML = `
    <p style="margin:0 0 12px"><a href="${a ? `#app=${encodeURIComponent(uid)}` : "admin.html"}" class="small">← ${a ? "Back to startup" : "All startups"}</a></p>
    <div class="dash-head"><div><p class="small muted" style="margin:0 0 4px">Admin console</p><h1>${a ? "Edit startup" : "Add startup"}</h1></div></div>
    <div class="panel" style="max-width:860px">
      <div class="alert alert-info">The founder logs in at <b>${esc(location.host)}</b> with the <b>founder email</b> below, verifies it, and then sees this record's status, messages and funding. They can't edit anything.</div>
      <div class="field-row">
        <div class="field"><label for="e-appId">Application ID</label><input id="e-appId" type="text" value="${esc(a?.applicationId || "SFS-" + new Date().getFullYear() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase())}"></div>
        <div class="field"><label for="e-date">Applied on</label><input id="e-date" type="date" value="${esc((a?.submittedAt || "").slice(0, 10) || today)}"></div>
      </div>
      ${a ? "" : `<div class="field"><label for="e-status">Initial status</label><select id="e-status">${ORDER.map(s => `<option value="${s}">${STATUS[s]}</option>`).join("")}</select></div>`}
      ${pairs.join("")}
      <div class="panel-actions"><span></span><button class="btn btn-primary" id="saveRec">${a ? "Save changes" : "Create startup"}</button></div>
    </div>`;

  root.querySelector("#saveRec").addEventListener("click", async e => {
    const data = { ...(a?.data || {}) };
    root.querySelectorAll("[data-e]").forEach(el => { data[el.dataset.e] = el.value.trim(); });
    data.founderEmail = (data.founderEmail || "").toLowerCase();
    const missing = REC.filter(f => f.req && !data[f.k]).map(f => f.label);
    if (missing.length) { toast("Required: " + missing.join(", ")); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.founderEmail)) { toast("Enter a valid founder email"); return; }
    const applicationId = root.querySelector("#e-appId").value.trim();
    const dateV = root.querySelector("#e-date").value;
    const submittedAt = dateV ? new Date(dateV + "T10:00:00").toISOString() : new Date().toISOString();
    e.target.disabled = true;
    try {
      if (a) {
        const patch = { data, founderEmail: data.founderEmail, applicationId, submittedAt };
        await store.updateApplication(uid, patch);
        await store.addAudit({ appId: uid, applicationId, action: "edit", by: user.email });
        Object.assign(a, patch);
        toast("Saved");
        location.hash = "app=" + encodeURIComponent(uid);
      } else {
        const status = root.querySelector("#e-status").value;
        const rec = { data, founderEmail: data.founderEmail, applicationId, submittedAt, status,
          timeline: [{ status: "submitted", at: submittedAt, by: user.email }].concat(status !== "submitted" ? [{ status, at: new Date().toISOString(), by: user.email }] : []),
          messages: [], assignedTo: [] };
        const id = await store.createApplication(rec);
        await store.addAudit({ appId: id, applicationId, action: "create", to: status, by: user.email });
        apps.push({ uid: id, ...rec });
        toast("Startup added");
        location.hash = "app=" + encodeURIComponent(id);
      }
    } catch (err) { toast(friendlyError(err)); e.target.disabled = false; }
  });
}
