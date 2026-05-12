"use client";

import { useCallback, useEffect, useState } from "react";

import type { MePostListItem, MePostsResponse } from "@/app/api/me/posts/route";

export type PostsFilter = "all" | "root" | "replies";

const PAGE_SIZE = 20;

export function useMyPosts(filter: PostsFilter) {
  const [posts, setPosts] = useState<MePostListItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number, signal?: AbortSignal): Promise<MePostsResponse> => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(PAGE_SIZE),
        filter,
      });
      const res = await fetch(`/api/me/posts?${params.toString()}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as MePostsResponse;
    },
    [filter],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchPage(0, controller.signal)
      .then((data) => {
        setPosts(data.posts);
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load posts");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchPage(posts.length);
      setPosts((prev) => [...prev, ...data.posts]);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, posts.length, loadingMore, hasMore]);

  return { posts, hasMore, loading, loadingMore, error, loadMore };
}
