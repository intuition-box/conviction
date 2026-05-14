import type { ReactNode } from "react";

import { TripleInline } from "@/components/TripleInline/TripleInline";

import {
  safeDisplayLabel,
  type DerivedTripleDraft,
  type NestedProposalDraft,
  type ProposalDraft,
} from "../extraction";
import { StructuredTermInline } from "./StructuredTripleInline";

type ProposalSlotInlineProps = {
  proposal: Pick<
    ProposalDraft,
    | "id"
    | "stableKey"
    | "sText"
    | "pText"
    | "oText"
    | "subjectMatchedLabel"
    | "predicateMatchedLabel"
    | "objectMatchedLabel"
    | "subjectNestedKey"
    | "objectNestedKey"
  >;
  proposals: Array<Parameters<typeof StructuredTermInline>[0]["proposals"][number]>;
  nestedProposals: NestedProposalDraft[];
  nestedRefLabels: Map<string, string>;
  derivedTriples?: DerivedTripleDraft[];
  derivedCanonicalLabels?: Map<string, { s?: string; p?: string; o?: string }>;
  wrap?: boolean;
};

export function ProposalSlotInline({
  proposal,
  proposals,
  nestedProposals,
  nestedRefLabels,
  derivedTriples,
  derivedCanonicalLabels,
  wrap,
}: ProposalSlotInlineProps) {
  const renderSlot = (
    nestedKey: string | null | undefined,
    matched: string | null,
    text: string,
  ): ReactNode => {
    if (!nestedKey) return safeDisplayLabel(matched, text);
    return (
      <StructuredTermInline
        termRef={{ type: "triple", tripleKey: nestedKey }}
        proposals={proposals}
        nestedProposals={nestedProposals}
        nestedRefLabels={nestedRefLabels}
        derivedTriples={derivedTriples}
        derivedCanonicalLabels={derivedCanonicalLabels}
      />
    );
  };

  return (
    <TripleInline
      subject={renderSlot(proposal.subjectNestedKey, proposal.subjectMatchedLabel, proposal.sText)}
      predicate={safeDisplayLabel(proposal.predicateMatchedLabel, proposal.pText)}
      object={renderSlot(proposal.objectNestedKey, proposal.objectMatchedLabel, proposal.oText)}
      wrap={wrap}
    />
  );
}
