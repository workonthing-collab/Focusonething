// Founder dashboard — view only. Shows the records the admin created for this founder's verified email.
import "./common.js";
import { toast, esc } from "./common.js";
import { store, friendlyError } from "./store.js";
import { site } from "./config.js";
import { STATUS, FLOW, money } from "./schema.js";

const root = document.getElementById("root");
let user = null;

const fmt = d => d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

document.getElementById("logoutBtn").addEventListener("click", async () => { await store.signOut(); location.replace("login.html"); });

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
    <div class="panel" style="max-width:560px;margin:40px auto;text-align:center">
      <h2>Verify your email</h2>
      <p class="muted">We sent a verification link to <b>${esc(user.email)}</b>. Open it, then come back and click the button below.</p>
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

// ── Load & render ─────────────────────────────────────────────
async function load() {
  root.innerHTML = `<div class="spinner"></div>`;
  let recs = [];
  try { recs = await store.getMyApplications(user.email); }
  catch (e) { root.innerHTML = `<div class="alert alert-error">Couldn't load your application. ${esc(friendlyError(e))}</div>`; return; }

  if (!recs.length) {
    // Staff accounts have no founder record; send them to the console.
    try { if (!store.demo && await store.getRole(user.uid)) { location.replace("admin.html"); return; } } catch {}
    root.innerHTML = `
      <div class="panel" style="max-width:600px;margin:40px auto;text-align:center">
        <h2>No application found</h2>
        <p class="muted">We couldn't find an application linked to <b>${esc(user.email)}</b>.</p>
        <p class="small muted">Make sure you logged in with the same email you used when applying. If you think this is a mistake, write to
        <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>.</p>
      </div>`;
    return;
  }
  recs.sort((a, b) => (b.submittedAt || b.createdAt || "").localeCompare(a.submittedAt || a.createdAt || ""));
  root.innerHTML = recs.map(recordHTML).join('<div style="height:32px"></div>');
}

const NOTE = {
  submitted: "We've received your application. It will be screened by our team shortly.",
  under_review: "Your application is being evaluated by our review team.",
  shortlisted: "Congratulations, you've been shortlisted. We'll contact you about the next round.",
  selected: "Congratulations, your startup has been selected.",
  rejected: "Thank you for applying. Your application was not selected this time. You're welcome to apply again in a future cycle."
};
const TR_LABEL = { planned: "Planned", due: "Due", released: "Released", on_hold: "On hold" };
const TR_BADGE = { planned: "draft", due: "shortlisted", released: "selected", on_hold: "rejected" };

function timelineHTML(a) {
  const st = a.status;
  const reached = {};
  (a.timeline || []).forEach(t => { reached[t.status] = t.at; });
  const furthest = Math.max(0, ...[st, ...Object.keys(reached)].map(s => FLOW.indexOf(s)));
  let items = FLOW.map((k, i) => ({ k, at: reached[k], cls: k === st ? (st === "selected" ? "done" : "current") : (i <= furthest ? "done" : "") }));
  if (st === "rejected") items = items.slice(0, furthest + 1).concat([{ k: "rejected", cls: "fail", at: reached.rejected }]);
  return `<ul class="timeline">${items.map(it => `<li class="${it.cls}"><span class="dot"></span><b>${STATUS[it.k]}</b><span>${it.at ? fmt(it.at) : (it.cls ? "" : "Pending")}</span></li>`).join("")}</ul>`;
}

function fundingHTML(a) {
  const f = a.funding;
  if (!f || !f.sanctioned) return a.status === "selected" ? `<h2 style="margin-top:24px">Funding</h2><p class="muted small">Your funding details and tranche schedule will appear here once finalised.</p>` : "";
  const tr = f.tranches || [];
  const released = tr.filter(t => t.status === "released").reduce((x, t) => x + (+t.amount || 0), 0);
  return `
    <h2 style="margin-top:24px">Funding</h2>
    <table class="summary-table" style="margin-bottom:14px">
      <tr><th>Sanctioned amount</th><td><b>${esc(money(f.sanctioned))}</b></td></tr>
      <tr><th>Instrument</th><td>${esc(f.instrument || "—")}</td></tr>
      ${f.agreementDate ? `<tr><th>Agreement date</th><td>${esc(fmtDate(f.agreementDate))}</td></tr>` : ""}
      <tr><th>Released so far</th><td>${esc(money(released) || "₹0")}</td></tr>
    </table>
    ${tr.length ? `<div class="table-wrap"><table class="data" style="min-width:520px"><thead><tr><th>Tranche</th><th>Amount</th><th>Milestone</th><th>Status</th><th>Released on</th></tr></thead><tbody>
      ${tr.map(t => `<tr style="cursor:default"><td><b>${esc(t.label)}</b></td><td>${esc(money(t.amount) || "—")}</td><td>${esc(t.milestone || "—")}</td><td><span class="badge badge-${TR_BADGE[t.status] || "draft"}">${TR_LABEL[t.status] || esc(t.status)}</span></td><td class="small">${t.releasedOn ? esc(fmtDate(t.releasedOn)) : "—"}${t.reference ? `<div class="muted">Ref: ${esc(t.reference)}</div>` : ""}</td></tr>`).join("")}
    </tbody></table></div>` : ""}`;
}

function recordHTML(a) {
  const d = a.data || {};
  const st = a.status || "submitted";
  const msgs = (a.messages || []).slice().reverse();
  return `
    <div class="dash-head">
      <div>
        <p class="small muted" style="margin:0 0 4px">Application ID · <b>${esc(a.applicationId || "—")}</b></p>
        <h1>${esc(d.companyName || "Your application")}</h1>
      </div>
      <span class="badge badge-${st}">${STATUS[st] || esc(st)}</span>
    </div>
    <div class="dash-grid">
      <aside class="side-card">
        <h3 style="font-size:1rem">Application status</h3>
        ${timelineHTML(a)}
      </aside>
      <section class="panel">
        <div class="alert ${st === "rejected" ? "alert-error" : "alert-ok"}">${esc(NOTE[st] || "")}</div>
        <h2>Messages from the team</h2>
        ${msgs.length ? msgs.map(m => `<div class="note">${esc(m.text)}<div class="meta">${fmt(m.at)}</div></div>`).join("") : '<p class="small muted">No messages yet. Updates from our team will appear here.</p>'}
        ${fundingHTML(a)}
        <h2 style="margin-top:24px">Application details</h2>
        <table class="summary-table">
          ${[["Company", d.companyName], ["Brand", d.brandName], ["Founder", d.founderName], ["Sector", d.sector], ["Stage", d.stage], ["Location", [d.city, d.state].filter(Boolean).join(", ")], ["Amount requested", money(d.amountAsked)], ["Applied on", a.submittedAt ? fmtDate(a.submittedAt) : ""]]
            .filter(r => r[1]).map(r => `<tr><th>${r[0]}</th><td>${esc(r[1])}</td></tr>`).join("")}
        </table>
        <p class="small muted" style="margin-top:18px">Something wrong in these details? Email <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> with your application ID.</p>
      </section>
    </div>`;
}
