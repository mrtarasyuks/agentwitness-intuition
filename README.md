# AgentWitness — a read-only trust explorer for Intuition

**Paste a wallet, an atom, a triple, or a name — and read the trust behind it before you trust it.**

AgentWitness reads the live [Intuition](https://intuition.systems/) knowledge graph and shows, for any
atom / triple / account:

- **how much TRUST is staked** on it, by how many backers, at what share price;
- for a claim (triple) — the **FOR vs AGAINST** split, i.e. the on-chain consensus;
- the full **signal history** as a cumulative-stake chart, plus the latest deposits and redemptions;
- the **top backers**, each annotated with how much on-chain activity they have;
- a **sybil heuristic** that flags when a lot of the backing comes from fresh, low-activity accounts;
- for a wallet — its **reputation received** and everything it **backs** (its outgoing trust).

It is 100% **read-only**. There is **no wallet connect, no signing, no transactions, no backend and no API
keys**. Everything is computed in your browser from Intuition's public GraphQL indexer, so anyone can use it
and nobody has to trust us with anything.

## Who it's for

Builders of AI agents, people staking on reputation in Intuition, and reviewers who want to check an account
or a claim before acting on it. Intuition turns "who is trustworthy" into staked, on-chain data — but the
portal shows you *a* number, not *why*. AgentWitness shows you the who, the when, and the how-much behind it.

## The flow

1. Type an **address** (`0x…`, 40 hex chars), an **atom / triple id** (`0x…`, 64 hex chars), or just a
   **name** into the search box.
2. A name runs a text search over atom labels, ranked by stake.
3. An id opens the **atom** or **triple** profile; an address opens the **account** profile.
4. From any profile you can click through to backers, to the claims around an atom, or compare two atoms side
   by side.
5. Every screen is a shareable link (`?q=…`), so you can send someone straight to a profile.

## Data sources

- **Indexer (all data):** `https://mainnet.intuition.sh/v1/graphql` — Intuition's public Hasura GraphQL
  indexer for mainnet (chain id 1155). Queried directly from the browser; CORS is open and no key is needed.
- **Explorer links:** `https://explorer.intuition.systems` (Blockscout) — used for wallet and transaction
  links so you can verify anything on-chain.

The primitives read: `atoms`, `triples` (subject · predicate · object), `signals` (stake events),
`positions` (who holds shares in which vault) and `vaults` (bonding-curve state: `total_assets`,
`total_shares`, `current_share_price`, `position_count`). Numbers are reported from the base curve
(`curve_id = 1`). All TRUST / share amounts are 18-decimal fixed point and are converted for display; large
values use `K` / `M` suffixes.

## The sybil heuristic — read this

The sybil flag is a **heuristic, not proof**. For the top backers of a term it counts how many are *fresh*
accounts — defined here as **accounts that have created no atoms and made ≤ 3 signals** — and whether a
cluster of them staked on the same day. A high share, or a same-day burst, is shown as an elevated signal so
you look closer. **Organic newcomers look exactly the same**, so always open the individual backers and judge
for yourself. AgentWitness never labels anyone a sybil; it only points at where to look.

## Limits (honest)

- It reads **on-chain reputation only**. It cannot see off-chain reputation, identity, or intent.
- The sybil heuristic is deliberately simple and will have both false positives and false negatives.
- Rankings and backer lists are capped (250 signals / 100 positions per term, the indexer's page size) and
  are not full re-aggregations of history.
- Intuition mainnet launched in November 2025, so some atoms have thin history. Where a source returns
  nothing, the UI says so rather than inventing numbers.
- Account `reputation received` is the TRUST staked on the account's **own atom** (if it has one). An account
  with no atom shows `—`.

## Run locally

It's a static site — no build step.

```sh
cd docs
python -m http.server 8000
# open http://localhost:8000/?q=Sofia
```

Or just open `docs/index.html` in a browser. Deployment is GitHub Pages serving the `docs/` folder.

## What's real, what's not

Everything shown is **live data** from the Intuition indexer at load time — there is no mock or sample data.
The app was built by one person with AI assistance. There are no accounts, no tracking, no analytics, and
nothing is sent anywhere except the read-only GraphQL queries to Intuition's public endpoint.

## Tech

Plain HTML/CSS/JS, [Chart.js](https://www.chartjs.org/) (via CDN) for the timeline. No framework, no bundler.
