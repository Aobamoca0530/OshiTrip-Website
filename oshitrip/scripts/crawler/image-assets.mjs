import sharp from 'sharp';

export function isLoveLiveImage(url) {
  const u = new URL(url);
  return u.origin === 'https://www.lovelive-anime.jp' && !u.username && !u.password && !u.hash
    && /^\/(?:nijigasaki|hasunosora|yuigaoka|uranohoshi|otonokizaka|lovehigh|special)\/(?:module|news|topics|live|live-event|(?:shared|common)\/api|event\/[a-z0-9_-]+)\/image\.php$/.test(u.pathname)
    && [...u.searchParams.keys()].length === 1
    && /^\/lovelive\/jp\/(?:news|live)\/[0-9/]+\/[\w/.-]+\.(?:png|jpe?g|webp)$/i.test(u.searchParams.get('img_path') || '')
    && !u.searchParams.get('img_path').split('/').includes('..');
}

export function allowedImageUrl(url, origin) {
  try {
    const u = new URL(url);
    return u.origin === origin && u.protocol === 'https:' && !u.username && !u.password && !u.hash
      && (isLoveLiveImage(u.href) || (!u.search && /(?:uploads|assets|files|images|img)\//.test(u.pathname) && /\.(?:png|jpe?g|webp)$/i.test(u.pathname)));
  } catch { return false; }
}

// The official PHP endpoints sometimes label JPEG bytes text/html. Neither the
// filename nor Content-Type proves an image: require magic bytes AND decoding.
export async function validatedImageMime(buffer) {
  if (!buffer.length || buffer.length > 8_000_000) throw new Error('图片超过大小限制或为空');
  const format = buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'jpeg'
    : buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : null;
  if (!format) throw new Error('响应不是受支持的图片字节');
  const image = sharp(buffer, { failOn: 'warning', limitInputPixels: 40_000_000 });
  const meta = await image.metadata();
  if (meta.format !== format || (meta.pages || 1) > 1) throw new Error('图片格式不匹配或包含多帧');
  await image.stats(); // Decode the entire image, rejecting truncated/corrupt data.
  return `image/${format}`;
}
