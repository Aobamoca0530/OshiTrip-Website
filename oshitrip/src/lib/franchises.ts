import type { Franchise } from './schema';

// Keep children next to their series even when database rows arrive unordered.
export function franchiseGroups(franchises: Franchise[]) {
  const visited = new Set<string>();
  const collect = (root: Franchise): Franchise[] => {
    if (visited.has(root.id)) return [];
    visited.add(root.id);
    return [root, ...franchises.filter(f => f.parent_id === root.id).flatMap(collect)];
  };
  const roots = franchises.filter(f => !f.parent_id || !franchises.some(p => p.id === f.parent_id));
  return [...roots, ...franchises].flatMap(root => {
    const members = collect(root);
    return members.length ? [{ root, members }] : [];
  });
}

export function orderedFranchises(franchises: Franchise[]) {
  return franchiseGroups(franchises).flatMap(group => group.members);
}
