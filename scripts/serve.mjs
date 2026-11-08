import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {root,publicPaths} from "./release-lib.mjs";
const base="/crazy-flips-pwa/";
const files=new Set(publicPaths());
const mime={".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png",".txt":"text/plain; charset=utf-8"};
const server=http.createServer((req,res)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);}catch{res.writeHead(400);res.end();return;}
 if(!["GET","HEAD"].includes(req.method)){res.writeHead(405);res.end();return;}
 if(pathname==="/"){res.writeHead(302,{Location:base});res.end();return;}
 const name=pathname===base?"index.html":pathname.startsWith(base)?pathname.slice(base.length):"";
 if(!files.has(name)){res.writeHead(404);res.end("Not found");return;}
 const file=path.join(root,name);
 res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream","Content-Length":fs.statSync(file).size,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
 console.log(req.method+" "+pathname);
 if(req.method==="HEAD")res.end();else fs.createReadStream(file).pipe(res);
});
server.listen(Number(process.argv[2]||0),"127.0.0.1",()=>{
 console.log(JSON.stringify({pid:process.pid,port:server.address().port,url:"http://localhost:"+server.address().port+base}));
});
