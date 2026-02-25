"use client";

import Link from "next/link";
import { MessageSquare, Flame } from "lucide-react";

import { ThemeBadge } from "@/components/ThemeBadge/ThemeBadge";
import type { HotTopic, ThemeSummary } from "@/app/HomePageClient";
import styles from "./HomeSidebar.module.css";

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "\u2026";
}

type HomeSidebarProps = {
  hotTopics: HotTopic[];
  themes: ThemeSummary[];
};

export function HomeSidebar({ hotTopics, themes }: HomeSidebarProps) {
  return (
    <aside className={styles.sidebar}>
      {hotTopics.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.title}>
            <Flame size={14} />
            Hot Topics
          </h3>
          <div className={styles.hotTopicsList}>
            {hotTopics.map((topic, i) => (
              <Link key={topic.id} href={`/posts/${topic.id}`} className={styles.hotTopicItem}>
                <span className={styles.hotTopicRank}>{i + 1}</span>
                <div className={styles.hotTopicContent}>
                  <p className={styles.hotTopicBody}>{truncate(topic.body, 60)}</p>
                  <span className={styles.hotTopicReplies}>
                    <MessageSquare size={11} />
                    {topic.replyCount} replies
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {themes.length > 0 && (
        <section className={styles.section}>
          <h3 className={styles.title}>Themes</h3>
          <div className={styles.categoriesList}>
            {themes.map((cat) => (
              <Link key={cat.slug} href={`/themes/${cat.slug}`} className={styles.categoryLink}>
                <ThemeBadge size="lg">{cat.name}</ThemeBadge>
              </Link>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
