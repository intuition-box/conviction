import { prisma } from "@/server/db/prisma";
import type { FeedReplyPreview } from "./HomePageClient";
import { HomePageClient } from "./HomePageClient";

/** Shared select shape for reply previews (reused in feed query + server action) */
const REPLY_SELECT = {
  id: true,
  body: true,
  createdAt: true,
  user: { select: { displayName: true, address: true, avatar: true } },
  stance: true,
  tripleLinks: { where: { role: "MAIN" as const }, select: { termId: true } },
  _count: { select: { replies: true } },
  replies: {
    take: 1,
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { displayName: true, address: true, avatar: true } },
      stance: true,
      tripleLinks: { where: { role: "MAIN" as const }, select: { termId: true } },
      _count: { select: { replies: true } },
    },
  },
} as const;

type RawReply = Awaited<ReturnType<typeof prisma.post.findMany<{ select: typeof REPLY_SELECT }>>>[number];

function serializeReply(r: RawReply): FeedReplyPreview {
  return {
    id: r.id,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    user: {
      displayName: r.user.displayName,
      address: r.user.address,
      avatar: r.user.avatar,
    },
    stance: r.stance as "SUPPORTS" | "REFUTES" | null,
    mainTripleTermIds: r.tripleLinks.map((l) => l.termId),
    replyCount: r._count.replies,
    subReplies: r.replies.map((sub) => ({
      id: sub.id,
      body: sub.body,
      createdAt: sub.createdAt.toISOString(),
      user: {
        displayName: sub.user.displayName,
        address: sub.user.address,
        avatar: sub.user.avatar,
      },
      stance: sub.stance as "SUPPORTS" | "REFUTES" | null,
      mainTripleTermIds: sub.tripleLinks.map((l) => l.termId),
      replyCount: sub._count.replies,
    })),
  };
}

async function loadMoreReplies(
  postId: string,
  offset: number,
): Promise<{ replies: FeedReplyPreview[]; hasMore: boolean }> {
  "use server";
  const raw = await prisma.post.findMany({
    where: { parentPostId: postId },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: 2,
    select: REPLY_SELECT,
  });
  return {
    replies: raw.map(serializeReply),
    hasMore: raw.length === 2,
  };
}

export default async function HomePage() {
  // 1. Trending: root posts with most replies
  const trendingRaw = await prisma.post.findMany({
    where: { parentPostId: null },
    orderBy: { replies: { _count: "desc" } },
    take: 4,
    select: {
      id: true,
      body: true,
      theme: { select: { slug: true, name: true } },
      replies: { select: { id: true } },
    },
  });

  // 2. Feed: root posts with 2 reply previews
  const feedRaw = await prisma.post.findMany({
    where: { parentPostId: null },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { displayName: true, address: true, avatar: true } },
      theme: { select: { slug: true, name: true } },
      tripleLinks: { where: { role: "MAIN" }, select: { termId: true } },
      _count: { select: { replies: true } },
      replies: {
        take: 2,
        orderBy: { createdAt: "desc" },
        select: REPLY_SELECT,
      },
    },
  });

  // 3. Hot topics: top 5 root posts by reply count
  const hotTopicsRaw = await prisma.post.findMany({
    where: { parentPostId: null },
    orderBy: { replies: { _count: "desc" } },
    take: 5,
    select: {
      id: true,
      body: true,
      replies: { select: { id: true } },
    },
  });

  // 4. Themes with post counts
  const themesRaw = await prisma.theme.findMany({
    select: {
      slug: true,
      name: true,
      _count: { select: { posts: true } },
    },
    orderBy: { posts: { _count: "desc" } },
  });

  // Serialize for client
  const trending = trendingRaw.map((p) => ({
    id: p.id,
    body: p.body,
    theme: p.theme,
    replyCount: p.replies.length,
  }));

  const feed = feedRaw.map((p) => ({
    id: p.id,
    body: p.body,
    createdAt: p.createdAt.toISOString(),
    user: {
      displayName: p.user.displayName,
      address: p.user.address,
      avatar: p.user.avatar,
    },
    replyCount: p._count.replies,
    theme: p.theme,
    mainTripleTermIds: p.tripleLinks.map((l) => l.termId),
    replyPreviews: p.replies.map(serializeReply),
  }));

  const hotTopics = hotTopicsRaw.map((p) => ({
    id: p.id,
    body: p.body,
    replyCount: p.replies.length,
  }));

  const themes = themesRaw.map((t) => ({
    slug: t.slug,
    name: t.name,
    postCount: t._count.posts,
  }));

  return (
    <HomePageClient
      trending={trending}
      feed={feed}
      hotTopics={hotTopics}
      themes={themes}
      loadMoreReplies={loadMoreReplies}
    />
  );
}
