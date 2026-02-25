"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ConnectedThumbVote } from "@/components/ThumbVote";
import { RoleBadge } from "@/components/RoleBadge/RoleBadge";
import { TripleInline } from "@/components/TripleInline/TripleInline";
import { fetchJsonWithTimeout } from "@/lib/net/fetchWithTimeout";

import styles from "./TripleInspector.module.css";

type TripleData = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  marketCap: number | null;
  holders: number | null;
  shares: number | null;
  createdAt: string;
  creator: string;
  counterTermId: string | null;
};

type TripleApiResponse = {
  triple: {
    id?: string;
    subject: string;
    predicate: string;
    object: string;
    marketCap?: number | null;
    holders?: number | null;
    shares?: number | null;
    createdAt?: string;
    creator?: string;
    counterTermId?: string | null;
  };
};

type RelatedPost = {
  id: string;
  body: string;
  createdAt: string;
  role: "MAIN" | "SUPPORTING";
};

type LinkedTriple = {
  termId: string;
  role: "MAIN" | "SUPPORTING";
};

type TripleInspectorProps = {
  triples: LinkedTriple[];
  defaultTripleTermId?: string | null;
};

function fmt(value?: number | null) {
  if (value === null || value === undefined) return "\u2014";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtId(id: string) {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}\u2026${id.slice(-4)}`;
}

export function TripleInspector({ triples, defaultTripleTermId }: TripleInspectorProps) {
  const initial = triples.find((t) => t.termId === defaultTripleTermId)?.termId ?? triples[0]?.termId ?? null;
  const [activeId, setActiveId] = useState<string | null>(initial);
  const [tripleMap, setTripleMap] = useState<Record<string, TripleData>>({});
  const [tripleErrors, setTripleErrors] = useState<Record<string, string>>({});
  const [relatedPosts, setRelatedPosts] = useState<RelatedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = activeId ? tripleMap[activeId] : null;
  const activeErr = activeId ? tripleErrors[activeId] : null;
  const activeRole = useMemo(() => triples.find((t) => t.termId === activeId)?.role ?? null, [activeId, triples]);

  // Load all triples
  useEffect(() => {
    let ok = true;
    (async () => {
      if (!triples.length) { setError("No triples linked."); setIsLoading(false); return; }
      setIsLoading(true); setError(null); setTripleErrors({});

      const results = await Promise.allSettled(
        triples.map(async (t) => {
          const data = await fetchJsonWithTimeout<TripleApiResponse>(`/api/triples/${t.termId}`);
          return { termId: t.termId, triple: data.triple };
        })
      );
      if (!ok) return;

      const map: Record<string, TripleData> = {};
      const errs: Record<string, string> = {};
      let hasAnyTriple = false;
      results.forEach((r, i) => {
        const tid = triples[i]?.termId;
        if (!tid) return;
        if (r.status === "fulfilled") {
          hasAnyTriple = true;
          const d = r.value.triple;
          map[tid] = { id: d.id || tid, subject: d.subject, predicate: d.predicate, object: d.object, marketCap: d.marketCap ?? null, holders: d.holders ?? null, shares: d.shares ?? null, createdAt: d.createdAt || new Date().toISOString(), creator: d.creator || "Unknown", counterTermId: d.counterTermId ?? null };
        } else {
          errs[tid] = r.reason?.message || "Failed";
        }
      });
      setTripleMap(map); setTripleErrors(errs);
      setError(hasAnyTriple ? null : "Failed to load triple data"); setIsLoading(false);
    })();
    return () => { ok = false; };
  }, [triples]);

  // Load related posts
  useEffect(() => {
    let ok = true;
    (async () => {
      if (!activeId) { setRelatedPosts([]); return; }
      setRelatedLoading(true);
      try {
        const data = await fetchJsonWithTimeout<{ posts: RelatedPost[] }>(`/api/triples/${activeId}/posts`);
        if (ok) setRelatedPosts(data.posts || []);
      } catch { if (ok) setRelatedPosts([]); }
      finally { if (ok) setRelatedLoading(false); }
    })();
    return () => { ok = false; };
  }, [activeId]);

  if (isLoading) return <div className={styles.loadingState}><p>Loading triple data...</p></div>;
  if (error) return <div className={styles.errorState}><p>{error}</p></div>;

  return (
    <div className={styles.inspector}>
      {/* Linked triples tabs */}
      {triples.length > 1 && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Linked Triples <span className={styles.count}>({triples.length})</span></h3>
          <div className={styles.linkedList}>
            {triples.map((t) => {
              const d = tripleMap[t.termId];
              return (
                <button key={t.termId} type="button" className={`${styles.linkedItem} ${t.termId === activeId ? styles.linkedItemActive : ""}`} onClick={() => setActiveId(t.termId)}>
                  <div className={styles.linkedHeader}>
                    <RoleBadge role={t.role} />
                    {t.termId === defaultTripleTermId && <span className={styles.linkedDefault}>Default</span>}
                  </div>
                  <div className={styles.linkedBody}>{d ? `${d.subject} — ${d.predicate} — ${d.object}` : fmtId(t.termId)}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {activeErr && !active && <div className={styles.errorState}><p>{activeErr}</p></div>}

      {active && (
        <>
          {/* Triple details */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              Triple
              {activeRole && <RoleBadge role={activeRole} />}
            </h3>
            <div className={styles.tripleDisplay}>
              <TripleInline subject={active.subject} predicate={active.predicate} object={active.object} />
            </div>
          </section>

          {/* Idea reused elsewhere */}
          {relatedLoading && <p className={styles.hint}>Loading related posts...</p>}
          {!relatedLoading && relatedPosts.length > 0 && (
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Idea reused elsewhere <span className={styles.count}>({relatedPosts.length})</span></h3>
              <div className={styles.postsList}>
                {relatedPosts.map((p) => (
                  <Link key={p.id} href={`/posts/${p.id}`} className={styles.postCard}>
                    <div className={styles.postHeader}>
                      <span className={styles.postDate}>{fmtDate(p.createdAt)}</span>
                    </div>
                    <p className={styles.postBody}>{p.body}</p>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Signal */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Signal</h3>
            <ConnectedThumbVote
              key={activeId}
              tripleTermId={activeId!}
              counterTermId={active.counterTermId ?? null}
              size="md"
            />
          </section>

          {/* Protocol Metrics */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Protocol Metrics</h3>
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}><span className={styles.metricLabel}>Market Cap</span><span className={styles.metricValue}>{fmt(active.marketCap)}</span></div>
              <div className={styles.metricCard}><span className={styles.metricLabel}>Holders</span><span className={styles.metricValue}>{fmt(active.holders)}</span></div>
              <div className={styles.metricCard}><span className={styles.metricLabel}>Shares</span><span className={styles.metricValue}>{fmt(active.shares)}</span></div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
