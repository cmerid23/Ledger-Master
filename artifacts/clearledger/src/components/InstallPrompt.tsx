import { useState, useEffect } from "react";
import { X, Download, Share } from "lucide-react";

const STORAGE_KEY = "cl-install-dismissed";
const SHOW_DELAY_MS = 30_000;

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const ios = isIOS();

  useEffect(() => {
    if (isInStandaloneMode()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  async function handleInstall() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") dismiss();
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[200] safe-area-bottom"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto max-w-lg m-3 rounded-2xl bg-card border border-border shadow-2xl p-4 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-primary font-bold text-sm">CL</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Install ClearLedger</p>
            {ios ? (
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                Tap <Share className="w-3.5 h-3.5 text-blue-500 inline flex-shrink-0" /> then
                <strong>&ldquo;Add to Home Screen&rdquo;</strong>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">Get faster access — install the app</p>
            )}
          </div>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!ios && deferredPrompt && (
          <div className="mt-3 flex gap-2">
            <button onClick={dismiss}
              className="flex-1 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors">
              Not now
            </button>
            <button onClick={handleInstall}
              className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <Download className="w-4 h-4" />
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
