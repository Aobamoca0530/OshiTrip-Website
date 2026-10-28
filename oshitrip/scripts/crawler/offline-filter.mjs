// Headline is used for discovery; body evidence is checked again before publication.
const physical = /POP[ -]?UP|ポップアップ|ポップストア|カフェ|\bCAFE\b|喫茶|キッチンカー|展示|衣裳展|パネル展|展覧|展出|展覽|展覧会|物販|出展|フェア|オンリーショップ|コラボショップ|巡回|舞台挨拶|上映|公開収録|お渡し会|サイン会|握手会|トークイベント|ファンミーティング|会場限定|店舗限定|アトレ|マルイ|ロフト|GiGO|モーリーファンタジー|STORE.*キャンペーン|コラボ.*(?:店舗|開催|ショップ)/i;
const live = /\bLIVE\b|ライブ|コンサート|公演|舞台|ミュージカル|フェスティバル/i;
const digital = /生配信|配信番組|ラジオ放送|ラジオ配信|放送情報|放送決定|デジタルリリース|プレイリスト|Pre-add|Pre-save|試聴|MV公開|ミュージックビデオ/i;
const sales = /Blu[ -]?ray|ブルーレイ|DVD|CD|アルバム|シングル|通販|通信販売|受注販売|オンライン販売|グッズ.*(?:発売|販売)/i;
const ticket = /抽選|先行|チケット|申込券|シリアル|一般販売/i;
export function classifyOffline(title, body = '') {
  // The franchise name Love Live! is not evidence of a live concert.
  title = title.replace(/ラブライブ[！!]?|Love\s*Live[！!]?/gi, '作品');
  if (/開催報告|公演レポート|ライブレポート|アーカイブ配信/.test(title)) return null;
  if (digital.test(title) && !physical.test(title)) return null;
  if (physical.test(title)) return 'offline';
  if (live.test(title) && !sales.test(title) && !/配信|生放送/.test(title)) return 'live';
  // A CD announcement matters here only when its text explicitly links a ticket
  // application to a physical show. A merchandise prize lottery is not a ticket.
  if (ticket.test(title) && live.test(body) && /会場|公演|ツアー/.test(body) && /チケット|先行抽選|申込券/.test(body)) return 'live';
  if (sales.test(title)) return null;
  if (/コラボ|イベント|開催/.test(title) && /会場|店舗|店頭|入場|開催場所|開催店舗/.test(body)) return 'offline';
  return null;
}
