import { SubmissionStatus } from "@prisma/client";

/**
 * Validates that a string is a valid SubmissionStatus enum value
 */
export function isValidSubmissionStatus(status: string): status is SubmissionStatus {
  return ["DRAFT", "EXTRACTING", "READY_TO_PUBLISH", "PUBLISHING", "PUBLISHED", "FAILED"].includes(status);
}

/**
 * Validates that a status transition is allowed
 * Based on the submission workflow state machine
 */
export function canTransitionStatus(from: SubmissionStatus, to: SubmissionStatus): boolean {
  const validTransitions: Record<SubmissionStatus, SubmissionStatus[]> = {
    DRAFT: ["EXTRACTING", "FAILED"],
    EXTRACTING: ["READY_TO_PUBLISH", "FAILED"],
    READY_TO_PUBLISH: ["PUBLISHING", "FAILED"],
    PUBLISHING: ["PUBLISHED", "FAILED"],
    PUBLISHED: [], // Terminal state
    FAILED: ["DRAFT", "EXTRACTING"], // Can retry from failed state
  };

  return validTransitions[from]?.includes(to) ?? false;
}
