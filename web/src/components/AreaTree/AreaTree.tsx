"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/Icon";

import styles from "./AreaTree.module.css";

export type AreaTreeItem = {
  id: string;
  name: string;
  levelLabel: string;
  parentId?: string | null;
};

type Props = {
  items: readonly AreaTreeItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  placeholder?: string;
  className?: string;
};

type TreeNode = { item: AreaTreeItem; depth: number; children: TreeNode[] };

export function AreaTree({
  items,
  selectedId,
  onSelect,
  placeholder = "Select area",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const roots = useMemo(() => buildAreaTree(items), [items]);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const triggerLabel = selected ? triggerText(selected) : placeholder;

  function handleSelect(id: string) {
    onSelect(id);
    setOpen(false);
  }

  return (
    <span className={[styles.popover, className].filter(Boolean).join(" ")}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {triggerLabel}
        <Icon name="chevron-down" size={12} />
      </button>
      {open ? (
        <>
          <div className={styles.backdrop} onClick={() => setOpen(false)} />
          <div className={styles.menu} role="listbox">
            {roots.map((node) => (
              <AreaTreeNode
                key={node.item.id}
                node={node}
                selectedId={selectedId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </>
      ) : null}
    </span>
  );
}

function AreaTreeNode({
  node,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const isActive = node.item.id === selectedId;
  return (
    <>
      <button
        type="button"
        role="option"
        aria-selected={isActive}
        className={[styles.node, isActive ? styles.nodeActive : ""]
          .filter(Boolean)
          .join(" ")}
        style={{ paddingLeft: 8 + node.depth * 14 }}
        onClick={() => onSelect(node.item.id)}
      >
        <span>{displayName(node.item)}</span>
        <span className={styles.nodeLevel}>{node.item.levelLabel}</span>
      </button>
      {node.children.map((child) => (
        <AreaTreeNode
          key={child.item.id}
          node={child}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function buildAreaTree(items: readonly AreaTreeItem[]): TreeNode[] {
  const ids = new Set(items.map((item) => item.id));
  const nodes = new Map<string, TreeNode>(
    items.map((item) => [item.id, { item, depth: 0, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    // Only nest under a parent that is *also* in the visible list, so a
    // scope-filtered list (e.g. a user with access to just a division)
    // still renders orphans as roots instead of dropping them.
    const parentId = node.item.parentId ?? null;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent && ids.has(parent.item.id)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const assignDepth = (node: TreeNode, depth: number) => {
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  for (const root of roots) assignDepth(root, 0);
  const sortNodes = (list: TreeNode[]) => {
    list.sort((a, b) => a.item.name.localeCompare(b.item.name));
    for (const item of list) sortNodes(item.children);
  };
  sortNodes(roots);
  return roots;
}

function triggerText(item: AreaTreeItem): string {
  return `${displayName(item)} (${item.levelLabel.toLowerCase()})`;
}

function displayName(item: AreaTreeItem): string {
  const level = item.levelLabel.toLowerCase();
  const suffix = ` ${level}`;
  if (item.name.toLowerCase().endsWith(suffix)) {
    return item.name.slice(0, item.name.length - suffix.length);
  }
  return item.name;
}
