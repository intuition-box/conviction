import styles from "./TripleInline.module.css";

type TripleInlineProps = {
  subject: string;
  predicate: string;
  object: string;
};

export function TripleInline({ subject, predicate, object }: TripleInlineProps) {
  return (
    <div className={styles.tripleRow}>
      <span className={styles.tripleValue} data-full={subject}>{subject}</span>
      <span className={styles.tripleValue} data-full={predicate}>{predicate}</span>
      <span className={styles.tripleValue} data-full={object}>{object}</span>
    </div>
  );
}
