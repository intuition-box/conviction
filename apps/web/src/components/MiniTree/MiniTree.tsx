"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./MiniTree.module.css";

type TreeNode = {
  id: string;
  body: string;
  type: "ancestor" | "focus" | "child";
  stance?: "SUPPORTS" | "REFUTES";
};

type MiniTreeProps = {
  ancestors: { id: string; body: string }[];
  focusNode: { id: string; body: string };
  children: { id: string; body: string; stance: "SUPPORTS" | "REFUTES" }[];
  basePath?: string;
};

export function MiniTree({ ancestors, focusNode, children, basePath = "/posts" }: MiniTreeProps) {
  const router = useRouter();
  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Only show last 3 ancestors
  const visibleAncestors = ancestors.slice(-3);

  function handleNodeHover(node: TreeNode, event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
    setHoveredNode(node);
  }

  function handleNodeLeave() {
    setHoveredNode(null);
  }

  function handleNodeClick(nodeId: string) {
    router.push(`${basePath}/${nodeId}`);
  }

  function handleNodeKeyDown(e: React.KeyboardEvent, nodeId: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleNodeClick(nodeId);
    }
  }

  return (
    <div className={styles.miniTree}>
      {/* Ancestors row */}
      {visibleAncestors.length > 0 && (
        <div className={styles.treeRow}>
          {visibleAncestors.map((ancestor, index) => (
            <div key={ancestor.id} className={styles.nodeWrapper}>
              <div
                className={`${styles.treeNode} ${styles.ancestorNode}`}
                onMouseEnter={(e) => handleNodeHover({ ...ancestor, type: "ancestor" }, e)}
                onMouseLeave={handleNodeLeave}
                onClick={() => handleNodeClick(ancestor.id)}
                onKeyDown={(e) => handleNodeKeyDown(e, ancestor.id)}
                role="button"
                tabIndex={0}
                aria-label={`Navigate to ancestor: ${ancestor.body.slice(0, 40)}`}
              />
              {index < visibleAncestors.length - 1 && <div className={styles.connectorDown} />}
            </div>
          ))}
        </div>
      )}

      {/* Connection line from ancestors to focus */}
      {visibleAncestors.length > 0 && <div className={styles.connectorDown} />}

      {/* Focus node row */}
      <div className={styles.treeRow}>
        <div className={styles.nodeWrapper}>
          <div
            className={`${styles.treeNode} ${styles.focusNode}`}
            onMouseEnter={(e) => handleNodeHover({ ...focusNode, type: "focus" }, e)}
            onMouseLeave={handleNodeLeave}
            onClick={() => handleNodeClick(focusNode.id)}
            onKeyDown={(e) => handleNodeKeyDown(e, focusNode.id)}
            role="button"
            tabIndex={0}
            aria-label={`Current post: ${focusNode.body.slice(0, 40)}`}
          />
        </div>
      </div>

      {/* Connection line from focus to children */}
      {children.length > 0 && <div className={styles.connectorDown} />}

      {/* Children row */}
      {children.length > 0 && (
        <div className={styles.treeRow}>
          {children.map((child) => (
            <div key={child.id} className={styles.nodeWrapper}>
              <div
                className={`${styles.treeNode} ${styles.childNode} ${styles[`child${child.stance}`]}`}
                onMouseEnter={(e) => handleNodeHover({ ...child, type: "child", stance: child.stance }, e)}
                onMouseLeave={handleNodeLeave}
                onClick={() => handleNodeClick(child.id)}
                onKeyDown={(e) => handleNodeKeyDown(e, child.id)}
                role="button"
                tabIndex={0}
                aria-label={`Navigate to ${child.stance.toLowerCase()} reply`}
              />
            </div>
          ))}
        </div>
      )}

      {/* Tooltip */}
      {hoveredNode && (
        <div
          className={styles.tooltip}
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
          }}
        >
          <div className={styles.tooltipLabel}>
            {hoveredNode.type === "ancestor" && "Ancestor"}
            {hoveredNode.type === "focus" && "Current Post"}
            {hoveredNode.type === "child" && `Reply (${hoveredNode.stance})`}
          </div>
          <p className={styles.tooltipBody}>{hoveredNode.body}</p>
        </div>
      )}
    </div>
  );
}
