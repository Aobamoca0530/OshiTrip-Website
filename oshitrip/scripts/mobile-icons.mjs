import sharp from 'sharp';
import fs from 'node:fs/promises';
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#45644b"/><circle cx="256" cy="256" r="156" fill="none" stroke="#fffaf0" stroke-width="20"/><path d="M319 166L285 285L166 319L200 200Z" fill="#e8ba86"/><path d="M319 166L285 285L200 200Z" fill="#fffaf0"/><circle cx="256" cy="256" r="17" fill="#45644b"/></svg>');
await fs.mkdir('mobile/public', { recursive: true });
for (const size of [192, 512]) await sharp(svg).resize(size).png().toFile(`mobile/public/icon-${size}.png`);
for (const [density, size] of Object.entries({ mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 })) {
  const directory = `android/app/src/main/res/mipmap-${density}`;
  await fs.mkdir(directory, { recursive: true });
  for (const name of ['ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground']) await sharp(svg).resize(size).png().toFile(`${directory}/${name}.png`);
}
console.log('PWA and Android icons generated');
