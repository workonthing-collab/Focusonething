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
  const links = document.querySelector(".nav-links");
  if (btn && links) {
    btn.addEventListener("click", () => links.classList.toggle("open"));
    links.querySelectorAll("a").forEach(a => a.addEventListener("click", () => links.classList.remove("open")));
  }
  document.querySelectorAll("[data-year]").forEach(el => (el.textContent = new Date().getFullYear()));
  document.querySelectorAll("[data-site-email]").forEach(el => { el.textContent = site.email; el.href = "mailto:" + site.email; });
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
    slot.innerHTML = u
      ? `<a class="btn btn-primary btn-sm" href="dashboard.html">My dashboard</a>`
      : `<a class="btn btn-primary btn-sm" href="login.html">Log in</a>`;
  });
}

initNav();
initDemoBanner();
initAuthNav();
