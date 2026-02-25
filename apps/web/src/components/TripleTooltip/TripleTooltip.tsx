"use client";

import { useRef, useState } from "react";

import { TripleInline } from "@/components/TripleInline/TripleInline";
import styles from "./TripleTooltip.module.css";

type TripleTooltipProps = {
  tripleTermIds: string[];
  children: React.ReactNode;
  className?: string;
  onClick?: (tripleTermIds: string[]) => void;
};

type TripleData = {
  termId: string;
  subject: string;
  predicate: string;
  object: string;
};

export function TripleTooltip({ tripleTermIds, children, className, onClick }: TripleTooltipProps) {
  const [triplesData, setTriplesData] = useState<TripleData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const loadedRef = useRef(false);

  async function loadTriplesData() {
    if (loadedRef.current || loading || error) return;
    loadedRef.current = true;

    setLoading(true);
    try {
      const results = await Promise.all(
        tripleTermIds.map(async (termId) => {
          const response = await fetch(`/api/triples/${termId}`);
          if (!response.ok) throw new Error("Failed to load triple data");
          const data = await response.json();
          return {
            termId,
            subject: data.triple.subject,
            predicate: data.triple.predicate,
            object: data.triple.object,
          };
        })
      );
      setTriplesData(results);
    } catch (err) {
      setError(true);
      console.error("Error loading triples:", err);
    } finally {
      setLoading(false);
    }
  }

  function handleMouseEnter() {
    setShowTooltip(true);
    loadTriplesData();
  }

  function handleMouseLeave() {
    setShowTooltip(false);
  }

  if (tripleTermIds.length === 0) return <>{children}</>;

  return (
    <div
      className={`${styles.wrapper}${onClick ? ` ${styles.clickable}` : ""}${className ? ` ${className}` : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick ? (e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick(tripleTermIds);
      } : undefined}
    >
      {children}

      {showTooltip && (
        <div className={styles.tooltip}>
          {loading && <p className={styles.loading}>Loading triples...</p>}
          {error && <p className={styles.error}>Failed to load triples</p>}
          {triplesData.map((triple, index) => (
            <div key={triple.termId} className={styles.tripleData}>
              {triplesData.length > 1 && (
                <div className={styles.tripleIndex}>Triple {index + 1}</div>
              )}
              <TripleInline subject={triple.subject} predicate={triple.predicate} object={triple.object} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
