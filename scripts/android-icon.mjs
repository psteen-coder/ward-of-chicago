import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "assets/android-icon");
const res = join(root, "android/app/src/main/res");

if (!existsSync(res)) {
  console.error("android/ is missing. Run cap add android first.");
  process.exit(1);
}

const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
for (const density of densities) {
  const dir = join(res, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(src, `ic_launcher-${density}.png`), join(dir, "ic_launcher.png"));
  copyFileSync(join(src, `ic_launcher_round-${density}.png`), join(dir, "ic_launcher_round.png"));
  copyFileSync(join(src, `ic_launcher_foreground-${density}.png`), join(dir, "ic_launcher_foreground.png"));
}

const background = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0C1016</color>
</resources>
`;
mkdirSync(join(res, "values"), { recursive: true });
writeFileSync(join(res, "values/ic_launcher_background.xml"), background);
console.log("Android launcher is the night pentacle.");
