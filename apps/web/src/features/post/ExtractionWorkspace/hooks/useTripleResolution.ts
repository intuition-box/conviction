"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { normalizeLabelForChain } from "@/lib/format/normalizeLabel";
import { makeTripleKey } from "@/lib/format/makeTripleKey";
import { fetchJsonWithTimeout } from "@/lib/net/fetchWithTimeout";

import {
  parseTripleSuggestions,
  type ApprovedProposalWithRole,
  type ApprovedTripleStatus,
  type ApprovedTripleStatusState,
  type DepositState,
  type ExistingTripleMetrics,
  type ExistingTripleStatus,
  type ProposalDraft,
  type TripleSuggestion,
  type TripleSuggestionSummary,
} from "../extractionTypes";

const normalizeText = normalizeLabelForChain;

// ─── Reducer: existing triple resolution ─────────────────────────────────

type ExistingTripleState = {
  id: string | null;
  error: string | null;
  status: ExistingTripleStatus;
  metrics: ExistingTripleMetrics;
};

type ExistingTripleAction =
  | { type: "RESET" }
  | { type: "CHECKING" }
  | { type: "FOUND"; id: string }
  | { type: "FOUND_WITH_METRICS"; id: string; metrics: ExistingTripleMetrics }
  | { type: "NOT_FOUND" }
  | { type: "ERROR"; error: string }
  | { type: "SET_METRICS"; metrics: ExistingTripleMetrics };

const INITIAL_EXISTING: ExistingTripleState = {
  id: null,
  error: null,
  status: "idle",
  metrics: { holders: null, totalShares: null, sharePrice: null, marketCap: null },
};

function existingTripleReducer(
  state: ExistingTripleState,
  action: ExistingTripleAction,
): ExistingTripleState {
  switch (action.type) {
    case "RESET":
      return INITIAL_EXISTING;
    case "CHECKING":
      return { ...state, status: "checking", error: null };
    case "FOUND":
      return { ...state, id: action.id, status: "found" };
    case "FOUND_WITH_METRICS":
      return { ...state, id: action.id, status: "found", metrics: action.metrics };
    case "NOT_FOUND":
      return { ...state, id: null, status: "not_found" };
    case "ERROR":
      return { ...state, status: "error", error: action.error };
    case "SET_METRICS":
      return { ...state, metrics: action.metrics };
  }
}

// ─── Reducer: approved triples resolution ────────────────────────────────

type ApprovedResolutionState = {
  statuses: ApprovedTripleStatus[];
  status: ApprovedTripleStatusState;
  error: string | null;
};

type ApprovedResolutionAction =
  | { type: "RESET" }
  | { type: "CHECKING" }
  | { type: "READY"; statuses: ApprovedTripleStatus[] }
  | { type: "ERROR"; error: string };

const INITIAL_APPROVED: ApprovedResolutionState = {
  statuses: [],
  status: "idle",
  error: null,
};

function approvedResolutionReducer(
  state: ApprovedResolutionState,
  action: ApprovedResolutionAction,
): ApprovedResolutionState {
  switch (action.type) {
    case "RESET":
      return INITIAL_APPROVED;
    case "CHECKING":
      return { ...state, status: "checking", error: null };
    case "READY":
      return { statuses: action.statuses, status: "ready", error: null };
    case "ERROR":
      return { ...state, status: "error", error: action.error };
  }
}

// ─── Reducer: triple suggestions ─────────────────────────────────────────

type SuggestionsAction =
  | { type: "RESET" }
  | { type: "INIT_LOADING"; proposalIds: string[] }
  | {
      type: "SET_RESULTS";
      results: Array<{
        proposalId: string;
        suggestions: TripleSuggestion[];
        error: string | null;
      }>;
    };

function suggestionsReducer(
  state: Record<string, TripleSuggestionSummary>,
  action: SuggestionsAction,
): Record<string, TripleSuggestionSummary> {
  switch (action.type) {
    case "RESET":
      return {};
    case "INIT_LOADING": {
      const next: Record<string, TripleSuggestionSummary> = {};
      for (const id of action.proposalIds) {
        next[id] = {
          status: "loading",
          suggestions: state[id]?.suggestions ?? [],
          error: null,
        };
      }
      return next;
    }
    case "SET_RESULTS": {
      const next = { ...state };
      for (const result of action.results) {
        next[result.proposalId] = {
          status: result.error ? "error" : "ready",
          suggestions: result.suggestions,
          error: result.error,
        };
      }
      return next;
    }
  }
}

// ─── Params & Return types ────────────────────────────────────────────────

type UseTripleResolutionParams = {
  proposals: ProposalDraft[];
  approvedProposal: ApprovedProposalWithRole | null;
  approvedProposals: ApprovedProposalWithRole[];
  address: `0x${string}` | undefined;
  setDepositState: (state: DepositState) => void;
};

type UseTripleResolutionReturn = {
  minDeposit: bigint | null;
  atomCost: bigint | null;
  tripleCost: bigint | null;
  existingTripleId: string | null;
  existingTripleStatus: ExistingTripleStatus;
  existingTripleError: string | null;
  existingTripleMetrics: ExistingTripleMetrics;
  approvedTripleStatuses: ApprovedTripleStatus[];
  approvedTripleStatus: ApprovedTripleStatusState;
  approvedTripleStatusError: string | null;
  tripleSuggestionsByProposal: Record<string, TripleSuggestionSummary>;
};

// ─── Internal type ────────────────────────────────────────────────────────

type TripleQuery = {
  proposalId: string;
  query: string;
  sLabel: string;
  pLabel: string;
  oLabel: string;
  subjectAtomId: string;
  predicateAtomId: string;
  objectAtomId: string;
};

// ─── API response types ──────────────────────────────────────────────────

type ResolveAtomsResponse = {
  atoms: Array<{ data: string; termId: string }>;
};

type ResolveTriplesResponse = {
  byKey: Record<string, string | null>;
};

type TripleDetailsResponse = {
  triple: {
    id: string;
    subject: string;
    predicate: string;
    object: string;
    marketCap: number | null;
    holders: number | null;
    shares: number | null;
    sharePrice: number | null;
    createdAt: string | null;
    creator: string;
    counterTermId: string | null;
  };
};

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useTripleResolution({
  proposals,
  approvedProposal,
  approvedProposals,
  address,
  setDepositState,
}: UseTripleResolutionParams): UseTripleResolutionReturn {
  // ─── State (reducers) ─────────────────────────
  const [minDeposit, setMinDeposit] = useState<bigint | null>(null);
  const [atomCost, setAtomCost] = useState<bigint | null>(null);
  const [tripleCost, setTripleCost] = useState<bigint | null>(null);
  const [existing, dispatchExisting] = useReducer(existingTripleReducer, INITIAL_EXISTING);
  const [approved, dispatchApproved] = useReducer(approvedResolutionReducer, INITIAL_APPROVED);
  const [suggestions, dispatchSuggestions] = useReducer(suggestionsReducer, {});

  // ─── Race guard refs ────────────────────────
  const tripleLookupId = useRef(0);
  const approvedTripleLookupId = useRef(0);
  const tripleSuggestionLookupId = useRef(0);

  // ─── Computed: tripleQueries ────────────────
  const tripleQueries = useMemo(
    () =>
      proposals
        .filter((proposal) => proposal.status !== "rejected")
        .map((proposal): TripleQuery | null => {
          if (!proposal.subjectAtomId || !proposal.predicateAtomId || !proposal.objectAtomId) {
            return null;
          }
          const sLabel = normalizeText(proposal.sText);
          const pLabel = normalizeText(proposal.pText);
          const oLabel = normalizeText(proposal.oText);
          if (!sLabel || !pLabel || !oLabel) return null;
          return {
            proposalId: proposal.id,
            query: `${sLabel} ${pLabel} ${oLabel}`,
            sLabel,
            pLabel,
            oLabel,
            subjectAtomId: proposal.subjectAtomId,
            predicateAtomId: proposal.predicateAtomId,
            objectAtomId: proposal.objectAtomId,
          };
        })
        .filter((entry): entry is TripleQuery => entry !== null),
    [proposals],
  );

  // ─── Effect #3: loadDeposit ─────────────────
  useEffect(() => {
    let active = true;

    async function loadDeposit() {
      if (approvedProposals.length === 0) {
        if (active) {
          setMinDeposit(null);
          setAtomCost(null);
          setTripleCost(null);
        }
        return;
      }

      try {
        const data = await fetchJsonWithTimeout<{
          minDeposit: string;
          tripleCost: string;
          atomCost: string;
        }>("/api/intuition/config");
        if (active) {
          setMinDeposit(BigInt(data.minDeposit));
          setAtomCost(BigInt(data.atomCost));
          setTripleCost(BigInt(data.tripleCost));
        }
      } catch {
        if (active) {
          setMinDeposit(null);
          setAtomCost(null);
          setTripleCost(null);
        }
      }
    }

    loadDeposit();

    return () => {
      active = false;
    };
  }, [approvedProposals.length]);

  // ─── Effect #4: checkExistingTriple ─────────
  useEffect(() => {
    let active = true;
    const requestId = ++tripleLookupId.current;

    dispatchExisting({ type: "RESET" });
    setDepositState({ status: "idle" });

    async function checkExistingTriple() {
      if (!approvedProposal || !address) return;

      // Path A: matched triple term ID
      if (approvedProposal.matchedIntuitionTripleTermId) {
        dispatchExisting({ type: "CHECKING" });
        try {
          const data = await fetchJsonWithTimeout<TripleDetailsResponse>(
            `/api/triples/${approvedProposal.matchedIntuitionTripleTermId}`,
          );
          if (!active || requestId !== tripleLookupId.current) return;

          dispatchExisting({ type: "FOUND", id: approvedProposal.matchedIntuitionTripleTermId });

          const t = data.triple;
          dispatchExisting({
            type: "SET_METRICS",
            metrics: {
              holders: t.holders,
              totalShares: t.shares,
              sharePrice: t.sharePrice,
              marketCap: t.marketCap,
            },
          });
        } catch (error: unknown) {
          if (active && requestId === tripleLookupId.current) {
            const msg = error instanceof Error ? error.message : "Unable to check existing triples.";
            dispatchExisting({ type: "ERROR", error: msg });
          }
        }
        return;
      }

      // Path B: lookup by labels
      const labels = [
        normalizeText(approvedProposal.sText),
        normalizeText(approvedProposal.pText),
        normalizeText(approvedProposal.oText),
      ];
      if (labels.some((label) => !label)) return;

      dispatchExisting({ type: "CHECKING" });

      try {
        const atomIds: Record<"subject" | "predicate" | "object", string | null> = {
          subject: approvedProposal.subjectAtomId ?? null,
          predicate: approvedProposal.predicateAtomId ?? null,
          object: approvedProposal.objectAtomId ?? null,
        };

        // Resolve missing atom IDs via API
        const missingLabels: string[] = [];
        if (!atomIds.subject) missingLabels.push(labels[0]);
        if (!atomIds.predicate) missingLabels.push(labels[1]);
        if (!atomIds.object) missingLabels.push(labels[2]);

        if (missingLabels.length > 0) {
          const uniqueMissing = Array.from(new Set(missingLabels));
          const atomData = await fetchJsonWithTimeout<ResolveAtomsResponse>(
            "/api/intuition/resolve-atoms",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ labels: uniqueMissing }),
            },
          );
          const atomMap = new Map(atomData.atoms.map((atom) => [atom.data, atom.termId]));

          if (!atomIds.subject) atomIds.subject = atomMap.get(labels[0]) ?? null;
          if (!atomIds.predicate) atomIds.predicate = atomMap.get(labels[1]) ?? null;
          if (!atomIds.object) atomIds.object = atomMap.get(labels[2]) ?? null;
        }

        if (!atomIds.subject || !atomIds.predicate || !atomIds.object) {
          if (active && requestId === tripleLookupId.current) {
            dispatchExisting({ type: "NOT_FOUND" });
          }
          return;
        }

        // Resolve triple via API
        const tripleData = await fetchJsonWithTimeout<ResolveTriplesResponse>(
          "/api/intuition/resolve-triples",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address,
              combinations: [[atomIds.subject, atomIds.predicate, atomIds.object]],
            }),
          },
        );

        const key = makeTripleKey(atomIds.subject, atomIds.predicate, atomIds.object);
        const tripleId = tripleData.byKey[key] ?? null;
        if (!active || requestId !== tripleLookupId.current) return;

        if (tripleId) {
          dispatchExisting({ type: "FOUND", id: tripleId });

          // Fetch metrics (fallback: continue without metrics if this fails)
          try {
            const detailsData = await fetchJsonWithTimeout<TripleDetailsResponse>(
              `/api/triples/${tripleId}`,
            );
            const t = detailsData.triple;
            if (active && requestId === tripleLookupId.current) {
              dispatchExisting({
                type: "SET_METRICS",
                metrics: {
                  holders: t.holders,
                  totalShares: t.shares,
                  sharePrice: t.sharePrice,
                  marketCap: t.marketCap,
                },
              });
            }
          } catch (error) {
            console.error("Failed to fetch triple details:", error);
          }
        } else {
          dispatchExisting({ type: "NOT_FOUND" });
        }
      } catch (error: unknown) {
        if (active && requestId === tripleLookupId.current) {
          const msg = error instanceof Error ? error.message : "Unable to check existing triples.";
          dispatchExisting({ type: "ERROR", error: msg });
        }
      }
    }

    checkExistingTriple();

    return () => {
      active = false;
    };
  }, [
    approvedProposal?.sText,
    approvedProposal?.pText,
    approvedProposal?.oText,
    approvedProposal?.subjectAtomId,
    approvedProposal?.predicateAtomId,
    approvedProposal?.objectAtomId,
    approvedProposal,
    address,
  ]);

  // ─── Effect #5: checkApprovedTriples ────────
  useEffect(() => {
    let active = true;
    const requestId = ++approvedTripleLookupId.current;

    if (approvedProposals.length === 0 || !address) {
      dispatchApproved({ type: "RESET" });
      return () => {
        active = false;
      };
    }

    dispatchApproved({ type: "CHECKING" });

    async function checkApprovedTriples() {
      try {
        const labelsByProposal = approvedProposals.map((proposal) => ({
          proposalId: proposal.id,
          sLabel: normalizeText(proposal.sText),
          pLabel: normalizeText(proposal.pText),
          oLabel: normalizeText(proposal.oText),
          subjectAtomId: proposal.subjectAtomId ?? null,
          predicateAtomId: proposal.predicateAtomId ?? null,
          objectAtomId: proposal.objectAtomId ?? null,
          matchedIntuitionTripleTermId: proposal.matchedIntuitionTripleTermId ?? null,
        }));

        // Collect missing atom labels
        const missingLabels = new Set<string>();
        for (const entry of labelsByProposal) {
          if (entry.matchedIntuitionTripleTermId) continue;
          if (entry.sLabel && !entry.subjectAtomId) missingLabels.add(entry.sLabel);
          if (entry.pLabel && !entry.predicateAtomId) missingLabels.add(entry.pLabel);
          if (entry.oLabel && !entry.objectAtomId) missingLabels.add(entry.oLabel);
        }

        // Resolve missing atoms via API
        const atomMap = new Map<string, string>();
        if (missingLabels.size > 0) {
          const atomData = await fetchJsonWithTimeout<ResolveAtomsResponse>(
            "/api/intuition/resolve-atoms",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ labels: Array.from(missingLabels) }),
            },
          );
          for (const atom of atomData.atoms) {
            atomMap.set(atom.data, atom.termId);
          }
        }

        // Build triple entries for lookup
        const tripleEntries: Array<{
          proposalId: string;
          key: string;
          subjectAtomId: string;
          predicateAtomId: string;
          objectAtomId: string;
        }> = [];

        const nextStatuses: ApprovedTripleStatus[] = labelsByProposal.map((entry) => {
          if (entry.matchedIntuitionTripleTermId) {
            return {
              proposalId: entry.proposalId,
              tripleTermId: entry.matchedIntuitionTripleTermId,
              isExisting: true,
            };
          }

          const subjectAtomId = entry.subjectAtomId ?? atomMap.get(entry.sLabel) ?? null;
          const predicateAtomId = entry.predicateAtomId ?? atomMap.get(entry.pLabel) ?? null;
          const objectAtomId = entry.objectAtomId ?? atomMap.get(entry.oLabel) ?? null;

          if (!subjectAtomId || !predicateAtomId || !objectAtomId) {
            return { proposalId: entry.proposalId, tripleTermId: null, isExisting: false };
          }

          const key = makeTripleKey(subjectAtomId, predicateAtomId, objectAtomId);
          tripleEntries.push({
            proposalId: entry.proposalId,
            key,
            subjectAtomId,
            predicateAtomId,
            objectAtomId,
          });

          return { proposalId: entry.proposalId, tripleTermId: null, isExisting: false };
        });

        // Resolve triples via API
        if (tripleEntries.length > 0) {
          const tripleData = await fetchJsonWithTimeout<ResolveTriplesResponse>(
            "/api/intuition/resolve-triples",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address,
                combinations: tripleEntries.map((entry) => [
                  entry.subjectAtomId,
                  entry.predicateAtomId,
                  entry.objectAtomId,
                ]),
              }),
            },
          );

          for (const entry of tripleEntries) {
            const tripleId = tripleData.byKey[entry.key] ?? null;
            if (tripleId) {
              const status = nextStatuses.find((item) => item.proposalId === entry.proposalId);
              if (status) {
                status.tripleTermId = tripleId;
                status.isExisting = true;
              }
            }
          }
        }

        if (!active || requestId !== approvedTripleLookupId.current) return;
        dispatchApproved({ type: "READY", statuses: nextStatuses });
      } catch (error: unknown) {
        if (!active || requestId !== approvedTripleLookupId.current) return;
        const msg = error instanceof Error ? error.message : "Unable to resolve triple status.";
        dispatchApproved({ type: "ERROR", error: msg });
      }
    }

    void checkApprovedTriples();

    return () => {
      active = false;
    };
  }, [approvedProposals, address]);

  // ─── Effect #6: tripleSuggestions ───────────
  useEffect(() => {
    let active = true;
    const requestId = ++tripleSuggestionLookupId.current;

    if (tripleQueries.length === 0) {
      dispatchSuggestions({ type: "RESET" });
      return () => {
        active = false;
      };
    }

    dispatchSuggestions({
      type: "INIT_LOADING",
      proposalIds: tripleQueries.map((e) => e.proposalId),
    });

    const handle = setTimeout(async () => {
      // Build exact-match queries via resolve-triples API
      const exactMatchByProposal: Record<string, TripleSuggestion | null> = {};
      try {
        if (address) {
          const combinations = tripleQueries.map((e) => [
            e.subjectAtomId,
            e.predicateAtomId,
            e.objectAtomId,
          ] as [string, string, string]);

          const tripleData = await fetchJsonWithTimeout<ResolveTriplesResponse>(
            "/api/intuition/resolve-triples",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ address, combinations }),
            },
          );

          for (const entry of tripleQueries) {
            const key = makeTripleKey(entry.subjectAtomId, entry.predicateAtomId, entry.objectAtomId);
            const termId = tripleData.byKey[key];
            if (termId) {
              exactMatchByProposal[entry.proposalId] = {
                id: termId,
                subject: entry.sLabel,
                predicate: entry.pLabel,
                object: entry.oLabel,
                subjectId: entry.subjectAtomId,
                predicateId: entry.predicateAtomId,
                objectId: entry.objectAtomId,
                source: "exact",
                isExactMatch: true,
              };
            }
          }
        }
      } catch {
        // exact match is best-effort; continue with search suggestions
      }

      const results = await Promise.all(
        tripleQueries.map(async (entry) => {
          try {
            const response = await fetch("/api/intuition/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              cache: "no-store",
              body: JSON.stringify({
                query: entry.query,
                limit: 5,
                kind: "triple",
                sLabel: entry.sLabel,
                pLabel: entry.pLabel,
                oLabel: entry.oLabel,
              }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              return {
                proposalId: entry.proposalId,
                suggestions: [] as TripleSuggestion[],
                error: data?.error ?? "Unable to load triple suggestions.",
              };
            }
            const searchSuggestions = parseTripleSuggestions(data?.triples);

            // Prepend exact match if found and not already in search results
            const exact = exactMatchByProposal[entry.proposalId];
            if (exact) {
              const alreadyInResults = searchSuggestions.some((s) => s.id === exact.id);
              if (alreadyInResults) {
                const idx = searchSuggestions.findIndex((s) => s.id === exact.id);
                if (idx >= 0) {
                  searchSuggestions[idx] = {
                    ...searchSuggestions[idx],
                    isExactMatch: true,
                    source: "exact",
                  };
                  const [item] = searchSuggestions.splice(idx, 1);
                  searchSuggestions.unshift(item);
                }
              } else {
                searchSuggestions.unshift(exact);
              }
            }

            return {
              proposalId: entry.proposalId,
              suggestions: searchSuggestions,
              error: null,
            };
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Unable to load triple suggestions.";
            return {
              proposalId: entry.proposalId,
              suggestions: [] as TripleSuggestion[],
              error: msg,
            };
          }
        }),
      );

      if (!active || requestId !== tripleSuggestionLookupId.current) return;
      dispatchSuggestions({ type: "SET_RESULTS", results });
    }, 350);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [tripleQueries, address]);

  // ─── Return ─────────────────────────────────
  return {
    minDeposit,
    atomCost,
    tripleCost,
    existingTripleId: existing.id,
    existingTripleStatus: existing.status,
    existingTripleError: existing.error,
    existingTripleMetrics: existing.metrics,
    approvedTripleStatuses: approved.statuses,
    approvedTripleStatus: approved.status,
    approvedTripleStatusError: approved.error,
    tripleSuggestionsByProposal: suggestions,
  };
}
