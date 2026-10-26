let loaderPromise: Promise<void> | null = null;

const scriptId = "laura-google-maps-javascript";
const callbackName = "__lauraGoogleMapsReady";

type GoogleWindow = Window & typeof globalThis & {
  [callbackName]?: () => void;
  gm_authFailure?: () => void;
};

function googleMapsAvailable(): boolean {
  const candidate = window as unknown as {google?: {maps?: {importLibrary?: unknown}}};
  return typeof candidate.google?.maps?.importLibrary === "function";
}

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps can only load in a browser."));
  if (googleMapsAvailable()) return Promise.resolve();
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<void>((resolve, reject) => {
    const mapsWindow = window as GoogleWindow;
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const fail = (message: string) => {
      loaderPromise = null;
      reject(new Error(message));
    };

    mapsWindow[callbackName] = () => {
      delete mapsWindow[callbackName];
      if (!googleMapsAvailable()) {
        fail("Google Maps loaded without its library interface.");
        return;
      }
      resolve();
    };
    mapsWindow.gm_authFailure = () => fail("Google Maps rejected this key or website. Check billing and website/API restrictions.");

    if (existing) {
      existing.addEventListener("error", () => fail("Google Maps could not be downloaded."), {once: true});
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&libraries=geometry&language=en&region=AU&auth_referrer_policy=origin&callback=${callbackName}`;
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.addEventListener("error", () => fail("Google Maps could not be downloaded."), {once: true});
    document.head.append(script);
  });

  return loaderPromise;
}
