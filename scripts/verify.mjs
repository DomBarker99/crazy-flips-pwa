import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {root,computeRelease,readRelease,publicPaths,sha} from "./release-lib.mjs";
const release=readRelease();
assert.deepEqual(release,computeRelease(),"Run npm run prepare after changing public files");
assert.equal(release.assets.length,6);
assert(release.totalBytes<150*1024*1024);
const files=publicPaths();
let total=0;
for(const name of files){
 const stat=fs.statSync(path.join(root,name));
 assert(stat.isFile());assert(stat.size<100*1024*1024,name+" exceeds the GitHub file limit");
 total+=stat.size;
}
assert(total<1024*1024*1024);
const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.webmanifest"),"utf8"));
assert.equal(manifest.scope,"./");assert.equal(manifest.id,"./");
assert(manifest.start_url.startsWith("./"));assert.equal(manifest.orientation,"landscape");
for(const icon of manifest.icons){
 assert(!icon.src.startsWith("/"));
 const png=fs.readFileSync(path.join(root,icon.src));
 assert.equal(png.subarray(1,4).toString(),"PNG");
 assert.equal(icon.sizes,png.readUInt32BE(16)+"x"+png.readUInt32BE(20));
}
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
assert(!/(?:src|href)=["']\//.test(html),"Root-relative links break project Pages sites");
assert(html.includes("apple-mobile-web-app-capable"));
assert(html.includes("connect-src 'self'"));
const framework=fs.readFileSync(path.join(root,"game/Build/Builds.asm.framework.js"),"utf8");
assert(framework.includes("script.src=Module.offlineSdkUrl;"));
assert(!framework.includes('script.src="https://sdk.crazygames.com/'));
const provenance=JSON.parse(fs.readFileSync(path.join(root,"game/provenance.json"),"utf8"));
assert.equal(provenance.settingsPatch.disableAdPreviews,false);
assert(framework.includes("Module.configureOfflineSdk(window.CrazyGames.SDK)"));
assert(html.includes("app/offline-ads.js"));
assert.deepEqual(provenance.settingsPatch.changes.whitelistedDomains.after,["https://dombarker99.github.io"]);
assert.equal(sha(fs.readFileSync(path.join(root,"game/Build/Builds.data"))),provenance.settingsPatch.outputSha256);
assert.equal(sha(fs.readFileSync(path.join(root,"game/Build/Builds.asm.js"))),"d005fb63b8a89c71823a6cf7d67a285d595643ee5b31616c81ca6906bb91d57d");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
assert(!sw.includes("caches.delete"),"Do not remove other apps' or users' cached data");
assert(sw.includes('crypto.subtle.digest("SHA-256"'));
assert(sw.includes('headers.delete("content-encoding")'));
console.log(JSON.stringify({pass:true,release:release.version,gameVersion:release.gameVersion,publicFiles:files.length,publishedBytes:total,gameBytes:release.totalBytes,largestFileBytes:Math.max(...files.map(name=>fs.statSync(path.join(root,name)).size))},null,2));
