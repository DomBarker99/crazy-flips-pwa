import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {webcrypto} from "node:crypto";
import {root,sha} from "./release-lib.mjs";
const source=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const BASE="https://example.test/crazy-flips-pwa/";
function harness(){
 const payloads=new Map([["game/Build/example.bin",Buffer.from("first game payload")],["game/vendor/example.js",Buffer.from("second game payload")]]);
 const assets=[...payloads].map(([name,bytes])=>({path:name,bytes:bytes.length,sha256:sha(bytes)}));
 const release={version:"test-shell",gameVersion:"test-game",shell:["index.html","app/main.js"],assets,totalBytes:assets.reduce((n,a)=>n+a.bytes,0)};
 const handlers={},stores=new Map(),counts=new Map();
 let failPath=null,corruptPath=null,skipped=false,claimed=false;
 const key=(request,ignoreSearch=false)=>{const u=new URL(typeof request==="string"?request:request.url,BASE);if(ignoreSearch)u.search="";return u.href;};
 async function fetchMock(request){
  const url=key(request);const name=url.startsWith(BASE)?url.slice(BASE.length):url;
  counts.set(name,(counts.get(name)||0)+1);
  if(name===failPath)return new Response("try again",{status:503});
  if(payloads.has(name)){
   let body=payloads.get(name);
   if(name===corruptPath)body=Buffer.alloc(body.length,120);
   return new Response(body,{headers:{"content-type":name.endsWith(".js")?"application/javascript":"application/octet-stream","content-encoding":"gzip","content-length":"5"}});
  }
  return new Response("<!doctype html><title>Cached shell</title>",{headers:{"content-type":"text/html"}});
 }
 class Cache{
  values=new Map();
  async match(request,options={}){
   const wanted=key(request,options.ignoreSearch);
   for(const [url,response] of this.values)if(key(url,options.ignoreSearch)===wanted)return response.clone();
  }
  async put(request,response){this.values.set(key(request),response.clone());}
  async add(request){const response=await fetchMock(request);if(!response.ok)throw Error("Cache add failed");await this.put(request,response);}
 }
 const caches={async has(name){return stores.has(name);},async open(name){if(!stores.has(name))stores.set(name,new Cache());return stores.get(name);}};
 stores.set("another-app-cache",new Cache());
 const self={
  CF3D_RELEASE:release,location:{href:BASE+"sw.js"},
  addEventListener(type,handler){handlers[type]=handler;},
  clients:{async claim(){claimed=true;},async matchAll(){return [{url:BASE,postMessage(){}}];}},
  async skipWaiting(){skipped=true;}
 };
 vm.runInNewContext(source,{self,caches,fetch:fetchMock,crypto:webcrypto,Headers,Response,Request,URL,console,importScripts(){}},{filename:"sw.js"});
 async function lifecycle(type){let work;handlers[type]({waitUntil(p){work=p;}});await work;}
 async function rpc(type){let work,message;handlers.message({data:{type},ports:[{postMessage(value){message=value;}}],waitUntil(p){work=p;}});await work;return message;}
 async function respond(url,mode){let response;const request={url,method:"GET",mode};handlers.fetch({request,respondWith(p){response=p;}});return response?await response:undefined;}
 return {release,stores,counts,caches,lifecycle,rpc,respond,setFail(value){failPath=value;},setCorrupt(value){corruptPath=value;},get skipped(){return skipped;},get claimed(){return claimed;}};
}
const h=harness();
await h.lifecycle("install");assert.equal(h.skipped,false,"Updates must not take over a running game automatically");
await h.lifecycle("activate");assert.equal(h.claimed,true);assert(h.stores.has("another-app-cache"));
assert.equal((await h.rpc("STATE")).value.ready,false);
h.setFail("game/vendor/example.js");
const failed=await h.rpc("CACHE_GAME");assert.equal(failed.ok,false);
const partial=(await h.rpc("STATE")).value;
assert.equal(partial.ready,false);assert.equal(partial.cachedFiles,1);
h.setFail(null);
const resumed=await h.rpc("CACHE_GAME");assert.equal(resumed.ok,true);assert.equal(resumed.value.ready,true);
assert.equal(h.counts.get("game/Build/example.bin"),1,"Resume must not redownload an already verified file");
const hit=await h.respond(BASE+"game/vendor/example.js","cors");
assert.equal(hit.headers.get("content-encoding"),null);
assert.equal(hit.headers.get("content-length"),null);
assert.equal(hit.headers.get("x-offline-sha256"),h.release.assets[1].sha256);
const shell=await h.respond(BASE+"?useLocalSdk=true","navigate");
assert((await shell.text()).includes("Cached shell"));
assert.equal(await h.respond("https://example.test/another-app/index.html","navigate"),undefined,"Other apps must remain outside this worker's scope");
const external=await h.respond("https://ads.example/collect","cors");assert.equal(external.type,"error");
assert(!h.counts.has("https://ads.example/collect"));
await h.rpc("ACTIVATE_UPDATE");assert.equal(h.skipped,true);
const bad=harness();bad.setCorrupt("game/vendor/example.js");
const corrupt=await bad.rpc("CACHE_GAME");assert.equal(corrupt.ok,false);assert.match(corrupt.error,/version changed/);
assert.equal((await bad.rpc("STATE")).value.ready,false);
assert(h.stores.has("another-app-cache"));
console.log("PASS: offline download, partial-download resume, integrity failure, response headers, navigation fallback, cache isolation, external request blocking, explicit updates");
