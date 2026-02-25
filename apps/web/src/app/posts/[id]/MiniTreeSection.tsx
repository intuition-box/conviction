import { MiniTree } from "@/components/MiniTree/MiniTree";

import styles from "./MiniTreeSection.module.css";

type MiniTreeReply = {
  id: string;
  body: string;
  stance: "SUPPORTS" | "REFUTES";
};

type MiniTreeSectionProps = {
  open: boolean;
  onToggle: () => void;
  breadcrumbs: { id: string; body: string }[];
  focusNode: { id: string; body: string };
  replies: MiniTreeReply[];
};

export function MiniTreeSection({
  open,
  onToggle,
  breadcrumbs,
  focusNode,
  replies,
}: MiniTreeSectionProps) {
  return (
    <>
      <div className={styles.toggle}>
        <button className={styles.toggleBtn} onClick={onToggle}>
          {open ? "Hide map" : "View map"}
        </button>
      </div>
      <div className={`${styles.wrapper} ${open ? styles.wrapperOpen : ""}`}>
        <MiniTree ancestors={breadcrumbs} focusNode={focusNode} basePath="/posts">
          {replies}
        </MiniTree>
      </div>
    </>
  );
}
