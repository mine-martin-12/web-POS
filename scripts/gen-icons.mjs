// Generates PWA / favicon PNGs from public/favicon.png (the Smart POS app icon).
//   node scripts/gen-icons.mjs
import sharp from "sharp";

const source = "public/favicon.png";
const out = "public/icons";

for (const size of [32, 180, 192, 512]) {
  await sharp(source).resize(size, size).png().toFile(`${out}/icon-${size}.png`);
}
// Maskable: launchers crop to a circle/squircle, so keep the artwork inside the
// central safe zone (80%) on a matching background.
const inner = Math.round(512 * 0.8);
await sharp({ create: { width: 512, height: 512, channels: 4, background: "#ffffff" } })
  .composite([{ input: await sharp(source).resize(inner, inner).png().toBuffer(), gravity: "center" }])
  .png()
  .toFile(`${out}/maskable-512.png`);
console.log("icons written to", out);
