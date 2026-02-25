"use client";

import Link from "next/link";
import { MessageSquare, TrendingUp } from "lucide-react";

import { ThemeBadge } from "@/components/ThemeBadge/ThemeBadge";
import type { TrendingPost } from "@/app/HomePageClient";
import styles from "./TrendingScroll.module.css";

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "\u2026";
}

type TrendingScrollProps = {
  posts: TrendingPost[];
};

export function TrendingScroll({ posts }: TrendingScrollProps) {
  if (posts.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.title}>
        <TrendingUp size={16} />
        Trending Now
      </h2>
      <div className={styles.scroll}>
        {posts.map((post) => (
          <Link key={post.id} href={`/posts/${post.id}`} className={styles.card}>
            <ThemeBadge>{post.theme.name}</ThemeBadge>
            <p className={styles.body}>{truncate(post.body, 100)}</p>
            <span className={styles.replies}>
              <MessageSquare size={12} />
              {post.replyCount}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
