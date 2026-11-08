import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export const sha=data=>crypto.createHash("sha256").update(data).digest("hex");
export function walk(folder){
 return fs.readdirSync(path.join(root,folder),{withFileTypes:true}).flatMap(entry=>{
  const name=folder+"/"+entry.name;
  return entry.isDirectory()?walk(name):[name];
 }).sort();
}
export function publicPaths(){
 return ["index.html","manifest.webmanifest","sw.js","NOTICE.txt",...walk("app"),...walk("game"),...walk("icons")].sort();
}
export function computeRelease(){
 const files=publicPaths().filter(name=>name!=="app/release.js");
 const records=files.map(name=>{const data=fs.readFileSync(path.join(root,name));return {path:name,bytes:data.length,sha256:sha(data)};});
 const assets=records.filter(record=>record.path.startsWith("game/Build/")||record.path.startsWith("game/vendor/"));
 const gameVersion=sha(JSON.stringify(assets)).slice(0,16);
 const version=sha(JSON.stringify(records)).slice(0,16);
 const shell=["./",...records.map(record=>record.path).filter(name=>!assets.some(asset=>asset.path===name)&&name!=="sw.js"),"app/release.js"];
 return {version,gameVersion,totalBytes:assets.reduce((sum,asset)=>sum+asset.bytes,0),assets,shell};
}
export function readRelease(){
 const text=fs.readFileSync(path.join(root,"app/release.js"),"utf8");
 const prefix="self.CF3D_RELEASE = ";
 if(!text.startsWith(prefix))throw Error("Unexpected generated release format");
 return JSON.parse(text.slice(prefix.length).replace(/;\s*$/,""));
}
