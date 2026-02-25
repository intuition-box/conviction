import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: { findUnique: vi.fn() },
  theme: { findUnique: vi.fn() },
  post: { findUnique: vi.fn() },
  submission: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
};

vi.mock("@/server/db/prisma", () => ({ prisma: mockPrisma }));

const mockAuth = vi.fn<() => Promise<{ userId: string; address: string; chainId: number }>>();
vi.mock("@/server/auth/siwe", () => ({
  requireSiweAuth: (...args: unknown[]) => mockAuth(...(args as [])),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/submission/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeAbandonRequest(body: unknown): Request {
  return new Request("http://localhost/api/submission/abandon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── POST /api/submission/create ─────────────────────────────────────────────

describe("POST /api/submission/create", () => {
  // Dynamic import to ensure mocks are set up first
  let POST: (request: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1", address: "0xabc", chainId: 1 });
    const mod = await import("../../submission/create/route");
    POST = mod.POST;
  });

  it("creates submission READY_TO_PUBLISH for reply with stance", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockPrisma.theme.findUnique.mockResolvedValue({ slug: "ai-safety" });
    mockPrisma.post.findUnique.mockResolvedValue({ themeSlug: "ai-safety" });
    mockPrisma.submission.create.mockResolvedValue({
      id: "sub-1",
      status: "READY_TO_PUBLISH",
      createdAt: new Date("2026-01-01"),
    });

    const res = await POST(
      makeRequest({
        themeSlug: "ai-safety",
        inputText: "Test input",
        parentPostId: "post-1",
        stance: "SUPPORTS",
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.submission.id).toBe("sub-1");
    expect(data.submission.status).toBe("READY_TO_PUBLISH");
    expect(mockPrisma.submission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "READY_TO_PUBLISH",
        stance: "SUPPORTS",
        parentPostId: "post-1",
      }),
    });
  });

  it("rejects missing themeSlug", async () => {
    const res = await POST(makeRequest({ inputText: "Test" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/themeSlug/);
  });

  it("rejects empty inputText", async () => {
    const res = await POST(makeRequest({ themeSlug: "ai-safety", inputText: "" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/inputText/);
  });

  it("rejects inputText > 5000 chars", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockPrisma.theme.findUnique.mockResolvedValue({ slug: "ai-safety" });

    const res = await POST(
      makeRequest({ themeSlug: "ai-safety", inputText: "x".repeat(5001) }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/5000/);
  });

  it("rejects parentPostId without stance", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockPrisma.theme.findUnique.mockResolvedValue({ slug: "ai-safety" });

    const res = await POST(
      makeRequest({ themeSlug: "ai-safety", inputText: "Test", parentPostId: "post-1" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/stance/i);
  });

  it("rejects stance without parentPostId", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockPrisma.theme.findUnique.mockResolvedValue({ slug: "ai-safety" });

    const res = await POST(
      makeRequest({ themeSlug: "ai-safety", inputText: "Test", stance: "SUPPORTS" }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/stance/i);
  });

  it("rejects parent post from different theme", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockPrisma.theme.findUnique.mockResolvedValue({ slug: "ai-safety" });
    mockPrisma.post.findUnique.mockResolvedValue({ themeSlug: "climate" });

    const res = await POST(
      makeRequest({
        themeSlug: "ai-safety",
        inputText: "Test",
        parentPostId: "post-1",
        stance: "SUPPORTS",
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/different theme/i);
  });
});

// ─── POST /api/submission/abandon ────────────────────────────────────────────

describe("POST /api/submission/abandon", () => {
  let POST: (request: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1", address: "0xabc", chainId: 1 });
    const mod = await import("../../submission/abandon/route");
    POST = mod.POST;
  });

  it("abandons READY_TO_PUBLISH submission", async () => {
    mockPrisma.submission.findUnique.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "READY_TO_PUBLISH",
    });
    mockPrisma.submission.update.mockResolvedValue({});

    const res = await POST(makeAbandonRequest({ submissionId: "sub-1" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(mockPrisma.submission.update).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { status: "FAILED" },
    });
  });

  it("rejects abandon of PUBLISHING submission", async () => {
    mockPrisma.submission.findUnique.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "PUBLISHING",
    });

    const res = await POST(makeAbandonRequest({ submissionId: "sub-1" }));
    expect(res.status).toBe(409);
  });

  it("rejects abandon of PUBLISHED submission", async () => {
    mockPrisma.submission.findUnique.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "PUBLISHED",
    });

    const res = await POST(makeAbandonRequest({ submissionId: "sub-1" }));
    expect(res.status).toBe(409);
  });

  it("rejects abandon of another user's submission", async () => {
    mockPrisma.submission.findUnique.mockResolvedValue({
      id: "sub-1",
      userId: "user-2",
      status: "READY_TO_PUBLISH",
    });

    const res = await POST(makeAbandonRequest({ submissionId: "sub-1" }));
    expect(res.status).toBe(403);
  });
});
