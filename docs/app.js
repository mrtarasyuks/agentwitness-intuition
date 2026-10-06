/* AgentWitness — read-only trust explorer for Intuition.
   Everything here reads the public Intuition GraphQL indexer from the browser.
   No wallet, no signing, no transactions, no backend, no API keys. */

"use strict";

const ENDPOINT = "https://mainnet.intuition.sh/v1/graphql";
const EXPLORER = "https://explorer.intuition.systems";
const MAIN_CURVE = "1"; // the base bonding curve; numbers are reported from it
const REPO_URL = ""; // set to the public repo URL at publish time; left empty so no fake link ships

// Known predicate atoms on mainnet (verified live from the indexer).
const PRED_TRUSTS = "0x3a73f3b1613d166eea141a25a2adc70db9304ab3c4e90daecad05f86487c3ee9";

const EXAMPLES = [
  { q: "Intuition",   note: "most-staked atom" },
  { q: "Sofia",       note: "an AI agent atom" },
  { q: "jenny2day.eth", note: "an active account" },
  { q: "trusts",      note: "the “trusts” predicate" },
];

/* ---------- tiny utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 18-decimal fixed-point (wei) -> human TRUST number.
function toTrust(wei) {
  if (wei == null) return 0;
  try { return Number(BigInt(wei)) / 1e18; } catch { return Number(wei) / 1e18; }
}
function fmt(n, d = 2) {
  if (!isFinite(n)) return "0";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(2) + "K";
  if (a === 0) return "0";
  if (a < 0.01) return n.toExponential(1);
  return n.toLocaleString("en-US", { maximumFractionDigits: d });
}
const trust = (wei, d = 2) => fmt(toTrust(wei), d);
function shortHash(h) { return !h ? "" : h.length > 16 ? h.slice(0, 8) + "…" + h.slice(-6) : h; }
function shortAddr(a) { return !a ? "" : a.slice(0, 6) + "…" + a.slice(-4); }
function timeAgo(iso) {
  const t = new Date(iso).getTime(), s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  const m = s / 60; if (m < 60) return Math.floor(m) + "m ago";
  const h = m / 60; if (h < 24) return Math.floor(h) + "h ago";
  const d = h / 24; if (d < 30) return Math.floor(d) + "d ago";
  const mo = d / 30; if (mo < 12) return Math.floor(mo) + "mo ago";
  return Math.floor(mo / 12) + "y ago";
}
function dateStr(iso) { return new Date(iso).toISOString().slice(0, 10); }

const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;

/* Designed emoji / initial tiles instead of raw emoji.
   The colour is derived deterministically from the atom id or label. */
function hashHue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
function initials(label) {
  const s = String(label || "?").replace(/^0x/, "").trim();
  const parts = s.split(/[\s_\-.:/]+/).filter(Boolean);
  let r = (parts[0] && parts[0][0]) || s[0] || "?";
  if (parts[1] && parts[1][0]) r += parts[1][0];
  return r.toUpperCase().slice(0, 2);
}
function avatar(emoji, label, id, size) {
  let e = (emoji || "").trim();
  if (e === "•" || e === "·" || e === "-") e = ""; // bullets → designed initials tile
  const hue = hashHue(id || label || "x");
  const cls = "av" + (size ? " " + size : "") + (e ? "" : " ini");
  return `<span class="${cls}" style="--h:${hue}">${e ? esc(e) : esc(initials(label))}</span>`;
}

/* Inline line-icons — used instead of raw UI emoji so the chrome stays "designed".
   All stroke currentColor, 24×24 viewBox. */
const ICON = {
  search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  person: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/></svg>`,
  shieldCheck: `<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  shieldWarn: `<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6z"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r=".6"/></svg>`,
  shieldAlert: `<svg viewBox="0 0 24 24"><path d="M10.3 3.2L2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.2a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="16.5" r=".6"/></svg>`,
  atom: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10" ry="4.5"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(120 12 12)"/></svg>`,
  link: `<svg viewBox="0 0 24 24"><path d="M9 15l6-6"/><path d="M10.5 6.5l1.5-1.5a4 4 0 0 1 5.7 5.7l-2.2 2.2"/><path d="M13.5 17.5L12 19a4 4 0 0 1-5.7-5.7l2.2-2.2"/></svg>`,
  signal: `<svg viewBox="0 0 24 24"><path d="M4 14l4-4 4 3 5-7"/><path d="M17 6h3v3"/></svg>`,
  user: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5"/></svg>`,
};
// A gradient tile holding a line-icon, same shape as avatar() tiles.
function iconTile(svg, seed, size) {
  const hue = hashHue(seed || "x");
  return `<span class="av${size ? " " + size : ""}" style="--h:${hue}">${svg}</span>`;
}

/* a short "magic" ripple + sparks from a point, plus a page-wide shimmer, then resolve */
function magic(x, y) {
  return new Promise((res) => {
    if (reduced) return res();
    // page-wide flash of light centred on the field
    const b = document.body;
    b.style.setProperty("--fx", (x / window.innerWidth * 100) + "%");
    b.style.setProperty("--fy", (y / window.innerHeight * 100) + "%");
    b.classList.add("flash");
    setTimeout(() => b.classList.remove("flash"), 650);
    // local ripple + sparks from the field
    const el = document.createElement("div");
    el.className = "magic";
    el.style.left = x + "px"; el.style.top = y + "px";
    const colors = ["#8be9c0", "#7aa2ff", "#67e8f9", "#b58bff"];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const sp = document.createElement("i");
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 70 + Math.random() * 70;
      sp.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      sp.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      sp.style.setProperty("--spark", colors[i % colors.length]);
      el.appendChild(sp);
    }
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); res(); }, 420);
  });
}

/* animate the just-rendered stat numbers and consensus bars */
function animateIn() {
  if (!reduced) document.querySelectorAll(".stat .v, .flag .pct").forEach(countUp);
  document.querySelectorAll(".bar > span").forEach((s) => {
    const w = s.style.width; if (!w) return;
    if (reduced) return;
    s.style.width = "0";
    requestAnimationFrame(() => requestAnimationFrame(() => { s.style.width = w; }));
  });
}
function countUp(el) {
  const html = el.innerHTML;
  const m = html.match(/-?\d[\d,]*\.?\d*/);
  if (!m) return;
  const target = parseFloat(m[0].replace(/,/g, ""));
  if (!isFinite(target) || target === 0) return;
  const pre = html.slice(0, m.index), suf = html.slice(m.index + m[0].length);
  const dec = (m[0].split(".")[1] || "").length;
  const grouped = m[0].indexOf(",") >= 0;
  const t0 = performance.now(), dur = 700;
  function tick(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    const v = target * e;
    const txt = grouped ? v.toLocaleString("en-US", { maximumFractionDigits: dec, minimumFractionDigits: dec })
                        : v.toFixed(dec);
    el.innerHTML = pre + txt + suf;
    if (p < 1) requestAnimationFrame(tick);
    else el.innerHTML = pre + m[0] + suf;
  }
  requestAnimationFrame(tick);
}

async function gql(query, variables) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) throw new Error("Indexer HTTP " + r.status);
  const j = await r.json();
  if (j.errors) throw new Error(j.errors.map(e => e.message).join("; "));
  return j.data;
}

function mainVault(term) {
  const vs = (term && term.vaults) || [];
  return vs.find(v => String(v.curve_id) === MAIN_CURVE) || vs[0] || null;
}

// A referenced atom (subject/predicate/object) can be null on mainnet when the
// underlying atom is missing; normalise so rendering never crashes on .label.
function aref(x) { return x || { term_id: "", label: "(unknown)", emoji: "" }; }

/* ---------- routing ---------- */
function go(q) {
  const url = new URL(location.href);
  url.searchParams.delete("address");
  url.searchParams.delete("compare");
  if (q) url.searchParams.set("q", q); else url.searchParams.delete("q");
  history.pushState({}, "", url);
  route();
}
window.addEventListener("popstate", route);

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-link]");
  if (link) { e.preventDefault(); go(""); }
  const nav = e.target.closest("[data-go]");
  if (nav) { e.preventDefault(); go(nav.getAttribute("data-go")); }
});

// A search was submitted: fire the "magic" ripple from the field, then route.
async function submitFrom(inputEl) {
  const v = (inputEl.value || "").trim();
  if (!v) return;
  const r = inputEl.getBoundingClientRect();
  await magic(r.left + r.width / 2, r.top + r.height / 2);
  go(v);
}
$("#search").addEventListener("submit", (e) => { e.preventDefault(); submitFrom($("#q")); });

// Any search field lights up the whole page while it is focused.
document.addEventListener("focusin", (e) => {
  if (e.target.matches(".search input, .hero-field input")) {
    document.body.classList.add("lit");
    const wrap = e.target.closest(".hero-search");
    if (wrap) wrap.classList.add("on");
  }
});
document.addEventListener("focusout", (e) => {
  if (e.target.matches(".search input, .hero-field input")) {
    document.body.classList.remove("lit");
    const wrap = e.target.closest(".hero-search");
    if (wrap) wrap.classList.remove("on");
  }
});

function classify(q) {
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) return "address";
  if (/^0x[0-9a-fA-F]{64}$/.test(q)) return "term";
  return "text";
}

async function route() {
  const p = new URLSearchParams(location.search);
  const compare = p.get("compare");
  const q = (p.get("q") || p.get("address") || "").trim();
  $("#q").value = q;
  document.body.classList.toggle("home", !q && !compare);
  window.scrollTo({ top: 0 });
  try {
    if (compare) await renderCompare(compare.split(",").slice(0, 2));
    else if (!q) await renderHome();
    else {
      const kind = classify(q);
      if (kind === "address") await renderAccount(q);
      else if (kind === "term") await renderTerm(q);
      else await renderSearch(q);
    }
    animateIn();
  } catch (err) {
    app.innerHTML = `<div class="err">Could not load data from the Intuition indexer.<br><span class="small mono">${esc(err.message)}</span></div>`;
  }
}

/* ---------- home ---------- */
async function renderHome() {
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow"><span class="dot"></span> Live on Intuition mainnet · 100% read-only</div>
      <h1>Read the <span class="hl">trust</span> behind any Intuition atom — before you trust it.</h1>
      <p>Paste a wallet, an atom, a triple, or just a name. AgentWitness reads the live knowledge graph
      and shows who staked for or against it, the full signal history, the top backers and a sybil heuristic.
      Nothing to connect, nothing to sign.</p>
      <form id="hero-form" class="hero-search" autocomplete="off">
        <div class="hero-field">
          <span class="ico">${ICON.search}</span>
          <input id="hero-q" type="text" spellcheck="false"
            placeholder="0x address, atom / triple id, or a name…" />
          <button type="submit">Explore</button>
        </div>
      </form>
      <div class="chips">
        <span class="lbl">try:</span>
        ${EXAMPLES.map(e => `<button class="chip" data-go="${esc(e.q)}">${esc(e.q)} <small>${esc(e.note)}</small></button>`).join("")}
      </div>
      <div class="netstats" id="netstats">
        ${[["atom", "Atoms"], ["link", "Triples"], ["signal", "Signals"], ["user", "Accounts"], ["shieldCheck", "TRUST staked"]]
          .map(([ic, k]) => `<div class="netstat skeleton"><div class="nv">···</div><div class="nk">${ICON[ic]} ${k}</div></div>`).join("")}
      </div>
    </section>
    <div class="grid2">
      <div class="panel"><h2>Most-staked atoms</h2><p class="hint">Where the most TRUST is at stake right now.</p><div id="top-atoms" class="list"><div class="loading">Loading</div></div></div>
      <div class="panel"><h2>Biggest “trusts” claims</h2><p class="hint">Triples using the <b>trusts</b> predicate, ranked by backing.</p><div id="top-trust" class="list"><div class="loading">Loading</div></div></div>
    </div>`;

  const hf = $("#hero-form");
  if (hf) hf.addEventListener("submit", (e) => { e.preventDefault(); submitFrom($("#hero-q")); });

  loadNetStats(); // fills the strip asynchronously; failure just hides it

  const data = await gql(`
    query home($pred:String!){
      vaults(limit:12, where:{curve_id:{_eq:1}, term:{atom:{term_id:{_is_null:false}}}}, order_by:{total_assets:desc}){
        term_id total_assets position_count
        term{ atom{ label emoji type } }
      }
      triples(limit:10, where:{predicate_id:{_eq:$pred}}, order_by:{term:{total_assets:desc}}){
        term_id
        subject{ label emoji } object{ label emoji }
        term{ total_assets } counter_term{ total_assets }
      }
    }`, { pred: PRED_TRUSTS });

  $("#top-atoms").innerHTML = data.vaults.map((v, i) => {
    const a = v.term.atom || {};
    return rowHTML(v.term_id, i + 1, a.emoji || "•", a.label || "(unnamed)",
      `${esc(a.type || "")} · ${v.position_count} backers`,
      `${trust(v.total_assets)} <small>TRUST</small>`);
  }).join("") || emptyHTML("No atoms found.");

  $("#top-trust").innerHTML = data.triples.map((t, i) => {
    const f = toTrust(t.term && t.term.total_assets), ag = toTrust(t.counter_term && t.counter_term.total_assets);
    const subj = aref(t.subject), obj = aref(t.object);
    return `<div class="row" data-go="${esc(t.term_id)}">
      <span class="rank">${i + 1}</span>
      <div class="main">
        <div class="ttl">${avatar(subj.emoji, subj.label, subj.label, "sm")} ${esc(subj.label)} <span class="muted">trusts</span> ${avatar(obj.emoji, obj.label, obj.label, "sm")} ${esc(obj.label)}</div>
        <div class="sub">for ${fmt(f)} · against ${fmt(ag)} TRUST</div>
      </div>
      <div class="val"><b>${fmt(f + ag)}</b><small>TRUST</small></div>
    </div>`;
  }).join("") || emptyHTML("No “trusts” claims yet.");
}

/* Live, chain-wide counters shown under the hero. Loaded on its own so a failure
   here never blocks the home lists. Only real numbers from the indexer are shown. */
async function loadNetStats() {
  const box = $("#netstats");
  if (!box) return;
  try {
    const d = await gql(`query stats{
      atoms_aggregate{aggregate{count}}
      triples_aggregate{aggregate{count}}
      signals_aggregate{aggregate{count}}
      accounts_aggregate{aggregate{count}}
      vaults_aggregate(where:{curve_id:{_eq:1}}){aggregate{sum{total_assets}}}
    }`);
    if (!$("#netstats")) return; // user navigated away
    const c = (x) => (x && x.aggregate && x.aggregate.count) || 0;
    const staked = d.vaults_aggregate && d.vaults_aggregate.aggregate.sum &&
                   d.vaults_aggregate.aggregate.sum.total_assets;
    const cells = [
      ["atom", "Atoms", fmt(c(d.atoms_aggregate), 0)],
      ["link", "Triples", fmt(c(d.triples_aggregate), 0)],
      ["signal", "Signals", fmt(c(d.signals_aggregate), 0)],
      ["user", "Accounts", fmt(c(d.accounts_aggregate), 0)],
    ];
    if (staked != null) cells.push(["shieldCheck", "TRUST staked", trust(staked, 0)]);
    box.innerHTML = cells.map(([ic, k, v]) =>
      `<div class="netstat"><div class="nv">${v}</div><div class="nk">${ICON[ic]} ${esc(k)}</div></div>`).join("");
    if (!reduced) box.querySelectorAll(".nv").forEach(countUp);
  } catch {
    box.remove(); // no made-up numbers: if the indexer won't answer, show nothing
  }
}

function rowHTML(goId, rank, emoji, title, sub, valHTML) {
  return `<div class="row" data-go="${esc(goId)}">
    ${rank != null ? `<span class="rank">${rank}</span>` : ""}
    ${avatar(emoji, title, goId)}
    <div class="main"><div class="ttl">${esc(title)}</div><div class="sub">${sub}</div></div>
    <div class="val"><b>${valHTML}</b></div>
  </div>`;
}
function emptyHTML(t) { return `<div class="empty">${esc(t)}</div>`; }

/* ---------- text search ---------- */
async function renderSearch(q) {
  app.innerHTML = `<div class="crumbs"><a href="?" data-link>home</a> › search</div>
    <div class="panel"><h2>Results for “${esc(q)}”</h2><p class="hint">Atoms whose name matches, ranked by stake.</p>
    <div id="res" class="list"><div class="loading">Searching…</div></div></div>`;
  const data = await gql(`
    query s($t:String!){
      atoms(limit:40, where:{label:{_ilike:$t}}, order_by:{term:{total_assets:desc_nulls_last}}){
        term_id label emoji type term{ total_assets }
      }
    }`, { t: "%" + q.replace(/[%_]/g, "\\$&") + "%" });
  $("#res").innerHTML = data.atoms.map(a =>
    rowHTML(a.term_id, null, a.emoji || "•", a.label || "(unnamed)", esc(a.type || ""),
      `${trust(a.term && a.term.total_assets)} <small>TRUST</small>`)
  ).join("") || emptyHTML("No atoms match that text. Try a wallet address or an atom id.");
}

/* ---------- term (atom or triple) ---------- */
async function renderTerm(id) {
  app.innerHTML = `<div class="loading">Loading term…</div>`;
  const head = await gql(`
    query t($id:String!){
      terms(where:{id:{_eq:$id}}){ id type }
      atoms(where:{term_id:{_eq:$id}}){ term_id }
      triples(where:{term_id:{_eq:$id}}){ term_id }
    }`, { id });
  if (head.triples.length) return renderTriple(id);
  if (head.atoms.length) return renderAtom(id);
  app.innerHTML = `<div class="crumbs"><a href="?" data-link>home</a> › term</div>
    <div class="empty">No atom or triple with id <span class="mono">${esc(shortHash(id))}</span> was found on mainnet.</div>`;
}

async function renderAtom(id) {
  const data = await gql(`
    query atom($id:String!){
      atoms(where:{term_id:{_eq:$id}}){
        term_id label emoji image type data created_at transaction_hash
        creator{ id label }
        term{ total_assets vaults{ curve_id current_share_price total_shares total_assets position_count market_cap } }
        as_subject_triples(limit:40, order_by:{term:{total_assets:desc}}){
          term_id predicate{label emoji} object{term_id label emoji} term{total_assets} counter_term{total_assets}
        }
        as_object_triples(limit:40, order_by:{term:{total_assets:desc}}){
          term_id predicate{label emoji} subject{term_id label emoji} term{total_assets} counter_term{total_assets}
        }
      }
      signals(limit:250, where:{term_id:{_eq:$id}, curve_id:{_eq:1}}, order_by:{block_number:asc}){
        delta created_at account{ id label }
      }
      positions(limit:100, where:{term_id:{_eq:$id}, curve_id:{_eq:1}}, order_by:{shares:desc}){
        account_id shares created_at
        account{ label type atoms_aggregate{aggregate{count}} signals_aggregate{aggregate{count}} }
      }
    }`, { id });

  const a = data.atoms[0];
  const v = mainVault(a.term) || {};
  const isAccount = /^0x[0-9a-fA-F]{40}$/.test(a.label || "") || a.type === "Account" || a.type === "Caip10";

  app.innerHTML = `
    <div class="crumbs"><a href="?" data-link>home</a> › atom</div>
    <div class="phead">
      ${avatar(a.emoji, a.label, a.term_id, "lg")}
      <div class="htext">
        <h1>${esc(a.label || "(unnamed atom)")}</h1>
        <div class="meta">
          <span class="tag">${esc(a.type || "Atom")}</span>
          <span>created ${esc(dateStr(a.created_at))}</span>
          ${a.creator ? `<span>by <a href="?${qp(a.creator.id)}">${esc(a.creator.label || shortAddr(a.creator.id))}</a></span>` : ""}
          <span class="mono small">${esc(shortHash(a.term_id))}</span>
          ${a.transaction_hash ? `<a class="small" target="_blank" rel="noopener" href="${EXPLORER}/tx/${esc(a.transaction_hash)}">explorer ↗</a>` : ""}
          ${isAccount && /^0x[0-9a-fA-F]{40}$/.test(a.label || "") ? `<a class="small" href="?${qp(a.label)}">view as account →</a>` : ""}
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="k">Total staked</div><div class="v">${trust(v.total_assets)} <small>TRUST</small></div></div>
      <div class="stat"><div class="k">Backers</div><div class="v">${fmt(v.position_count || 0, 0)}</div></div>
      <div class="stat"><div class="k">Share price</div><div class="v">${fmt(toTrust(v.current_share_price), 4)} <small>TRUST</small></div></div>
      <div class="stat"><div class="k">Claims about it</div><div class="v">${fmt(a.as_object_triples.length, 0)}${a.as_object_triples.length >= 40 ? "+" : ""}</div></div>
    </div>

    ${sybilHTML(data.positions)}

    <div class="section">
      <h2>Stake over time</h2>
      <p class="hint">Cumulative shares staked on this atom from every signal (deposits up, redemptions down).</p>
      <div class="chartwrap"><canvas id="chart"></canvas></div>
    </div>

    <div class="grid2" style="margin-top:26px">
      <div class="panel">
        <h2>Top backers</h2>
        <p class="hint">Who holds the most shares. “fresh” = account with no atoms created and few signals.</p>
        <div class="list">${backersHTML(data.positions)}</div>
      </div>
      <div class="panel">
        <h2>Recent signals</h2>
        <p class="hint">Latest deposits and redemptions.</p>
        <div>${recentSignalsHTML(data.signals)}</div>
      </div>
    </div>

    ${claimSection("What this atom claims", a.as_subject_triples, "object")}
    ${claimSection("What others claim about it", a.as_object_triples, "subject")}

    <div class="section">
      <p class="muted small">Compare this atom with another:
        <input id="cmp-in" class="inp" placeholder="atom id or name">
        <button class="chip" id="cmp-btn">Compare →</button></p>
    </div>`;

  drawChart(data.signals);
  const cmpBtn = $("#cmp-btn");
  if (cmpBtn) cmpBtn.addEventListener("click", async () => {
    const other = $("#cmp-in").value.trim();
    if (!other) return;
    const otherId = classify(other) === "term" ? other : await resolveLabelToId(other);
    if (otherId) go2compare(id, otherId);
  });
}

function qp(v) { return "q=" + encodeURIComponent(v); }
function go2compare(a, b) {
  const url = new URL(location.href);
  url.search = "compare=" + encodeURIComponent(a + "," + b);
  history.pushState({}, "", url); route();
}
async function resolveLabelToId(label) {
  const d = await gql(`query r($t:String!){ atoms(limit:1, where:{label:{_ilike:$t}}, order_by:{term:{total_assets:desc_nulls_last}}){ term_id } }`,
    { t: label });
  return d.atoms[0] && d.atoms[0].term_id;
}

function claimSection(title, triples, side) {
  if (!triples || !triples.length) return "";
  const rows = triples.map(t => {
    const other = aref(t[side]);
    const pred = aref(t.predicate);
    const f = toTrust(t.term && t.term.total_assets), ag = toTrust(t.counter_term && t.counter_term.total_assets);
    const tot = f + ag, pf = tot > 0 ? (f / tot * 100) : 100;
    const otherTok = `<span class="tok" data-go="${esc(idOf(other))}">${avatar(other.emoji, other.label, idOf(other), "sm")} ${esc(other.label)}</span>`;
    const left = side === "object"
      ? `<span class="pred muted">${esc(pred.label)}</span> ${otherTok}`
      : `${otherTok} <span class="pred muted">${esc(pred.label)}</span>`;
    return `<div class="row" data-go="${esc(t.term_id)}" style="cursor:pointer">
      <div class="main">
        <div class="claim">${left}</div>
        <div class="bar" style="width:min(320px,70%)"><span style="width:${pf.toFixed(1)}%"></span></div>
        <div class="forag" style="width:min(320px,70%)"><span class="f">for ${fmt(f)}</span><span class="a">against ${fmt(ag)}</span></div>
      </div>
      <div class="val"><b>${fmt(tot)}</b><small>TRUST</small></div>
    </div>`;
  }).join("");
  return `<div class="section"><h2>${esc(title)}</h2><div class="list">${rows}</div></div>`;
}
function idOf(atomLike) { return atomLike && (atomLike.term_id || "") || ""; }

/* backers + sybil heuristic */
function backerFlags(positions) {
  return positions.map(p => {
    const ac = p.account || {};
    const atoms = (ac.atoms_aggregate && ac.atoms_aggregate.aggregate.count) || 0;
    const sigs = (ac.signals_aggregate && ac.signals_aggregate.aggregate.count) || 0;
    const fresh = atoms === 0 && sigs <= 3;
    return { ...p, atoms, sigs, fresh };
  });
}
function backersHTML(positions) {
  const bs = backerFlags(positions);
  if (!bs.length) return emptyHTML("No backers yet.");
  return bs.slice(0, 20).map(b => {
    const ac = b.account || {};
    return `<div class="row" data-go="${esc(b.account_id)}">
      <div class="main">
        <div class="ttl">${esc(ac.label || shortAddr(b.account_id))} ${b.fresh ? `<span class="badge susp">fresh</span>` : ""}</div>
        <div class="sub">${b.atoms} atoms · ${b.sigs} signals · staked ${dateStr(b.created_at)}</div>
      </div>
      <div class="val"><b>${trust(b.shares)}</b><small>shares</small></div>
    </div>`;
  }).join("");
}
function sybilHTML(positions) {
  const bs = backerFlags(positions);
  const n = bs.length;
  if (n < 5) return "";
  const freshCount = bs.filter(b => b.fresh).length;
  const share = freshCount / n;
  // burst: fresh backers that staked on the same day
  const byDay = {};
  bs.filter(b => b.fresh).forEach(b => { const d = dateStr(b.created_at); byDay[d] = (byDay[d] || 0) + 1; });
  const burst = Math.max(0, ...Object.values(byDay));
  let level = "low", ico = ICON.shieldCheck, title = "Low sybil signal";
  if (share >= 0.5 || burst >= 5) { level = "high"; ico = ICON.shieldAlert; title = "Elevated sybil signal"; }
  else if (share >= 0.25 || burst >= 3) { level = "mid"; ico = ICON.shieldWarn; title = "Some sybil signal"; }
  return `<div class="flag ${level}">
    <div class="ico">${ico}</div>
    <div>
      <div class="ft">${title}</div>
      <div class="fd"><b class="pct">${(share * 100).toFixed(0)}%</b> of the top ${n} backers are fresh accounts
      (no atoms created, ≤3 signals)${burst >= 3 ? `, and ${burst} of them staked on a single day` : ""}.
      This is a heuristic signal, not proof — organic newcomers look the same. Open each backer to judge for yourself.</div>
    </div>
  </div>`;
}
function recentSignalsHTML(signals) {
  if (!signals.length) return emptyHTML("No signals yet.");
  return signals.slice().reverse().slice(0, 18).map(s => {
    const d = toTrust(s.delta), up = d >= 0;
    return `<div class="sig">
      <span class="d ${up ? "up" : "dn"}">${up ? "+" : ""}${fmt(d)}</span>
      <span class="who" ${s.account ? `data-go="${esc(s.account.id)}" style="cursor:pointer"` : ""}>${esc((s.account && s.account.label) || "—")}</span>
      <span class="t">${esc(timeAgo(s.created_at))}</span>
    </div>`;
  }).join("");
}

let chart;
function drawChart(signals) {
  try { drawChartUnsafe(signals); }
  catch (e) {
    const el = $("#chart");
    if (el && el.parentElement) el.parentElement.innerHTML = `<div class="empty">Chart unavailable (${esc(e.message)}).</div>`;
  }
}
function drawChartUnsafe(signals) {
  const el = $("#chart"); if (!el) return;
  if (chart) { chart.destroy(); chart = null; }
  if (!signals.length) { el.parentElement.innerHTML = `<div class="empty">No signal history.</div>`; return; }
  let cum = 0;
  const pts = signals.map(s => { cum += toTrust(s.delta); return { x: new Date(s.created_at).getTime(), y: Math.max(0, cum) }; });
  const css = getComputedStyle(document.documentElement);
  chart = new Chart(el, {
    type: "line",
    data: { datasets: [{
      label: "Cumulative shares staked",
      data: pts, parsing: false,
      borderColor: css.getPropertyValue("--acc").trim() || "#6ea8fe",
      backgroundColor: "rgba(110,168,254,.12)", fill: true,
      borderWidth: 2, pointRadius: 0, tension: .18,
    }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { type: "time", time: { unit: daySpan(pts) > 90 ? "month" : "day" },
             ticks: { color: "#67738c", maxTicksLimit: 6 }, grid: { color: "#1b2434" } },
        y: { ticks: { color: "#67738c", callback: v => fmt(v) }, grid: { color: "#1b2434" } },
      },
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => fmt(c.parsed.y) + " shares" } } },
    },
  });
}
function daySpan(pts) {
  if (pts.length < 2) return 0;
  return (pts[pts.length - 1].x - pts[0].x) / 86400000;
}

/* ---------- triple ---------- */
async function renderTriple(id) {
  const data = await gql(`
    query tr($id:String!){
      triples(where:{term_id:{_eq:$id}}){
        term_id created_at transaction_hash
        creator{ id label }
        subject{ term_id label emoji } predicate{ term_id label emoji } object{ term_id label emoji }
        term{ total_assets vaults{ curve_id position_count current_share_price } }
        counter_term{ total_assets vaults{ curve_id position_count current_share_price } }
      }
      positions(limit:100, where:{term_id:{_eq:$id}, curve_id:{_eq:1}}, order_by:{shares:desc}){
        account_id shares created_at
        account{ label type atoms_aggregate{aggregate{count}} signals_aggregate{aggregate{count}} }
      }
      signals(limit:250, where:{term_id:{_eq:$id}, curve_id:{_eq:1}}, order_by:{block_number:asc}){
        delta created_at account{ id label }
      }
    }`, { id });

  const t = data.triples[0];
  t.subject = aref(t.subject); t.predicate = aref(t.predicate); t.object = aref(t.object);
  const f = toTrust(t.term && t.term.total_assets), ag = toTrust(t.counter_term && t.counter_term.total_assets);
  const tot = f + ag, pf = tot > 0 ? f / tot * 100 : 100;
  const fv = (t.term && mainVault(t.term)) || {}, av = (t.counter_term && mainVault(t.counter_term)) || {};

  app.innerHTML = `
    <div class="crumbs"><a href="?" data-link>home</a> › triple</div>
    <div class="phead">
      <div class="htext">
        <h1 style="font-size:22px;line-height:1.5">
          <span class="tok" data-go="${esc(t.subject.term_id)}">${avatar(t.subject.emoji, t.subject.label, t.subject.term_id, "sm")} ${esc(t.subject.label)}</span>
          <span class="muted">${esc(t.predicate.label)}</span>
          <span class="tok" data-go="${esc(t.object.term_id)}">${avatar(t.object.emoji, t.object.label, t.object.term_id, "sm")} ${esc(t.object.label)}</span>
        </h1>
        <div class="meta">
          <span>created ${esc(dateStr(t.created_at))}</span>
          ${t.creator ? `<span>by <a href="?${qp(t.creator.id)}">${esc(t.creator.label || shortAddr(t.creator.id))}</a></span>` : ""}
          ${t.transaction_hash ? `<a class="small" target="_blank" rel="noopener" href="${EXPLORER}/tx/${esc(t.transaction_hash)}">explorer ↗</a>` : ""}
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Consensus</h2>
      <p class="hint">How much TRUST backs this claim vs. the opposite.</p>
      <div class="bar" style="height:16px"><span style="width:${pf.toFixed(1)}%"></span></div>
      <div class="forag" style="font-size:14px;margin-top:8px">
        <span class="f">FOR · ${fmt(f)} TRUST · ${fv.position_count || 0} backers</span>
        <span class="a">AGAINST · ${fmt(ag)} TRUST · ${av.position_count || 0} backers</span>
      </div>
    </div>

    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="k">Total staked</div><div class="v">${fmt(tot)} <small>TRUST</small></div></div>
      <div class="stat"><div class="k">For / Against</div><div class="v">${pf.toFixed(0)}% <small>for</small></div></div>
      <div class="stat"><div class="k">Backers (for)</div><div class="v">${fmt(fv.position_count || 0, 0)}</div></div>
    </div>

    ${sybilHTML(data.positions)}

    <div class="section">
      <h2>Stake over time (FOR side)</h2>
      <div class="chartwrap"><canvas id="chart"></canvas></div>
    </div>

    <div class="grid2" style="margin-top:26px">
      <div class="panel"><h2>Top backers (FOR)</h2><p class="hint">Holders of the FOR vault.</p><div class="list">${backersHTML(data.positions)}</div></div>
      <div class="panel"><h2>Recent signals (FOR)</h2><div>${recentSignalsHTML(data.signals)}</div></div>
    </div>`;
  drawChart(data.signals);
}

/* ---------- account ---------- */
async function renderAccount(addr) {
  const data = await gql(`
    query acct($a:String!){
      accounts(where:{id:{_ilike:$a}}){
        id label image type atom_id
        atom{ term_id label emoji term{ total_assets vaults{curve_id position_count current_share_price total_assets} } }
        atoms_aggregate{aggregate{count}}
        signals_aggregate{aggregate{count}}
        positions_aggregate{aggregate{count}}
        positions(limit:60, order_by:{shares:desc}){
          term_id shares created_at
          term{ atom{term_id label emoji} triple{term_id subject{label emoji} predicate{label} object{label emoji}} }
        }
        atoms(limit:12, order_by:{term:{total_assets:desc_nulls_last}}){ term_id label emoji type term{total_assets} }
      }
    }`, { a: addr });

  const ac = data.accounts[0];
  if (!ac) {
    app.innerHTML = `<div class="crumbs"><a href="?" data-link>home</a> › account</div>
      <div class="empty">No Intuition account found for <span class="mono">${esc(shortAddr(addr))}</span>.
      <br><a class="small" target="_blank" rel="noopener" href="${EXPLORER}/address/${esc(addr)}">See it on the explorer ↗</a></div>`;
    return;
  }
  const own = ac.atom ? mainVault(ac.atom.term) : null;

  app.innerHTML = `
    <div class="crumbs"><a href="?" data-link>home</a> › account</div>
    <div class="phead">
      ${ac.atom && ac.atom.emoji ? avatar(ac.atom.emoji, ac.label || ac.id, ac.id, "lg") : iconTile(ICON.person, ac.id, "lg")}
      <div class="htext">
        <h1>${esc(ac.label || shortAddr(ac.id))}</h1>
        <div class="meta">
          <span class="tag">${esc(ac.type || "account")}</span>
          <span class="mono small">${esc(ac.id)}</span>
          <a class="small" target="_blank" rel="noopener" href="${EXPLORER}/address/${esc(ac.id)}">explorer ↗</a>
          ${ac.atom ? `<a class="small" href="?${qp(ac.atom.term_id)}">its atom →</a>` : ""}
        </div>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="k">Reputation received</div><div class="v">${own ? trust(own.total_assets) : "—"} <small>TRUST</small></div></div>
      <div class="stat"><div class="k">Atoms created</div><div class="v">${fmt(ac.atoms_aggregate.aggregate.count, 0)}</div></div>
      <div class="stat"><div class="k">Signals made</div><div class="v">${fmt(ac.signals_aggregate.aggregate.count, 0)}</div></div>
      <div class="stat"><div class="k">Positions held</div><div class="v">${fmt(ac.positions_aggregate.aggregate.count, 0)}</div></div>
    </div>

    ${own ? `<div class="flag ${ownFlag(ac).lvl}"><div class="ico">${ownFlag(ac).ico}</div><div>
        <div class="ft">${ownFlag(ac).title}</div>
        <div class="fd">${ownFlag(ac).text}</div></div></div>` : ""}

    <div class="section">
      <h2>What this account backs</h2>
      <p class="hint">The terms it has staked on — its outgoing trust. Click any to inspect.</p>
      <div class="list">${positionsHTML(ac.positions)}</div>
    </div>

    ${ac.atoms.length ? `<div class="section"><h2>Atoms it created</h2>
      <div class="list">${ac.atoms.map(a => rowHTML(a.term_id, null, a.emoji || "•", a.label || "(unnamed)", esc(a.type || ""), `${trust(a.term && a.term.total_assets)} <small>TRUST</small>`)).join("")}</div></div>` : ""}`;
}

function ownFlag(ac) {
  // A cheap "is this account self-made or community-backed?" read on its own atom.
  const own = mainVault(ac.atom.term) || {};
  const backers = own.position_count || 0;
  const staked = toTrust(own.total_assets);
  if (backers <= 1) return { lvl: "mid", ico: ICON.shieldWarn, title: "Reputation is self-made",
    text: `Its atom has ${backers} backer${backers === 1 ? "" : "s"} and ${fmt(staked)} TRUST staked — little independent endorsement yet.` };
  if (backers >= 10) return { lvl: "low", ico: ICON.shieldCheck, title: "Community-backed",
    text: `${backers} different accounts have staked ${fmt(staked)} TRUST on this account's atom.` };
  return { lvl: "mid", ico: ICON.shieldWarn, title: "Lightly endorsed",
    text: `${backers} accounts have staked ${fmt(staked)} TRUST on this account's atom.` };
}

function positionsHTML(positions) {
  if (!positions.length) return emptyHTML("This account hasn't staked on anything yet.");
  return positions.map(p => {
    const term = p.term || {};
    if (term.triple) {
      const tr = term.triple;
      const s = aref(tr.subject), pr = aref(tr.predicate), o = aref(tr.object);
      return `<div class="row" data-go="${esc(tr.term_id || p.term_id)}">
        <div class="main"><div class="ttl">${avatar(s.emoji, s.label, s.label, "sm")} ${esc(s.label)} <span class="muted">${esc(pr.label)}</span> ${avatar(o.emoji, o.label, o.label, "sm")} ${esc(o.label)}</div>
        <div class="sub">claim · staked ${dateStr(p.created_at)}</div></div>
        <div class="val"><b>${trust(p.shares)}</b><small>shares</small></div></div>`;
    }
    const at = term.atom || {};
    return rowHTML(at.term_id || p.term_id, null, at.emoji || "•", at.label || "(unnamed)",
      `atom · staked ${dateStr(p.created_at)}`, `${trust(p.shares)} <small>shares</small>`);
  }).join("");
}

/* ---------- compare ---------- */
async function renderCompare(ids) {
  app.innerHTML = `<div class="loading">Loading comparison…</div>`;
  const cols = await Promise.all(ids.map(id => gql(`
    query c($id:String!){
      atoms(where:{term_id:{_eq:$id}}){ term_id label emoji type created_at
        creator{label}
        term{ total_assets vaults{curve_id current_share_price total_shares position_count total_assets} }
        as_subject_triples_aggregate{aggregate{count}}
        as_object_triples_aggregate{aggregate{count}}
      }
      positions(limit:100, where:{term_id:{_eq:$id}, curve_id:{_eq:1}}){
        account{ atoms_aggregate{aggregate{count}} signals_aggregate{aggregate{count}} }
      }
    }`, { id }).then(d => ({ a: d.atoms[0], positions: d.positions })).catch(() => null)));

  app.innerHTML = `<div class="crumbs"><a href="?" data-link>home</a> › compare</div>
    <div class="cmp">${cols.map(c => compareCard(c)).join("")}</div>`;
}
function compareCard(c) {
  if (!c || !c.a) return `<div class="panel"><div class="empty">Atom not found.</div></div>`;
  const a = c.a, v = mainVault(a.term) || {};
  const bs = backerFlags(c.positions);
  const fresh = bs.length ? Math.round(bs.filter(b => b.fresh).length / bs.length * 100) : 0;
  return `<div class="panel">
    <div class="phead" style="margin-bottom:10px">${avatar(a.emoji, a.label, a.term_id, "lg")}
      <div class="htext"><h1 style="font-size:20px">${esc(a.label || "(unnamed)")}</h1>
      <div class="meta"><span class="tag">${esc(a.type || "")}</span><a class="small" href="?${qp(a.term_id)}">open →</a></div></div></div>
    <table class="kv">
      <tr><td>Total staked</td><td>${trust(v.total_assets)} TRUST</td></tr>
      <tr><td>Backers</td><td>${fmt(v.position_count || 0, 0)}</td></tr>
      <tr><td>Share price</td><td>${fmt(toTrust(v.current_share_price), 4)} TRUST</td></tr>
      <tr><td>Claims by it</td><td>${a.as_subject_triples_aggregate.aggregate.count}</td></tr>
      <tr><td>Claims about it</td><td>${a.as_object_triples_aggregate.aggregate.count}</td></tr>
      <tr><td>Fresh backers</td><td>${fresh}%</td></tr>
      <tr><td>Created</td><td>${esc(dateStr(a.created_at))}</td></tr>
    </table>
  </div>`;
}

/* ---------- boot ---------- */
const repoLink = $("#repo-link");
if (REPO_URL) repoLink.href = REPO_URL; else repoLink.remove();
route();
