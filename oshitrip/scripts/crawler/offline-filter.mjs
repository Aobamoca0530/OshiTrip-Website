// Headline is used for discovery; body evidence is checked again before publication.
const physical = /POP[ -]?UP|ポップアップ|ポップストア|カフェ|\bCAFE\b|喫茶|キッチンカー|展示|衣裳展|パネル展|展覧|展出|展覽|展覧会|物販|出展|フェア|オンリーショップ|コラボショップ|巡回|舞台挨拶|上映|公開収録|お渡し会|サイン会|握手会|トークイベント|ファンミーティング|会場限定|店舗限定|アトレ|マルイ|ロフト|GiGO|モーリーファンタジー|STORE.*キャンペーン|コラボ.*(?:店舗|開催|ショップ)/i;
const live = /\bLIVE\b|\bGIG\b|DJイベント|ライブ|コンサート|公演|舞台|ミュージカル|フェスティバル/i;
const digital = /生配信|配信番組|ラジオ放送|ラジオ配信|放送情報|放送決定|デジタルリリース|プレイリスト|Pre-add|Pre-save|試聴|MV公開|ミュージックビデオ/i;
const sales = /Blu[ -]?ray|ブルーレイ|DVD|CD|\b(?:single|album)\b|アルバム|シングル|通販|通信販売|受注販売|オンライン販売|グッズ.*(?:発売|販売)/i;
const ticket = /抽選|先行|チケット|申込券|シリアル|一般販売/i;
export function classifyOffline(title, body = '') {
  // The franchise name Love Live! is not evidence of a live concert.
  title = title.replace(/ラブライブ[！!]?|Love\s*Live[！!]?|イキヅライブ[！!]?/gi, '作品');
  if (/開催報告|公演レポート|ライブレポート|アーカイブ配信/.test(title)) return null;
  if (digital.test(title) && !physical.test(title)) return null;
  if (physical.test(title)) return 'offline';
  if (/カラオケ|スタンプラリー|マルシェ|地元愛まつり/.test(title)) return 'offline';
  if (/リリース記念(?:ライブ|公演)|発売記念(?:ライブ|公演)/.test(title) && !/配信|生放送/.test(title)) return 'live';
  if (live.test(title) && !sales.test(title) && !/配信|生放送/.test(title)) return 'live';
  // A CD announcement matters here only when its text explicitly links a ticket
  // application to a physical show. A merchandise prize lottery is not a ticket.
  if (ticket.test(title) && live.test(body) && /会場|公演|ツアー/.test(body) && /チケット|先行抽選|申込券/.test(body)) return 'live';
  if (sales.test(title)) return null;
  if (/コラボ|イベント|開催/.test(title) && /会場|店舗|店頭|入場|開催場所|開催店舗/.test(body)) return 'offline';
  return null;
}

// Dedicated official event directories carry a category independently of titles.
// Do not infer a concert from a generic article's footer, franchise name or sidebar.
export function classifyAnnouncement(source, observation) {
  const { title, body_text: body = '' } = observation;
  if (/全劇場の上映が終了/.test(body)) return null;
  // Broadcast recap articles can also announce real store campaigns and tickets.
  // Keep these mixed official roundups for review; pure streams remain excluded.
  if (source.id === 'gakuen-idolmaster-portal' && /お知らせまとめ/.test(title) && /公式リセール|店頭(?:でも|と)|全国の[^。\n]{1,40}コラボ/.test(body)) return 'offline';
  const kind = classifyOffline(title, body);
  if (kind) return kind;
  if (digital.test(title) || sales.test(title) || /開催報告|レポート|アーカイブ配信/.test(title)) return null;
  if (source.id === 'bang-dream-live' && /^Live•Event\n(ライブ|イベント)\n/.test(body) && /\n開催日\n/.test(body) && /\n場所\n/.test(body)) {
    return /^Live•Event\nライブ\n/.test(body) ? 'live' : 'offline';
  }
  if (source.id === 'starlight-events' && /会場|公演|開催日時/.test(body)) return 'offline';
  if (source.id === 'gakuen-idolmaster-live' && /会場|開催日/.test(body)) return 'live';
  if (new URL(observation.source_url || 'https://invalid.test').hostname === 'www.lovelive-anime.jp' && /\/live_detail\.php$/.test(new URL(observation.source_url).pathname) && /会場|開催場所/.test(body) && /開催概要|公演名|日程/.test(body)) return 'live';
  if (source.id.endsWith('-official') && /ご当地|応援プロジェクト/.test(title) && /設置|店舗|会場|開催場所/.test(body)) return 'offline';
  return null;
}
