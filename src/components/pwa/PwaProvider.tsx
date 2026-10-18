"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaContextValue = {
  canInstall: boolean;
  installHelpOpen: boolean;
  isIos: boolean;
  requestInstall: () => Promise<void>;
  setInstallHelpOpen: (open: boolean) => void;
};

const PwaContext = createContext<PwaContextValue | null>(null);

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean;
  };
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isIosDevice() {
  return (
    /iPad|iPhone|iPod/u.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export default function PwaProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [updateRegistration, setUpdateRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    const initialStateTimer = window.setTimeout(() => {
      setInstalled(isStandalone());
      setIsIos(isIosDevice());
    }, 0);

    const displayMode = window.matchMedia("(display-mode: standalone)");
    const handleDisplayMode = () => setInstalled(isStandalone());
    const handleInstallPrompt = (event: Event) => {
      const promptEvent = event as InstallPromptEvent;
      promptEvent.preventDefault();
      setInstallPrompt(promptEvent);
    };
    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setInstallHelpOpen(false);
    };

    displayMode.addEventListener("change", handleDisplayMode);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.clearTimeout(initialStateTimer);
      displayMode.removeEventListener("change", handleDisplayMode);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;
    let updateTimer: number | undefined;
    let reloading = false;

    const showUpdateWhenInstalled = (worker: ServiceWorker | null) => {
      if (!worker) return;
      const handleState = () => {
        if (
          worker.state === "installed" &&
          navigator.serviceWorker.controller &&
          registration
        ) {
          setUpdateRegistration(registration);
          setUpdateDismissed(false);
        }
      };
      worker.addEventListener("statechange", handleState);
      handleState();
    };

    const handleControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registered) => {
        registration = registered;
        if (registered.waiting && navigator.serviceWorker.controller) {
          setUpdateRegistration(registered);
        }
        registered.addEventListener("updatefound", () =>
          showUpdateWhenInstalled(registered.installing)
        );
        void registered.update();
        updateTimer = window.setInterval(
          () => void registered.update(),
          60 * 60 * 1_000
        );
      })
      .catch((error) => {
        console.error(
          "PWA-Aktualisierung konnte nicht gestartet werden:",
          error
        );
      });

    return () => {
      if (updateTimer) window.clearInterval(updateTimer);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
    };
  }, []);

  async function requestInstall() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallPrompt(null);
      return;
    }
    if (isIos) setInstallHelpOpen(true);
  }

  function activateUpdate() {
    const waiting = updateRegistration?.waiting;
    if (waiting) waiting.postMessage({ type: "SKIP_WAITING" });
    else void updateRegistration?.update();
  }

  const value: PwaContextValue = {
    canInstall: !installed && (Boolean(installPrompt) || isIos),
    installHelpOpen,
    isIos,
    requestInstall,
    setInstallHelpOpen,
  };

  return (
    <PwaContext.Provider value={value}>
      {children}
      {updateRegistration && !updateDismissed && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 z-[80] rounded-2xl border border-amber-300 bg-white p-4 shadow-2xl sm:left-auto sm:max-w-md"
        >
          <strong className="block text-[var(--ph-green-dark)]">
            Neue Hub-Version verfügbar
          </strong>
          <p className="mt-1 text-sm text-slate-600">
            Jetzt aktualisieren, um die neuesten Funktionen zu verwenden.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={activateUpdate}
              className="rounded-xl bg-[var(--ph-green-dark)] px-4 py-2.5 text-sm font-bold text-white"
            >
              Jetzt aktualisieren
            </button>
            <button
              type="button"
              onClick={() => setUpdateDismissed(true)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"
            >
              Später
            </button>
          </div>
        </aside>
      )}
    </PwaContext.Provider>
  );
}

export function PwaInstallButton() {
  const pwa = useContext(PwaContext);
  if (!pwa?.canInstall) return null;

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <button
        type="button"
        onClick={() => void pwa.requestInstall()}
        className="w-full rounded-lg border border-white/30 px-3 py-2 text-left text-xs font-bold text-white transition hover:bg-white/10"
      >
        App auf diesem Gerät installieren
      </button>
      {pwa.isIos && pwa.installHelpOpen && (
        <div className="mt-2 rounded-lg bg-white/10 p-3 text-xs leading-relaxed text-white/85">
          In Safari unten auf „Teilen“ tippen und anschließend „Zum
          Home-Bildschirm“ auswählen.
          <button
            type="button"
            onClick={() => pwa.setInstallHelpOpen(false)}
            className="mt-2 block font-bold text-white underline underline-offset-2"
          >
            Verstanden
          </button>
        </div>
      )}
    </div>
  );
}
