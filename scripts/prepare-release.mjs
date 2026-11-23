import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = path.resolve("dist");
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (item) =>
        item.isDirectory()
          ? walk(path.join(dir, item.name))
          : [path.join(dir, item.name)],
      ),
    )
  ).flat();
}
const paths = (await walk(path.join(root, "assets")))
  .map((file) => "/" + path.relative(root, file).split(path.sep).join("/"))
  .sort();
const source = await readFile(path.join(root, "sw.js"), "utf8");
const shell = [
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon.png",
  ...paths,
];
const id = createHash("sha256")
  .update(source)
  .update(JSON.stringify(shell))
  .update(await readFile(path.join(root, "index.html")))
  .digest("hex")
  .slice(0, 16);
await writeFile(
  path.join(root, "sw.js"),
  source
    .replace("settleup-shell-dev", `settleup-shell-${id}`)
    .replace(
      /const PRECACHE = \[[\s\S]*?\];/,
      `const PRECACHE = ${JSON.stringify(shell)};`,
    ),
);
await writeFile(
  path.join(root, "release.json"),
  JSON.stringify(
    { app: "SettleUp", version: "0.2.0-beta", build: id },
    null,
    2,
  ) + "\n",
);
console.log(`Prepared SettleUp ${id}: ${shell.length} public offline assets.`);
