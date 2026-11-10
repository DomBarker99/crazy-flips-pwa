(() => {
  "use strict";
  const release=self.CF3D_RELEASE;
  const base=new URL("./",document.baseURI);
  const url=new URL(location.href);
  if(url.searchParams.get("useLocalSdk")!=="true"){url.searchParams.set("useLocalSdk","true");history.replaceState(history.state,"",url);}
  const $=id=>document.getElementById(id);
  const ui={launcher:$("launcher"),status:$("status"),detail:$("detail"),download:$("download"),play:$("play"),progress:$("download-progress"),install:$("install"),help:$("install-help"),instructions:$("install-instructions"),update:$("update"),game:$("game-screen"),wrap:$("canvas-wrap"),canvas:$("game"),loading:$("game-loading"),gameProgress:$("game-progress"),rotation:$("rotation-overlay"),menu:$("game-menu"),menuButton:$("game-menu-button")};
  const installed=()=>Boolean(navigator.standalone||matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: fullscreen)").matches);
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const mb=bytes=>(bytes/1000000).toFixed(1)+" MB";
  const state=window.pwaState={phase:"starting",ready:false,engineReady:false,errors:[],release:release.version,gameVersion:release.gameVersion,totalBytes:release.totalBytes,downloadedBytes:0,installed:installed(),menuOpen:false,paused:false};
  let registration,installPrompt,instance,loaderPromise,downloadTask;
  ui.instructions.textContent=ios?"In Safari, tap Share, then Add to Home Screen. Keep Open as Web App enabled if shown. Launch Crazy Flips from the new icon.":"Use your browser’s Install app or Add to Home Screen option. If an install prompt is available, the button above will open it.";
  if(installed()){ui.install.hidden=true;$("installed-state").textContent="Home Screen app · no ad breaks";}
  function status(title,detail){ui.status.textContent=title;ui.detail.textContent=detail;}
  function fail(error){const message=error?.message||String(error);state.errors.push(message);state.phase="error";document.body.dataset.error="true";status("Something needs attention",message);ui.download.disabled=false;ui.download.textContent="Retry download";console.error(error);}
  function rpc(type){
    return new Promise((resolve,reject)=>{
      const controller=navigator.serviceWorker.controller;
      if(!controller)return reject(Error("Offline storage is not ready yet. Reload the app and try again."));
      const channel=new MessageChannel();
      const timeout=setTimeout(()=>{channel.port1.close();reject(Error("The download stopped responding. Keep the app open and try again."));},type==="CACHE_GAME"?600000:30000);
      channel.port1.onmessage=event=>{
        clearTimeout(timeout);channel.port1.close();
        event.data.ok?resolve(event.data.value):reject(Error(event.data.error||"Offline storage failed."));
      };
      controller.postMessage({type},[channel.port2]);
    });
  }
  function applyDownloadState(info){
    state.ready=info.ready;state.downloadedBytes=info.cachedBytes;
    document.body.dataset.ready=String(info.ready);
    ui.progress.value=info.cachedBytes/release.totalBytes*100;
    ui.play.hidden=!info.ready;ui.download.hidden=info.ready;
    ui.download.disabled=false;ui.download.textContent=info.cachedBytes?"Resume download":"Download game · "+mb(release.totalBytes);
    if(info.ready){state.phase="ready";ui.progress.hidden=true;status("Ready offline","The complete game is saved on this device.");}
    else{state.phase="needs-download";status(info.cachedBytes?"Download paused":"Download before playing",info.cachedBytes?mb(info.cachedBytes)+" of "+mb(release.totalBytes)+" saved. You can resume.":mb(release.totalBytes)+" · keep this app open until it says Ready offline.");}
    layout();
  }
  async function refresh(){const info=await rpc("STATE");applyDownloadState(info);return info;}
  async function download(){
    if(downloadTask)return downloadTask;
    downloadTask=(async()=>{
      state.phase="downloading";document.body.dataset.error="false";ui.download.disabled=true;ui.download.textContent="Downloading…";ui.progress.hidden=false;
      status("Saving the game",mb(state.downloadedBytes)+" of "+mb(release.totalBytes));
      if(navigator.storage?.persist)navigator.storage.persist().then(value=>{state.persistentStorage=value;}).catch(()=>{});
      await rpc("CACHE_GAME");
      await refresh();
    })().catch(fail).finally(()=>{downloadTask=null;});
    return downloadTask;
  }
  function requestFullscreen(){
    const request=ui.game.requestFullscreen||ui.game.webkitRequestFullscreen;
    if(!request)return Promise.resolve(false);
    try{return Promise.resolve(request.call(ui.game,{navigationUI:"hide"})).then(()=>true).catch(()=>false);}
    catch{return Promise.resolve(false);}
  }
  function ensureLoader(){
    if(window.createUnityInstance)return Promise.resolve();
    if(!loaderPromise)loaderPromise=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src=new URL("game/Build/Builds.asm.loader.js",base);
      script.onload=resolve;script.onerror=()=>{loaderPromise=null;reject(Error("The saved game loader could not be read. Download the game again."));};
      document.head.appendChild(script);
    });
    return loaderPromise;
  }
  function layout(){
    const portrait=innerHeight>innerWidth;
    $("rotate-hint").hidden=!state.ready||!portrait;
    if(ui.game.hidden)return;
    if(instance)instance.Module.devicePixelRatio=devicePixelRatio||1;
    const style=getComputedStyle(ui.game);
    const w=ui.game.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const h=ui.game.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    const width=Math.floor(w);
    const height=Math.floor(Math.min(h,w*9/16));
    ui.wrap.style.width=width+"px";ui.wrap.style.height=height+"px";
    ui.rotation.hidden=!portrait||!state.engineReady;
    syncPause();
  }
  function syncPause(){
    if(!instance)return;
    const pause=document.hidden||innerHeight>innerWidth||state.menuOpen;
    if(pause===state.paused)return;
    state.paused=pause;
    if(pause)instance.Module.pauseMainLoop?.();else instance.Module.resumeMainLoop?.();
  }
  async function play(){
    if(!state.ready||state.phase==="starting-game"||state.engineReady)return;
    if(innerHeight>innerWidth){$("rotate-hint").hidden=false;return;}
    state.phase="starting-game";ui.launcher.hidden=true;ui.game.hidden=false;ui.loading.hidden=false;
    document.body.classList.add("playing");layout();
    // The fullscreen request must be made during this tap, before any async loading.
    const fullscreenRequest=requestFullscreen();
    try{
      await fullscreenRequest;
      if(document.fullscreenElement&&screen.orientation?.lock)screen.orientation.lock("landscape").catch(()=>{});
      await ensureLoader();
      instance=await createUnityInstance(ui.canvas,{
        codeUrl:new URL("game/Build/Builds.asm.js",base).href,
        dataUrl:new URL("game/Build/Builds.data",base).href,
        memoryUrl:new URL("game/Build/Builds.asm.mem",base).href,
        frameworkUrl:new URL("game/Build/Builds.asm.framework.js",base).href,
        streamingAssetsUrl:new URL("game/StreamingAssets",base).href,
        offlineSdkUrl:new URL("game/vendor/crazygames-sdk-v3.js",base).href,
        configureOfflineSdk:self.installOfflineAdPolicy,
        companyName:"Crazy Flips Offline",productName:"Crazy Flips 3D",productVersion:"12",
        devicePixelRatio:devicePixelRatio||1,
        cacheControl:()=>"no-store",
        showBanner:(message,type)=>{console[type==="error"?"error":"warn"](message);if(type==="error")state.errors.push(message);}
      },progress=>{ui.gameProgress.textContent=Math.round(progress*100)+"%";});
      window.unityInstance=instance;state.engineReady=true;state.phase="playing";
      ui.loading.hidden=true;ui.menuButton.hidden=false;layout();syncPause();
    }catch(error){state.engineReady=false;ui.game.hidden=true;ui.launcher.hidden=false;document.body.classList.remove("playing");fail(error);}
  }
  // Desktop: Space mirrors touch-and-hold (squat, release to jump, hold to tuck, release to land)
  // by forwarding press/release to the game's mouse input at a point clear of on-screen buttons.
  const SPACE_POINT={x:0.5,y:0.2};
  let spaceHeld=false;
  function spacePointer(type){
    const r=ui.canvas.getBoundingClientRect();
    ui.canvas.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window,button:0,buttons:type==="mousedown"?1:0,clientX:r.left+r.width*SPACE_POINT.x,clientY:r.top+r.height*SPACE_POINT.y}));
  }
  function releaseSpace(){if(!spaceHeld)return;spaceHeld=false;spacePointer("mouseup");}
  window.addEventListener("keydown",event=>{
    if(event.code!=="Space"||!state.engineReady||state.menuOpen)return;
    event.preventDefault();
    if(event.repeat||spaceHeld)return;
    spaceHeld=true;spacePointer("mousedown");
  },true);
  window.addEventListener("keyup",event=>{
    if(event.code!=="Space"||!spaceHeld)return;
    event.preventDefault();releaseSpace();
  },true);
  window.addEventListener("blur",releaseSpace);
  async function leaveGame(){
    releaseSpace();state.menuOpen=false;ui.menu.close();ui.menuButton.hidden=true;
    if(instance){await instance.Quit();instance=null;window.unityInstance=null;}
    state.engineReady=false;state.paused=false;
    if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
    ui.game.hidden=true;ui.launcher.hidden=false;document.body.classList.remove("playing");await refresh();
  }
  ui.download.addEventListener("click",download);
  ui.play.addEventListener("click",play);
  ui.canvas.addEventListener("contextmenu",event=>event.preventDefault());
  ui.menuButton.addEventListener("click",()=>{releaseSpace();state.menuOpen=true;syncPause();$("fullscreen-help").hidden=Boolean(ui.game.requestFullscreen||ui.game.webkitRequestFullscreen)||installed();ui.menu.showModal();});
  $("resume").addEventListener("click",()=>{state.menuOpen=false;ui.menu.close();syncPause();});
  ui.menu.addEventListener("cancel",()=>{state.menuOpen=false;syncPause();});
  $("fullscreen").addEventListener("click",()=>{requestFullscreen().then(ok=>{if(!ok)$("fullscreen-help").hidden=false;});});
  $("leave-game").addEventListener("click",()=>leaveGame().catch(fail));
  window.addEventListener("resize",layout);
  document.addEventListener("visibilitychange",()=>{if(document.hidden)releaseSpace();syncPause();if(!document.hidden&&!state.engineReady&&!downloadTask&&registration)refresh().catch(fail);});
  document.addEventListener("fullscreenchange",layout);
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;ui.install.hidden=installed();ui.install.textContent="Install app";});
  window.addEventListener("appinstalled",()=>{state.installed=true;ui.install.hidden=true;$("installed-state").textContent="Home Screen app · no ad breaks";});
  ui.install.addEventListener("click",async()=>{
    if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;}
    else{ui.help.open=true;ui.help.scrollIntoView({behavior:"smooth",block:"nearest"});}
  });
  ui.update.addEventListener("click",()=>{registration?.waiting?.postMessage({type:"ACTIVATE_UPDATE"});});
  window.addEventListener("online",()=>{if(!state.engineReady&&!downloadTask&&registration)refresh().catch(fail);});
  if("serviceWorker" in navigator){
    navigator.serviceWorker.addEventListener("message",event=>{
      if(event.data.type!=="CACHE_PROGRESS")return;
      state.downloadedBytes=event.data.loadedBytes;
      ui.progress.value=event.data.loadedBytes/release.totalBytes*100;
      status("Saving the game",mb(event.data.loadedBytes)+" of "+mb(release.totalBytes)+" · "+event.data.completedFiles+"/"+release.assets.length+" files");
    });
  }
  async function initialize(){
    if(!isSecureContext||!("serviceWorker" in navigator))throw Error("Open the HTTPS GitHub Pages link in Safari or Chrome to install and download this app.");
    registration=await navigator.serviceWorker.register(new URL("sw.js",base),{scope:base.pathname,updateViaCache:"none"});
    if(registration.waiting)ui.update.hidden=false;
    registration.addEventListener("updatefound",()=>{
      const worker=registration.installing;
      worker?.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)ui.update.hidden=false;});
    });
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener("controllerchange",resolve,{once:true}));
    let currentController=navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(currentController&&navigator.serviceWorker.controller!==currentController&&!state.engineReady)location.reload();
      currentController=navigator.serviceWorker.controller;
    });
    await refresh();
  }
  window.CrazyFlipsPWA={download,play,refresh,leaveGame};
  initialize().catch(fail);
})();
