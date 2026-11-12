// Shared page behaviour: mobile nav, demo banner, auth-aware nav, toasts.
import { store } from "./store.js";
import { site } from "./config.js";

export function toast(msg, ms = 2600) {
  const t = document.createElement("div");
  t.className = "toast"; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function initNav() {
  const btn = document.querySelector(".nav-toggle");
  const links = document.querySelector(".navbar") || document.querySelector(".nav-links");
  if (btn && links) {
    btn.addEventListener("click", () => { const o = links.classList.toggle("open"); btn.setAttribute("aria-expanded", o); });
    links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => { links.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }));
  }
  document.querySelectorAll("[data-year]").forEach(el => (el.textContent = new Date().getFullYear()));
  document.querySelectorAll("[data-site-email]").forEach(el => { el.textContent = site.email; el.href = "mailto:" + site.email; });
  if (site.feePolicy) document.querySelectorAll("[data-fee-policy]").forEach(el => { el.textContent = site.feePolicy; });
  initEligibility();
  document.querySelectorAll("[data-mailto]").forEach(el => { el.href = "mailto:" + site.email + "?subject=" + encodeURIComponent("Application – " + site.name); });
}

function initEligibility() {
  const boxes = [...document.querySelectorAll("[data-elig]")];
  if (!boxes.length) return;
  const res = document.querySelector("[data-elig-result]");
  const update = () => {
    const n = boxes.filter(b => b.checked).length, all = n === boxes.length;
    res.querySelector("[data-elig-count]").textContent = n;
    res.querySelector("[data-elig-msg]").textContent = all
      ? "You appear to meet the basic criteria. Final eligibility is confirmed during review."
      : n ? `${boxes.length - n} requirement(s) not yet confirmed. All are needed to apply.` : "Tick the statements that apply to you.";
    res.classList.toggle("ok", all);
    res.querySelector("[data-elig-apply]").classList.toggle("hidden", !all);
  };
  boxes.forEach(b => b.addEventListener("change", update));
  update();
}

function initDemoBanner() {
  if (!store.demo) return;
  const b = document.createElement("div");
  b.className = "demo-banner";
  b.textContent = "Demo mode — data is saved only in this browser. Connect Firebase to go live.";
  document.body.prepend(b);
}

function initAuthNav() {
  const slot = document.querySelector("[data-auth-slot]");
  if (!slot) return;
  store.onUser(u => {
    if (!slot.dataset.orig) slot.dataset.orig = slot.innerHTML;
    slot.innerHTML = u ? `<a class="btn btn-primary btn-sm" href="dashboard.html">My Dashboard</a>` : slot.dataset.orig;
  });
}

initNav();
initDemoBanner();
initAuthNav();

// ── Trust blocks: rendered only from real details in config.js; empty blocks stay hidden ──
function hideSection(el) { (el.closest("[data-section]") || el).classList.add("hidden"); }
const fmtDay = d => { try { return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch { return d; } };

function renderTrust() {
  const s = site;
  const tel = p => (p || "").replace(/[^\d+]/g, "");

  const rib = document.querySelector("[data-ribbon-contacts]");
  if (rib) rib.innerHTML = [s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : "", s.phone ? `<a href="tel:${esc(tel(s.phone))}">${esc(s.phone)}</a>` : "", s.hours ? `<span>${esc(s.hours)}</span>` : ""].join("");

  const top = document.querySelector("[data-topbar]");
  if (top) {
    const items = [];
    if (s.email) items.push(`<a href="mailto:${esc(s.email)}">✉ ${esc(s.email)}</a>`);
    if (s.phone) items.push(`<a href="tel:${esc(tel(s.phone))}">☎ ${esc(s.phone)}</a>`);
    if (s.hours) items.push(`<span>${esc(s.hours)}</span>`);
    const soc = Object.entries(s.social || {}).filter(([, u]) => u)
      .map(([k, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc({ linkedin: "LinkedIn", instagram: "Instagram", x: "X", youtube: "YouTube" }[k] || k)}</a>`);
    if (items.length || soc.length) top.innerHTML = `<div class="container topbar-inner"><div>${items.join("")}</div><div>${soc.join("")}</div></div>`;
    else top.remove();
  }

  const stats = document.querySelector("[data-stats]");
  if (stats) {
    if ((s.stats || []).length) stats.innerHTML = s.stats.map(x => `<div class="impact"><div class="n">${esc(x.value)}</div><div class="l">${esc(x.label)}</div></div>`).join("");
    else hideSection(stats);
  }

  const ann = document.querySelector("[data-announcements]");
  if (ann) {
    const list = (s.announcements || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (list.length) ann.innerHTML = list.map(a => `<article class="card news"><time>${esc(fmtDay(a.date))}</time><h3>${esc(a.title)}</h3>${a.text ? `<p class="muted">${esc(a.text)}</p>` : ""}${a.link ? `<a href="${esc(a.link)}" target="_blank" rel="noopener">Read more →</a>` : ""}</article>`).join("");
    else hideSection(ann);
  }

  const partners = document.querySelector("[data-partners]");
  if (partners) {
    if ((s.partners || []).length) partners.innerHTML = s.partners.map(p => `<a class="partner" ${p.url ? `href="${esc(p.url)}" target="_blank" rel="noopener"` : ""} title="${esc(p.name)}">${p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.name)}" loading="lazy">` : `<span>${esc(p.name)}</span>`}</a>`).join("");
    else hideSection(partners);
  }

  const contacts = document.querySelector("[data-contacts]");
  if (contacts) {
    const rows = (s.contacts || []).map(c => `<tr><td><b>${esc(c.role)}</b></td><td>${esc(c.name || "")}</td><td>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</td><td>${c.phone ? `<a href="tel:${esc(tel(c.phone))}">${esc(c.phone)}</a>` : ""}</td></tr>`).join("");
    contacts.innerHTML = `
      <div class="contact-grid">
        <div class="card">
          <h3>Reach us</h3>
          <ul class="contact-list">
            ${s.email ? `<li><span>Email</span><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ""}
            ${s.phone ? `<li><span>Phone</span><a href="tel:${esc(tel(s.phone))}">${esc(s.phone)}</a></li>` : ""}
            ${s.hours ? `<li><span>Hours</span>${esc(s.hours)}</li>` : ""}
            ${s.address ? `<li><span>Address</span>${esc(s.address)}</li>` : ""}
          </ul>
        </div>
        ${rows ? `<div class="table-wrap"><table class="data" style="min-width:520px"><thead><tr><th>For</th><th>Contact</th><th>Email</th><th>Phone</th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}
      </div>`;
  }

  document.querySelectorAll("[data-operator]").forEach(el => {
    if (s.operator) el.textContent = `${s.name} is a program operated by ${s.operator}${s.cin ? ` (CIN ${s.cin})` : ""}${s.address ? `, ${s.address}` : ""}.`;
    else el.remove();
  });
}
// Scrolling announcement ticker at the very top of the page (config.site.ticker).
function renderTicker() {
  if (!site.ticker || document.querySelector(".ticker")) return;
  const bar = document.createElement("div");
  bar.className = "ticker";
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-label", site.ticker);
  const t = esc(site.ticker);
  bar.innerHTML = `<div class="ticker__track" aria-hidden="true"><span>${t}</span><span>${t}</span></div>`;
  document.body.prepend(bar);
}
renderTicker();

renderTrust();
