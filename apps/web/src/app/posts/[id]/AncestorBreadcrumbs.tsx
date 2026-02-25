import Link from "next/link";

import styles from "./AncestorBreadcrumbs.module.css";

type AncestorBreadcrumbsProps = {
  breadcrumbs: { id: string; body: string }[];
};

export function AncestorBreadcrumbs({ breadcrumbs }: AncestorBreadcrumbsProps) {
  if (breadcrumbs.length === 0) return null;

  return (
    <section>
      <div className={styles.ancestors}>
        {breadcrumbs.slice(-3).map((ancestor) => (
          <Link key={ancestor.id} href={`/posts/${ancestor.id}`} className={styles.card}>
            <p className={styles.body}>{ancestor.body}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
