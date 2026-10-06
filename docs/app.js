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

$("#search").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#q").value.trim();
  if (v) go(v);
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
  try {
    if (compare) return await renderCompare(compare.split(",").slice(0, 2));
    if (!q) return await renderHome();
    const kind = classify(q);
    if (kind === "address") return await renderAccount(q);
    if (kind === "term") return await renderTerm(q);
    return await renderSearch(q);
  } catch (err) {
    app.innerHTML = `<div class="err">Could not load data from the Intuition indexer.<br><span class="small mono">${esc(err.message)}</span></div>`;
  }
}

/* ---------- home ---------- */
async function renderHome() {
  app.innerHTML = `
    <section class="hero">
      <h1>Read the trust behind any Intuition atom — before you trust it.</h1>
      <p>Paste a wallet, an atom, a triple, or just a name. AgentWitness reads the live Intuition
      knowledge graph and shows you <b>who staked for or against it</b>, the full signal history, the
      top backers, and a sybil heuristic that flags stake coming from fresh, low-activity accounts.
      100% read-only — nothing to connect, nothing to sign.</p>
      <div class="chips">
        ${EXAMPLES.map(e => `<button class="chip" data-go="${esc(e.q)}">${esc(e.q)} <small>${esc(e.note)}</small></button>`).join("")}
      </div>
    </section>
    <div class="grid2">
      <div class="panel"><h2>Most-staked atoms</h2><p class="hint">Where the most TRUST is at stake right now.</p><div id="top-atoms" class="list"><div class="loading">Loading…</div></div></div>
      <div class="panel"><h2>Biggest “trusts” claims</h2><p class="hint">Triples using the <b>trusts</b> predicate, ranked by backing.</p><div id="top-trust" class="list"><div class="loading">Loading…</div></div></div>
    </div>`;

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
    return `<div class="row" data-go="${esc(t.term_id)}">
      <span class="rank">${i + 1}</span>
      <div class="main">
        <div class="ttl">${esc(t.subject.emoji || "")} ${esc(t.subject.label)} <span class="muted">trusts</span> ${esc(t.object.emoji || "")} ${esc(t.object.label)}</div>
        <div class="sub">for ${fmt(f)} · against ${fmt(ag)} TRUST</div>
      </div>
      <div class="val"><b>${fmt(f + ag)}</b><small>TRUST</small></div>
    </div>`;
  }).join("") || emptyHTML("No “trusts” claims yet.");
}

function rowHTML(goId, rank, emoji, title, sub, valHTML) {
  return `<div class="row" data-go="${esc(goId)}">
    ${rank != null ? `<span class="rank">${rank}</span>` : ""}
    <span class="emoji">${esc(emoji)}</span>
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
      <div class="big-emoji">${esc(a.emoji || "•")}</div>
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
        <input id="cmp-in" placeholder="atom id or name" style="background:var(--panel2);border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:6px 10px">
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
    const other = t[side] || {};
    const f = toTrust(t.term && t.term.total_assets), ag = toTrust(t.counter_term && t.counter_term.total_assets);
    const tot = f + ag, pf = tot > 0 ? (f / tot * 100) : 100;
    const left = side === "object"
      ? `<span class="pred muted">${esc(t.predicate.label)}</span> <span class="tok" data-go="${esc(idOf(other))}">${esc(other.emoji || "")} ${esc(other.label)}</span>`
      : `<span class="tok" data-go="${esc(idOf(other))}">${esc(other.emoji || "")} ${esc(other.label)}</span> <span class="pred muted">${esc(t.predicate.label)}</span>`;
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
  let level = "low", ico = "✅", title = "Low sybil signal";
  if (share >= 0.5 || burst >= 5) { level = "high"; ico = "⚠️"; title = "Elevated sybil signal"; }
  else if (share >= 0.25 || burst >= 3) { level = "mid"; ico = "🟡"; title = "Some sybil signal"; }
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
  const f = toTrust(t.term && t.term.total_assets), ag = toTrust(t.counter_term && t.counter_term.total_assets);
  const tot = f + ag, pf = tot > 0 ? f / tot * 100 : 100;
  const fv = (t.term && mainVault(t.term)) || {}, av = (t.counter_term && mainVault(t.counter_term)) || {};

  app.innerHTML = `
    <div class="crumbs"><a href="?" data-link>home</a> › triple</div>
    <div class="phead">
      <div class="htext">
        <h1 style="font-size:22px;line-height:1.35">
          <span class="tok" data-go="${esc(t.subject.term_id)}">${esc(t.subject.emoji || "")} ${esc(t.subject.label)}</span>
          <span class="muted">${esc(t.predicate.label)}</span>
          <span class="tok" data-go="${esc(t.object.term_id)}">${esc(t.object.emoji || "")} ${esc(t.object.label)}</span>
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
      <div class="big-emoji">${esc((ac.atom && ac.atom.emoji) || "👤")}</div>
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
  if (backers <= 1) return { lvl: "mid", ico: "🟡", title: "Reputation is self-made",
    text: `Its atom has ${backers} backer${backers === 1 ? "" : "s"} and ${fmt(staked)} TRUST staked — little independent endorsement yet.` };
  if (backers >= 10) return { lvl: "low", ico: "✅", title: "Community-backed",
    text: `${backers} different accounts have staked ${fmt(staked)} TRUST on this account's atom.` };
  return { lvl: "mid", ico: "🟡", title: "Lightly endorsed",
    text: `${backers} accounts have staked ${fmt(staked)} TRUST on this account's atom.` };
}

function positionsHTML(positions) {
  if (!positions.length) return emptyHTML("This account hasn't staked on anything yet.");
  return positions.map(p => {
    const term = p.term || {};
    if (term.triple) {
      const tr = term.triple;
      return `<div class="row" data-go="${esc(tr.term_id || p.term_id)}">
        <div class="main"><div class="ttl">${esc(tr.subject.emoji || "")} ${esc(tr.subject.label)} <span class="muted">${esc(tr.predicate.label)}</span> ${esc(tr.object.emoji || "")} ${esc(tr.object.label)}</div>
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
    <div class="phead" style="margin-bottom:10px"><div class="big-emoji">${esc(a.emoji || "•")}</div>
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
