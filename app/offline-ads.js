/* Complete legacy ad requests asynchronously, without rendering or fetching ads. */
self.installOfflineAdPolicy=function installOfflineAdPolicy(sdk){
  if(sdk.__crazyFlipsOfflineAds)return;
  sdk.__crazyFlipsOfflineAds=true;
  const initialize=sdk.init.bind(sdk);
  sdk.init=async function(...args){
    const result=await initialize(...args);
    sdk.ad.requestAd=async function(type,callbacks={}){
      // Preserve the asynchronous contract: game code may attach its continuation
      // immediately after requesting an ad.
      await new Promise(resolve=>setTimeout(resolve,0));
      callbacks.adStarted?.();
      await new Promise(resolve=>setTimeout(resolve,0));
      callbacks.adFinished?.();
      if(self.pwaState)self.pwaState.completedAdRequests=(self.pwaState.completedAdRequests||0)+1;
    };
    return result;
  };
};
