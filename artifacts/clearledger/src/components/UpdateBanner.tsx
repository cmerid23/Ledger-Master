import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

export function UpdateBanner() {
  const [show, setShow] = useState(false);
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.getRegistration().then((r) => {
      if (!r) return;
      setReg(r);

      function onUpdateFound() {
        const newWorker = r!.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            setShow(true);
          }
        });
      }

      r.addEventListener("updatefound", onUpdateFound);
      if (r.waiting && navigator.serviceWorker.controller) setShow(true);
    });

    // Also catch future registrations
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }, []);

  function applyUpdate() {
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      window.location.reload();
    }
  }

  if (!show) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[300] flex items-center justify-between gap-3 bg-emerald-600 text-white px-4 py-2.5 text-sm shadow-lg">
      <span className="font-medium">A new version is available</span>
      <button
        onClick={applyUpdate}
        className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors font-medium text-xs whitespace-nowrap"
      >
        <RefreshCw className="w-3.5 h-3.5" />
        Update Now
      </button>
    </div>
  );
}
