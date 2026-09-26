(() => {
  "use strict";
  const status = document.querySelector("#network-status");
  const update = document.querySelector("#update-status");
  let restoreTimer;
  let updating = false;

  function showNetworkStatus() {
    clearTimeout(restoreTimer);
    status.hidden = false;
    status.textContent = navigator.onLine ? "网络已恢复" : "离线模式";
    if (navigator.onLine) restoreTimer = setTimeout(() => { status.hidden = true; }, 2000);
  }
  if (!navigator.onLine) showNetworkStatus();
  window.addEventListener("offline", showNetworkStatus);
  window.addEventListener("online", showNetworkStatus);

  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").then((registration) => {
    const showUpdate = () => { if (navigator.serviceWorker.controller && registration.waiting) update.hidden = false; };
    showUpdate();
    registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", showUpdate);
    });
    document.querySelector("#update-now").addEventListener("click", () => {
      if (!registration.waiting) return;
      updating = true;
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (updating) location.reload(); });
  }).catch((error) => console.warn("Offline install unavailable", error));
})();
