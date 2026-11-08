import fs from "node:fs";
import path from "node:path";
import {root,computeRelease} from "./release-lib.mjs";
const release=computeRelease();
fs.writeFileSync(path.join(root,"app/release.js"),"self.CF3D_RELEASE = "+JSON.stringify(release,null,2)+";\n");
console.log(JSON.stringify({version:release.version,gameVersion:release.gameVersion,gameBytes:release.totalBytes,gameFiles:release.assets.length},null,2));
