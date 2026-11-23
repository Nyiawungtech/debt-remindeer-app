import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const origin = "https://settleupapp.cloud";
const expected = JSON.parse(await readFile("dist/release.json", "utf8"));
async function get(path) {
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("Unexpected verification origin");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (response.status !== 200) throw new Error(path + ": HTTP " + response.status);
  return response;
}
const live = await (await get("/release.json")).json();
if (live.build !== expected.build) throw new Error("Live build does not match " + expected.build);
const index = await readFile("dist/index.html");
for (const route of ["/add", "/confirm-email", "/privacy"]) {
  const response = await get(route);
  const content = Buffer.from(await response.arrayBuffer());
  if (!content.equals(index)) throw new Error("Unexpected app shell at " + route);
  if (!response.headers.get("content-security-policy")) throw new Error("Missing CSP at " + route);
  console.log("LIVE_ROUTE " + JSON.stringify({ path: route, status: response.status }));
}
const worker = await readFile("dist/sw.js", "utf8");
const paths = JSON.parse(worker.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
let verified = 0;
for (let offset = 0; offset < paths.length; offset += 6) {
  await Promise.all(paths.slice(offset, offset + 6).map(async path => {
    const local = await readFile("dist" + path);
    const remote = Buffer.from(await (await get(path)).arrayBuffer());
    const hash = value => createHash("sha256").update(value).digest("hex");
    if (hash(local) !== hash(remote)) throw new Error("Asset mismatch: " + path);
    verified++;
  }));
}
if ((await (await get("/sw.js")).text()) !== worker) throw new Error("Service worker mismatch");
console.log("LIVE_VERIFIED " + JSON.stringify({ build: live.build, publicAssets: verified, routes: 3, serviceWorker: true }));
