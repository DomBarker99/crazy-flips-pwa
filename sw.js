/* App-scoped offline storage. Never clears another app's caches or local saves. */
importScripts("./app/release.js");
const RELEASE=self.CF3D_RELEASE;
const BASE=new URL("./",self.location.href);
const SHELL_CACHE="crazy-flips-pwa-shell-"+RELEASE.version;
const GAME_CACHE="crazy-flips-pwa-game-"+RELEASE.gameVersion;
const INDEX=new URL("index.html",BASE).href;
const MARKER=new URL("__game_complete__",BASE).href;
const assetURLs=new Map(RELEASE.assets.map(asset=>[new URL(asset.path,BASE).href,asset]));
let downloadJob;

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    for(const path of RELEASE.shell)await cache.add(new Request(new URL(path,BASE),{cache:"reload"}));
  })());
});
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));

async function currentState(){
  if(!await caches.has(GAME_CACHE))return {ready:false,cachedBytes:0,cachedFiles:0,totalBytes:RELEASE.totalBytes};
  const cache=await caches.open(GAME_CACHE);
  let cachedBytes=0,cachedFiles=0;
  for(const [url,asset] of assetURLs){
    const hit=await cache.match(url);
    if(hit&&hit.headers.get("x-offline-sha256")===asset.sha256&&Number(hit.headers.get("x-offline-bytes"))===asset.bytes){cachedBytes+=asset.bytes;cachedFiles++;}
  }
  const ready=cachedFiles===RELEASE.assets.length&&Boolean(await cache.match(MARKER));
  return {ready,cachedBytes,cachedFiles,totalBytes:RELEASE.totalBytes};
}
async function progress(loadedBytes,completedFiles){
  const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
  for(const client of clients)if(client.url.startsWith(BASE.href))client.postMessage({type:"CACHE_PROGRESS",loadedBytes,completedFiles,totalBytes:RELEASE.totalBytes});
}
function hex(bytes){return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");}
async function downloadGame(){
  const cache=await caches.open(GAME_CACHE);
  let doneBytes=0,doneFiles=0;
  for(const [url,asset] of assetURLs){
    const previous=await cache.match(url);
    if(previous&&previous.headers.get("x-offline-sha256")===asset.sha256&&Number(previous.headers.get("x-offline-bytes"))===asset.bytes){doneBytes+=asset.bytes;doneFiles++;await progress(doneBytes,doneFiles);continue;}
    const response=await fetch(url,{cache:"no-store",credentials:"same-origin"});
    if(!response.ok||response.type==="opaque")throw Error("Could not download "+asset.path+" (HTTP "+response.status+").");
    const chunks=[];let received=0,lastProgress=0;
    if(response.body){
      const reader=response.body.getReader();
      while(true){
        const {done,value}=await reader.read();if(done)break;
        chunks.push(value);received+=value.length;
        if(received>asset.bytes)throw Error("Unexpected file size for "+asset.path+". Refresh the app before retrying.");
        if(Date.now()-lastProgress>120){await progress(doneBytes+received,doneFiles);lastProgress=Date.now();}
      }
    }else{const bytes=new Uint8Array(await response.arrayBuffer());chunks.push(bytes);received=bytes.length;}
    if(received!==asset.bytes)throw Error("The download of "+asset.path+" was incomplete. You can resume.");
    const body=new Uint8Array(received);let offset=0;
    for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
    chunks.length=0;
    const digest=hex(await crypto.subtle.digest("SHA-256",body));
    if(digest!==asset.sha256)throw Error("The game version changed during download. Update the app, then retry.");
    const headers=new Headers(response.headers);
    headers.delete("content-encoding");headers.delete("content-length");headers.delete("transfer-encoding");
    headers.set("x-offline-sha256",digest);headers.set("x-offline-bytes",String(received));
    await cache.put(url,new Response(body,{status:200,headers}));
    doneBytes+=received;doneFiles++;await progress(doneBytes,doneFiles);
  }
  await cache.put(MARKER,new Response(JSON.stringify({gameVersion:RELEASE.gameVersion,completedAt:new Date().toISOString()}),{headers:{"content-type":"application/json"}}));
  return currentState();
}
self.addEventListener("message",event=>{
  const port=event.ports[0];
  if(event.data?.type==="ACTIVATE_UPDATE"){event.waitUntil(self.skipWaiting());return;}
  const job=event.data?.type==="STATE"?currentState():event.data?.type==="CACHE_GAME"?(downloadJob||=(downloadGame().finally(()=>{downloadJob=null;}))):Promise.reject(Error("Unknown offline request"));
  event.waitUntil(job.then(value=>port?.postMessage({ok:true,value})).catch(error=>port?.postMessage({ok:false,error:error.message||String(error)})));
});
self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  if(url.origin!==BASE.origin){event.respondWith(Promise.resolve(Response.error()));return;}
  if(!url.pathname.startsWith(BASE.pathname)||event.request.method!=="GET")return;
  event.respondWith((async()=>{
    const clean=new URL(url);clean.search="";clean.hash="";
    if(assetURLs.has(clean.href)){
      const cache=await caches.open(GAME_CACHE);
      return await cache.match(clean.href)||new Response("Game download is incomplete. Return to the launcher to resume.",{status:503});
    }
    const cache=await caches.open(SHELL_CACHE);
    if(event.request.mode==="navigate")return await cache.match(INDEX)||fetch(event.request);
    return await cache.match(event.request,{ignoreSearch:true})||fetch(event.request);
  })());
});
