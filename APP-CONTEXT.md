# Debate Market – LLM Context & Design Contract

This document is the **authoritative context** for any LLM, agent, or developer working on Debate Market.
It must be read **before writing or modifying any code**.

If code contradicts this document, **this document wins**.

---

# 0. Product Summary (100-word intent)

Debate Market looks like a familiar social network, but is built for real debates — structured, weighted, and traceable.

On the surface: a lively feed of opinions, agreements, disagreements, and explanations.
Underneath: every contribution can become (with user approval) semantic triples anchored on Intuition, enriched with signals, and reusable across discussions.

Debates no longer reset: they accumulate into a shared reasoning graph.
Web2 users start simple (feed + reactions), and progressively learn that "energy spent" maps to on-chain actions and identity.
The product is **Trust-first**: we surface conviction and reasoning quality before any financial framing.

---

# 1. What Debate Market Is (and is not)

Debate Market is a **debate social app** built on top of the **Intuition protocol**.

## 1.1 Surface Layer (Web2-familiar UX)
- Public reading.
- A home feed that feels like Twitter/Facebook/Reddit (posts, reactions, replies).
- A debate page with binary stance structure (Supports / Refutes).
- Users can:
  - react (support / oppose),
  - reply,
  - create new posts.

## 1.2 Knowledge Layer (Intuition)
- Validated contributions are transformed into **semantic triples** (and nested triples when needed).
- Triples are **published or reused** on Intuition.
- Users can attach **signal** (support/oppose deposits) to triples.
- This creates a reusable reasoning graph across debates.

Debate Market is **not** a standalone knowledge graph.
It is a **human/social layer** on top of Intuition, with a strong UX focus.

---

# 2. User Types & Progression

## 2.1 Interactors (many users)
- Primarily read + react (support/oppose), occasionally reply.
- Should not need to understand Intuition.
- Gradually discover "energy" and "under-the-hood" mechanics via tooltips and progressive disclosure.

## 2.2 Creators (some users)
- Write posts.
- Validate extracted triples (edit/add/reject).
- Publish on-chain via wallet actions.

## 2.3 Web3 power users (later)
- Explicit wallet identity.
- Deeper inspector usage: vaults, bonding curves, shares/price.
- Advanced actions (custom deposit amounts, strategy, dashboards).

---

# 3. Core Principles (Non-Negotiable)

## 3.1 Intuition is the Source of Truth
Atoms, Triples, Signals, Vault balances are canonical on Intuition.

Local DB must store:
- references (e.g. intuition termIds),
- workflow state,
- debate navigation (posts + edges),
- UX-facing metadata.

Local DB must NOT:
- recreate the knowledge graph,
- duplicate canonical atoms/triples as source-of-truth,
- store final economic outcomes off-chain.

## 3.2 Trust-first, not finance-first
Even if Trust has monetary value, the UX must emphasize:
- "I support / I oppose"
- reasoning quality and conviction
before financial framing.

## 3.3 Separation of Concerns
Four layers:
1) Social / Debate UX (feed, posts, edges)
2) Workflow (submission, extraction, proposals, validation)
3) On-chain bridge (publish, deposit, tx tracking)
4) Web2 bridge (energy, tooltips, progressive disclosure)

---

# 4. Mental Model

## 4.1 Post
A Post:
- human-readable text (body),
- lives in DB/UI,
- provides context,
- has a **stance** (SUPPORTS or REFUTES) when replying to another post,
- references an **originSubmissionId** linking back to the workflow that created it.

## 4.2 Triple (Claim)
A Triple:
- structured semantic assertion (Subject–Predicate–Object),
- lives on Intuition,
- reusable across many posts.

Posts provide context. Triples provide canonical graph units.

## 4.3 DraftPost
A DraftPost is a client-side model representing a post-in-progress before publishing.
It contains:
- a list of proposal IDs (candidate triples),
- one designated **mainProposalId** (★ primary claim),
- body text (auto-composed from S+P+O of the primary claim, editable by user),
- a stance (inherited from parent or chosen in split mode).

DraftPosts exist only in React state — they are never persisted to the database.

---

# 5. UI Model

## 5.0 App Shell & Navigation
- **Desktop**: collapsible left sidebar (Logo, Feed, Explore, Trending) + top bar (title, search, wallet) + main content.
- **Mobile**: top bar + main content + bottom nav (same 3 tabs as sidebar).
- Network badge in sidebar shows "Intuition testnet".

## 5.1 Home (Social Feed)
Two-column layout on desktop (feed + sidebar), single column on mobile.

**Left column:**
- **Trending scroll** — horizontal carousel of 4 root posts with most replies (260–280px cards, snap-to-start). Each card: theme badge, body (3-line clamp), reply count.
- **Feed list** — 20 most recent root posts (`createdAt desc`).

**Feed post card (FeedThread):**
- Avatar (40px) + author name + relative timestamp.
- Post body (4-line clamp).
- Reply count (MessageSquare icon) + theme badge + protocol badge (⛓ if linked to triples).
- Up to 2 reply previews nested below (28px avatar, name, colored stance label, body 2-line clamp, stance-colored left border).
- "Show all X replies" link if >2 replies.

**Right sidebar (desktop only, sticky):**
- **Hot Topics** — top 5 root posts by reply count (ranked 1–5, body 2-line clamp, reply count).
- **Themes** — all themes as badge links to `/themes/[slug]`, flex-wrap.

## 5.2 Debate Page (`/posts/[id]`)
- **AncestorBreadcrumbs** — parent post chain (up to 5 levels).
- **FocusCard** — main post: theme badge, body, stats (total arguments, support %, active stances), Inspector button, ConnectedConfidenceSlider (if parent has MAIN triple).
- **MiniTreeSection** — collapsible tree visualization (breadcrumbs → focus → replies).
- **RepliesGrid** — two-column layout:
  - "Supporting claims" column (green accent).
  - "Refuting claims" column (red accent).
  - Each column shows reply cards (body, nested reply count) + **Add (+)** button to compose in that stance.
- **Composer** — inline reply composer (hidden until opened).
- **Protocol Inspector** — right panel (desktop) / bottom sheet (mobile) showing all triples linked to the post.

## 5.3 Theme Page (`/themes/[slug]`)
- Header: theme name + "New debate" button.
- Search bar (filters debates in real-time).
- Posts grid: body, reply count, date, protocol badge, "Open →".
- Inline composer + full extraction flow dialog.

## 5.4 Inspector (Intuition layer)
- Shows ALL triples linked to a post.
- For each triple: Intuition metadata + support/oppose actions.
- Displays the primary claim with ★ badge.

## 5.4 Extraction Flow (Composer → FlowDialog)

### Composer
- Text input + theme selection + submit.
- Root posts show "New claim" title; replies show "Reply as [stance]".

### FlowDialog (Radix Dialog modal, 780px, bottom drawer on mobile)

**Step 1 — Review claims**
- Original text displayed at top.
- Each draft post rendered as a **DraftCard** (stance-colored left border).
- Inside each card: interactive ProposalList with 3 inputs per claim (S/P/O, no visible labels), role assignment (★ primary / supporting), reuse suggestions, nested context preview (read-only badges).
- **Split mode**: when extraction detects 2+ independent ideas, user can split into multiple draft posts. Each draft gets its own tab, body, stance selector, and primary claim.
- **Merge**: user can merge split drafts back into one post.
- "Add claim" button to manually add triples.

**Step 2 — Review context**
- Read-only recap of draft cards (body + claims summary).
- Interactive nested edge list: user validates or rejects detected context (modifier, relation, conditional, meta/attribution edges).

**Step 3 — Preview & publish**
- Transaction plan: Terms to create, Claims to create, existing claims to support.
- Cost breakdown (deposits + network fees). Cost hint: "Trust is refundable when others support your claims."
- Publish button triggers multi-post publish (N DraftPosts → N Posts in one call).

### Multi-post publish
- API endpoint `/api/publish` accepts a `posts[]` array.
- Each post in the array contains its own triples, nested triples, body, and stance.
- Server creates all posts, atoms, triples, and links in a single transaction.
- Idempotency via `idempotencyKey` + localStorage recovery (`dm_publish_intent_*`).

---

# 6. Linking Posts to Intuition Triples

## 6.1 Post–Triple Links (Roles)
A Post:
- must have **exactly one Primary claim** (★ anchor),
- may have multiple Supporting claims.

The Primary claim gets the stance link in replies.
The DB enforces a unique MAIN index per post (1 primary per post).

## 6.2 Only Validated Triples May Be Linked
PostTripleLink must reference only:
- published or reused Intuition triples (confirmed termIds).

No draft/unvalidated triples in PostTripleLink.

---

# 7. Workflow: Submissions & Proposals

## 7.1 Submission (in-progress work)
A Submission represents a "work session" before the final Post exists.
It contains:
- raw input text,
- theme,
- optional parentPostId (if replying),
- optional stance (SUPPORTS | REFUTES, only if replying),
- workflow status.

Important semantic rule:
- If parentPostId is null (root post), stance MUST be null.

Submissions are private and can be abandoned/retried.

## 7.2 Proposal (candidate triples)
A Proposal is a candidate triple (or nested triple) generated by AI or manually added.
Users can:
- edit,
- add,
- reject,
- approve as Primary or Supporting,
- choose reuse vs create where applicable.

User is always final authority. No automatic publishing.

---

# 8. Non-duplication Rule (Critical)

Before creating atoms/triples:
1) Search existing atoms and triples.
2) If equivalent exists → reuse + deposit (optional/required rules).
3) If not, create new (with user consent).

Search must include:
- exact matches,
- semantic / fuzzy search (to avoid near-duplicates).

A read-only search endpoint may be used (proxy), but must be protected against abuse.

---

# 9. On-chain Operations & Reliability

Publishing is asynchronous and failure-prone.
The app must support:
- retries,
- crash recovery,
- idempotent server confirmation.

Local records exist only for:
- UX feedback,
- auditability,
- retry logic
—not as canonical knowledge.

---

# 10. Support/Oppose semantics

Support/Oppose must map to Intuition's canonical signaling mechanism.
No "counter-triple hacks" if Intuition provides direct support/oppose deposits.

---

# 11. Energy System (Web2 bridge, future)

Energy is a Web2 abstraction that gradually teaches:
- actions have a cost,
- cost maps to on-chain behavior,
without forcing wallet comprehension upfront.

Energy maps 1:1 with Trust (⚡ energy = tTRUST on testnet, TRUST on mainnet).
Trust-first framing must remain primary.

Status: **planned, not yet implemented**. Current UX uses Trust directly.

---

# 12. Extraction Pipeline

## 12.1 Architecture
```
Input text
  │
  ▼
[1] Selection Agent        — keep/drop + normalize claims
  │
  ▼
[2] Decomposition Agent    — split multi-claim sentences (NEVER on prepositions)
  │                          Guard-rail: skipped if no discourse markers detected
  │
  ▼ (per claim)
[3] Graph Extraction Agent — core triple { s, p, o } + modifiers [{ prep, value }]
  │
  ▼ (if ≥2 triples from same sentence)
[4] Relation Agent         — inter-triple relations (but, because, if, and...)
  │                          Guard-rail: skipped if no relation markers detected
  │
  ▼
[5] Nested Triple Assembly — modifier sub-triples, relation sub-triples, conditionals, meta
```

## 12.2 Guard-rails (LLM optimization)
- `DECOMPOSE_MARKERS` regex: discourse markers (but, however, although, because, therefore, if, unless...) + `, which`
- `RELATION_MARKERS` regex: relation markers (but, however, because, therefore, if, unless, and, or...) + modal verbs (`could/may/might/will lead to`)
- If no markers detected, the corresponding agent call is skipped entirely (saves LLM calls).

## 12.3 Post-LLM processing (in code)
After the Graph Extraction Agent returns `core + modifiers`:
- Subject decomposition: prepositional phrases in subject → sub-triples
- Modifier value decomposition: "children under 16" → sub-triple `[children | under | 16]`
- Comparatives stay in predicate: "is better than" is NOT split
- Relation predicates are whitelisted (but, because, however, if, and, or, etc.)

## 12.4 Nested edge types
- `modifier` — prepositional modifier (for, by, in, since...)
- `relation` — inter-triple relation (but, because, if...)
- `conditional` — if/unless conditions
- `meta` — attribution/source

## 12.5 Split detection
When extraction produces 2+ independent claims, the UI offers to split them into separate draft posts. Each draft gets:
- its own primary claim (auto-assigned),
- a body composed from S+P+O,
- a stance selector (in reply mode).

---

# 13. UI Vocabulary System

## 13.1 Centralized labels
All UI strings that differ between web2 and web3 modes live in `apps/web/src/lib/vocabulary.ts` — export `labels`.
Pure UI copy (button text, status messages, error strings) stays inline in components.
No visible labels on S/P/O input fields (aria-label only for accessibility).

## 13.2 Web2-friendly defaults
- Roles: "Primary" / "Supporting" (not MAIN/SUPPORTING)
- Actions: "Set as primary" / "Remove" / "+ Add claim"
- Metrics: "Staked" / "Participants" (not MC/Holders)
- Steps: "Terms" / "Claims" (not Atoms/Triples)
- Navigation: "Next →" / "Next draft →" (not "Review transaction →")
- Cost: "Trust is refundable when others support your claims. Network fees are non-refundable."
- Nested badges: "condition" / "attribution" / "link" / "modifier"

---

# 14. Development Rules for Agents

Before adding/modifying code:
1) Is this canonical Intuition knowledge? → store reference only.
2) Is this draft/workflow? → Submission/Proposal.
3) Is this debate navigation? → Post (parentPostId for replies).
4) Is this Web2 bridge? → Energy/tooltips.
5) Does this duplicate Intuition? → stop and reconsider.

If unsure: do not guess. Ask or search in codebase.

---

# 15. Roadmap (near-term)

## Completed
- Web2 vocabulary translation
- DraftPost model + split/merge flow
- Body extraction (deterministic from S+P+O)
- Nested triples publishable (SUPPORTING role)
- Multi-post publish (N DraftPosts → N Posts)
- Guard-rail optimizations in extraction pipeline

## Next
- **Atom UX** — improved atom suggestion/creation experience, explore drawer for browsing existing atoms
- **Vocabulary audit** — ensure all web2/web3-sensitive strings are in vocabulary.ts

---

# 16. Guiding Philosophy

Debate Market is about:
- accumulating reasoning,
- reuse over duplication,
- structure over noise,
- explicit user consent,
- Trust as a primary signal.
