import { uniqueImages } from './discovery-promotion.mjs';
import { verifiedImage } from './verified-images.mjs';

export function imageReviewQueue(announcements, observations, attempts, stamp, records = []) {
  const observed = new Map(observations.map(item => [item.observation.source_url, item]));
  const results = new Map(attempts.map(item => [`${item.source_url}\n${item.url}`, item]));
  const items = announcements.flatMap(row => uniqueImages(row.images).map(image => {
    const captured = observed.get(row.source_url);
    const result = results.get(`${row.source_url}\n${image.url}`);
    const proposal = row.image_readings?.find(reading => reading.url === image.url);
    const verified = verifiedImage(records.find(record => record.source_url === row.source_url && record.url === image.url), row, captured?.observation, result);
    return {
      source_url: row.source_url, source_hash: captured?.observation.content_hash || row.content_hash,
      title: row.activity?.title_zh || row.title, url: image.url, alt: image.alt || '',
      observed_at: captured ? captured.observed_at || stamp : null,
      status: !captured ? 'source_unavailable' : verified ? 'reviewed_snapshot' : result?.status || (proposal ? 'needs_review' : 'pending'),
      reason: verified ? '已对照原图审核的快照；核实时间见 reviewed_at，不代表本轮重新读取图片。' : !captured ? '本轮没有正文，保留原图片出处与时间。' : result?.reason || (proposal
        ? '已有机器译文；本轮未重新核实图片字节，需对照原图复核。' : '官方图片已收录，图中文字尚未复核。'),
      sha256: result?.sha256 || verified?.sha256 || proposal?.sha256 || null,
      candidate: verified?.reading || result?.reading || proposal || null,
      image_text_verified: !!verified, reviewed_at: verified?.reviewed_at || null,
    };
  }));
  const count = state => items.filter(item => item.status === state).length;
  return { checked_at: stamp, total: items.length, pending: count('pending'), needs_review: count('needs_review'),
    failed: count('failed'), source_unavailable: count('source_unavailable'), reviewed_snapshot: count('reviewed_snapshot'), items };
}
