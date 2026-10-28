import sharp from "sharp";
import fs from "fs";
import path from "path";

const iconsDir = path.join(process.cwd(), "public", "icons");
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const svgIcon = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="128" fill="#0D1117"/>
  <rect x="16" y="16" width="480" height="480" rx="112" stroke="#1E293B" stroke-width="8"/>
  <path d="M256 72L392 136V264C392 344 332 416 256 448C180 416 120 344 120 264V136L256 72Z" fill="#1E293B" stroke="#3B82F6" stroke-width="16" stroke-linejoin="round"/>
  <path d="M168 264H216L240 200L272 328L296 264H344" stroke="#10B981" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="256" cy="264" r="12" fill="#60A5FA"/>
</svg>
`;

async function main() {
  const svgBuffer = Buffer.from(svgIcon);

  // 192x192 icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile(path.join(iconsDir, "icon-192x192.png"));

  // 512x512 icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, "icon-512x512.png"));

  // Maskable 512x512 icon with extra padding
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile(path.join(iconsDir, "icon-512x512-maskable.png"));

  // Also save favicon / apple touch icon
  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(iconsDir, "apple-touch-icon.png"));

  console.log("PWA icons generated successfully in public/icons/");
}

main().catch(console.error);
