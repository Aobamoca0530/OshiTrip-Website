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

// Each product appears once, while cross-series goods remain searchable by
// every associated IP. Prefer its most specific sub-IP over the parent label.
export function releaseFranchiseGroups<T extends { franchise_ids: string[] }>(products: T[], franchises: Franchise[]) {
  const series = franchiseGroups(franchises);
  const buckets = new Map<string, { id: string; label: string; products: T[] }>();
  const order = [...orderedFranchises(franchises).map(f => f.id), 'cross-series', 'unclassified'];
  for (const product of products) {
    const matches = series.filter(g => g.members.some(f => product.franchise_ids.includes(f.id)));
    let id = 'unclassified', label = '其他企划';
    if (matches.length > 1) { id = 'cross-series'; label = '跨 IP 联合企划'; }
    else if (matches.length === 1) {
      const group = matches[0];
      const specific = group.members.filter(f => product.franchise_ids.includes(f.id) && !group.members.some(child => child.parent_id === f.id && product.franchise_ids.includes(child.id)));
      const selected = specific.length === 1 ? specific[0] : group.root;
      id = selected.id;
      label = selected.id === group.root.id ? group.root.name : `${group.root.name} · ${selected.name}`;
    }
    if (!buckets.has(id)) buckets.set(id, { id, label, products: [] });
    buckets.get(id)!.products.push(product);
  }
  return [...buckets.values()].sort((a,b) => order.indexOf(a.id) - order.indexOf(b.id));
}
