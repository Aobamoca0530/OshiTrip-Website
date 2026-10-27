import { z } from 'zod';

const schema = z.object({
  restricted_sources: z.array(z.string().min(1)).min(1),
  projects: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), keywords: z.array(z.string().trim().min(2)).min(1) })).min(1),
});
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
export function createProjectFilter(input) {
  const config = schema.parse(input);
  const restricted = new Set(config.restricted_sources);
  const patterns = config.projects.flatMap(project => project.keywords.map(keyword => {
    // Whitespace/punctuation differences are harmless; avoid short English
    // fragments matching inside unrelated words such as "afterglowing".
    const value = normalize(keyword);
    if (value.length < 2) throw new Error('企划关键词不能只包含标点');
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll(' ', '\\s*');
    return new RegExp(`${/^[a-z0-9]/.test(value) ? '(?<![a-z0-9])' : ''}${escaped}${/[a-z0-9]$/.test(value) ? '(?![a-z0-9])' : ''}`, 'u');
  }));
  return (sourceId, title) => !restricted.has(sourceId) || patterns.some(pattern => pattern.test(normalize(title)));
}
export function relevantAnnouncement(sourceId, title, projectFilter) {
  if (!projectFilter(sourceId, title)) return false;
  return sourceId !== 'bang-dream-news' || /展示|POP.?UP|ポップアップ|コラボ|カフェ|グッズ|物販|会場|フェア|出展|開催|公演|ライブ.*決定/i.test(title) && !/Pre-add|Pre-save|プレイリスト|放送|デジタルリリース/i.test(title);
}
