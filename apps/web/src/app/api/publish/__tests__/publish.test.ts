import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockTx = {
  post: { create: vi.fn() },
  postTripleLink: { create: vi.fn() },
  submission: { update: vi.fn() },
};

const mockPrisma = {
  submission: { findUnique: vi.fn() },
  post: { findMany: vi.fn() },
  $transaction: vi.fn((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
};

vi.mock("@/server/db/prisma", () => ({ prisma: mockPrisma }));

const mockAuth = vi.fn<() => Promise<{ userId: string }>>();
vi.mock("@/server/auth/siwe", () => ({
  requireSiweAuth: (...args: unknown[]) => mockAuth(...(args as [])),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function baseSubmission(overrides?: Record<string, unknown>) {
  return {
    id: "sub-1",
    userId: "user-1",
    themeSlug: "ai",
    inputText: "default body",
    status: "PUBLISHING",
    publishIdempotencyKey: "key-1",
    publishedPostId: null,
    parentPostId: null,
    stance: null,
    ...overrides,
  };
}

function makeDraftPost(overrides?: Record<string, unknown>) {
  return {
    draftId: "draft-0",
    body: "Post body",
    stance: null,
    triples: [
      { proposalId: "p1", tripleTermId: "t100", isExisting: false, role: "MAIN" },
    ],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("POST /api/publish", () => {
  let POST: (request: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockPrisma.submission.findUnique.mockResolvedValue(baseSubmission());
    mockTx.post.create.mockImplementation(({ data }: any) => ({
      id: `post-${data.body.slice(0, 4)}`,
      publishedAt: new Date("2026-02-23"),
      ...data,
    }));
    mockTx.postTripleLink.create.mockImplementation(({ data }: any) => ({
      id: `link-${data.termId}`,
      ...data,
    }));
    const mod = await import("../route");
    POST = mod.POST;
  });

  // ─── Happy path: multi-post ─────────────────────────────────

  it("creates N posts from posts[] payload", async () => {
    const res = await POST(makeRequest({
      submissionId: "sub-1",
      idempotencyKey: "key-1",
      posts: [
        makeDraftPost({ draftId: "d0", body: "First" }),
        makeDraftPost({ draftId: "d1", body: "Second", triples: [
          { proposalId: "p2", tripleTermId: "t200", isExisting: false, role: "MAIN" },
        ] }),
      ],
      tripleTxHash: "0xabc",
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posts).toHaveLength(2);
    expect(data.posts[0].id).toBe("post-Firs");
    expect(data.posts[1].id).toBe("post-Seco");
    expect(data.txPlan).toHaveLength(2);
    // publishedPostId = first post
    expect(mockTx.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ publishedPostId: "post-Firs" }),
      }),
    );
  });

  // ─── Validation: 1 MAIN per post ───────────────────────────

  it("rejects draft with 0 MAIN triples", async () => {
    const res = await POST(makeRequest({
      submissionId: "sub-1",
      idempotencyKey: "key-1",
      posts: [
        makeDraftPost({
          draftId: "d0",
          triples: [
            { proposalId: "p1", tripleTermId: "t100", isExisting: false, role: "SUPPORTING" },
          ],
        }),
      ],
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("d0");
    expect(data.error).toContain("0");
  });

  it("rejects draft with 2 MAIN triples", async () => {
    const res = await POST(makeRequest({
      submissionId: "sub-1",
      idempotencyKey: "key-1",
      posts: [
        makeDraftPost({
          draftId: "d0",
          triples: [
            { proposalId: "p1", tripleTermId: "t100", isExisting: false, role: "MAIN" },
            { proposalId: "p2", tripleTermId: "t200", isExisting: false, role: "MAIN" },
          ],
        }),
      ],
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("d0");
    expect(data.error).toContain("2");
  });

  // ─── Validation: invalid stance ─────────────────────────────

  it("rejects invalid stance value in posts[]", async () => {
    const res = await POST(makeRequest({
      submissionId: "sub-1",
      idempotencyKey: "key-1",
      posts: [
        makeDraftPost({ stance: "INVALID_STANCE" }),
      ],
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid draft post");
  });

  // ─── Idempotent replay ──────────────────────────────────────

  it("returns existing posts on idempotent replay", async () => {
    mockPrisma.submission.findUnique.mockResolvedValue(
      baseSubmission({ status: "PUBLISHED", publishedPostId: "post-1" }),
    );
    mockPrisma.post.findMany.mockResolvedValue([
      {
        id: "post-1",
        publishedAt: new Date("2026-02-23"),
        createdAt: new Date("2026-02-23T10:00:00"),
        tripleLinks: [
          { termId: "t100", role: "MAIN" },
          { termId: "t200", role: "SUPPORTING" },
        ],
      },
      {
        id: "post-2",
        publishedAt: new Date("2026-02-23"),
        createdAt: new Date("2026-02-23T10:00:01"),
        tripleLinks: [
          { termId: "t300", role: "MAIN" },
          { termId: "t200", role: "SUPPORTING" }, // duplicate across posts
        ],
      },
    ]);

    // Replay with malformed payload — should still succeed (idempotency)
    const res = await POST(makeRequest({
      submissionId: "sub-1",
      idempotencyKey: "key-1",
      // No posts[] or triples — normally 400, but idempotency takes priority
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posts).toHaveLength(2);
    expect(data.posts[0].id).toBe("post-1");
    expect(data.posts[1].id).toBe("post-2");
    // txPlan deduped by termId — t200 appears only once
    expect(data.txPlan).toHaveLength(3);
    const termIds = data.txPlan.map((t: any) => t.id);
    expect(termIds).toEqual(["t100", "t200", "t300"]);
  });

  // ─── Nested triples per draft ───────────────────────────────

  it("assigns nested triples to their draft's post", async () => {
    const res = await POST(makeRequest({
      submissionId: "sub-1",
      idempotencyKey: "key-1",
      posts: [
        makeDraftPost({
          draftId: "d0",
          body: "Post A",
          triples: [
            { proposalId: "p1", tripleTermId: "t100", isExisting: false, role: "MAIN" },
          ],
          nestedTriples: [
            { nestedProposalId: "n1", tripleTermId: "t500", isExisting: false },
          ],
        }),
        makeDraftPost({
          draftId: "d1",
          body: "Post B",
          triples: [
            { proposalId: "p2", tripleTermId: "t200", isExisting: false, role: "MAIN" },
          ],
        }),
      ],
      nestedTxHash: "0xnested",
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.txPlan).toHaveLength(3); // t100, t200, t500
    // Nested triple link created on first post (d0)
    const nestedLinkCalls = mockTx.postTripleLink.create.mock.calls.filter(
      (c: any) => c[0].data.termId === "t500",
    );
    expect(nestedLinkCalls).toHaveLength(1);
    expect(nestedLinkCalls[0][0].data.postId).toBe("post-Post");
    expect(nestedLinkCalls[0][0].data.role).toBe("SUPPORTING");
  });
});
