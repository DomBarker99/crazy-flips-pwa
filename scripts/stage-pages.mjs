import fs from "node:fs";
import path from "node:path";
import {root,publicPaths} from "./release-lib.mjs";
const argument=process.argv[2];
if(!argument||!path.isAbsolute(argument))throw Error("Supply an explicit absolute output directory, such as a task temp directory.");
const output=path.resolve(argument);
if(output===root||output.startsWith(root+path.sep))throw Error("Stage generated files outside the source project.");
if(fs.existsSync(output)&&fs.readdirSync(output).length)throw Error("Output directory must be new or empty.");
fs.mkdirSync(output,{recursive:true});
for(const name of publicPaths()){
 const destination=path.join(output,name);
 fs.mkdirSync(path.dirname(destination),{recursive:true});
 fs.copyFileSync(path.join(root,name),destination);
}
fs.writeFileSync(path.join(output,".nojekyll"),"");
console.log("Staged GitHub Pages files at "+output);
