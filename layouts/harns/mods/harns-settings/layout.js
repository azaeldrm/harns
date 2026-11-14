import { layout } from "herdr";

/** The layout node with this id, if the layout has one. */
export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
