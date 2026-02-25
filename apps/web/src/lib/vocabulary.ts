/**
 * Web2 label layer.
 *
 * Only labels whose value would change between web2 and web3 modes live here.
 * Pure UI copy (button text, status messages, error strings) is inlined in components.
 */

export const labels = {
  // ── Roles & actions ──────────────────────────────────────────────────
  roleMain: "Primary",
  roleSupporting: "Supporting",
  selectMain: "Set as primary",
  addTriple: "+ Add claim",

  // ── Reuse section ────────────────────────────────────────────────────
  reuseSuggestionsTitle: "Similar existing claims",
  reuseExactMatch: "Identical claim",
  reuseFor: "For",
  reuseAgainst: "Against",
  reuseSearching: "Searching for similar claims…",
  reuseReusing: "Reusing claim",

  // ── Nested edge badges ───────────────────────────────────────────────
  nestedBadgeCondition: "condition",
  nestedBadgeMeta: "attribution",
  nestedBadgeRelation: "link",
  nestedBadgeModifier: "modifier",

  // ── Metrics ──────────────────────────────────────────────────────────
  metricParticipants: "Participants",
  metricStaked: "Staked",

  // ── Publish plan ─────────────────────────────────────────────────────
  stepAtoms: "Terms",
  stepTriples: "Claims",
  gasFees: "Network fees",
  mainTripleOnchain: "This claim already exists",
  emptyPlan: "Add at least one claim to preview.",
  depositsConfirmed: "Support confirmed",
  costHint: "Trust is refundable when others support your claims. Network fees are non-refundable.",

  // ── Dialog titles ────────────────────────────────────────────────────
  dialogSplitDecision: "Split decision",
  dialogStepClaimsReview: "Review claims",
  dialogStepContext: "Review context",
  dialogStepPreview: "Preview & publish",

  // ── Composer ─────────────────────────────────────────────────────────
  composerTitleRoot: "New claim",
  composerHint: "Your text will be broken down into structured claims you can review and publish.",

  // ── Split decision ──────────────────────────────────────────────────
  splitDecisionTitle: "Your post seems to contain {count} ideas",
  splitDecisionBody: "Split into separate posts to facilitate debate",
  splitDecisionCta: "Split into {count} posts",
  splitDecisionDismiss: "No, thanks",

  // ── Review step (Step 1) ───────────────────────────────────────────
  reviewIntroBody: "Each claim is shown inside its post card. Use ★ to set the primary claim, ✕ to remove.",
  originalTextLabel: "Your original text",
  editBodyButton: "Edit",
  doneEditingButton: "Done",
  setMainWarning: "Set one claim as primary before continuing.",

  // ── Context step (Step 2) ──────────────────────────────────────────
  contextIntroBody: "The assistant detected context links between your claims. Remove items you don't want published.",

  // ── Preview step (Step 3) ──────────────────────────────────────────
  previewIntroBody: "Review the cost below — trust is refundable when others support your claims.",

  // ── Submit step ────────────────────────────────────────────────────
  protocolDetailsLabel: "Protocol details",
  successBody: "Your claims are now live.",
  successBodySingle: "Your claim is now live.",

  // ── Stances ──────────────────────────────────────────────────────────
  stanceSupports: "Supports",
  stanceRefutes: "Refutes",

  // ── Domain error messages ────────────────────────────────────────────
  errorAtomCreation: "Failed to create terms.",
  errorTripleCreation: "Failed to create claims.",
  errorStanceCreation: "Unable to link your reply.",
  errorResolution: "Unable to verify claims.",
  errorDepositFailed: "Support failed.",
  preflightNoApproved: "Add at least one claim before publishing.",
  preflightNoMain: "Set at least one claim as primary before publishing.",

  // ── Split / merge ────────────────────────────────────────────────────
  splitAction: "Split into separate posts",
  mergeAll: "Merge into one post",
  nextDraft: "Next draft",
  draftHeaderPrefix: "Post",
  emptyDraftHint: "No claims — this post will be ignored.",

  // ── Body ─────────────────────────────────────────────────────────────
  bodyPlaceholder: "This text will be published as your post.",
  bodyReset: "Reset",

  // ── Nested triples ──────────────────────────────────────────────────
  nestedStepLabel: "Context",
  errorNestedCreation: "Failed to create context claims.",

  // ── Nested edge list ───────────────────────────────────────────────
  nestedEdgeListTitle: "Detected context",
  nestedEdgeListSubtitle: "Context detected by the assistant. You can validate or reject each item in the next step.",

  // ── Wallet / network / publish (web2↔web3 sensitive) ──────────────
  connectWalletToPublish: "Connect your wallet to publish.",
  connectWalletToAnalyze: "Connect your wallet to analyze.",
  wrongNetworkWarning: "Wrong network.",
  switchNetworkButton: "Switch network",
  contentChangedWarning: "Content changed — re-extract to publish.",
  publishingStatus: "Publishing...",
  analyzingStatus: "Analyzing...",
} as const;
