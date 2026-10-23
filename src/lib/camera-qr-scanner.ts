/**
 * QR capture for the private Box Office surface.
 *
 * This module is client-only. It requests a camera only after an authorized
 * staff member explicitly starts scanning, accepts only a QR payload in memory,
 * and stops every camera track after the first payload, failure, cancellation,
 * or unmount. It owns no storage, network request, analytics, or logging.
 */

type DetectedBarcode = { rawValue?: string };
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
};
interface BarcodeDetectorConstructor {
  new (options: { formats: readonly string[] }): BarcodeDetectorInstance;
}

type QrWindow = Window & { BarcodeDetector?: BarcodeDetectorConstructor };
type QrDecoder = {
  detect(video: HTMLVideoElement): Promise<DetectedBarcode[]>;
  dispose(): void;
  /** JavaScript decoding is throttled so it does not monopolize a phone CPU. */
  minimumFrameIntervalMs: number;
};

export interface NativeQrScannerCapabilities {
  getUserMedia?: unknown;
  BarcodeDetector?: unknown;
}

/** Pure capability check so unsupported browsers safely retain manual entry. */
export function hasNativeQrScanner(capabilities: NativeQrScannerCapabilities): boolean {
  return (
    typeof capabilities.getUserMedia === "function" &&
    typeof capabilities.BarcodeDetector === "function"
  );
}

function browserCapabilities(): NativeQrScannerCapabilities {
  if (typeof window === "undefined" || typeof navigator === "undefined") return {};
  return {
    getUserMedia: navigator.mediaDevices?.getUserMedia,
    BarcodeDetector: (window as QrWindow).BarcodeDetector,
  };
}

export function isNativeQrScannerSupported(): boolean {
  return hasNativeQrScanner(browserCapabilities());
}

async function createQrDecoder(): Promise<QrDecoder | null> {
  const Detector = (window as QrWindow).BarcodeDetector;
  if (typeof Detector === "function") {
    try {
      const detector = new Detector({ formats: ["qr_code"] });
      return {
        detect: (video) => detector.detect(video),
        dispose: () => undefined,
        minimumFrameIntervalMs: 0,
      };
    } catch {
      // A browser may expose BarcodeDetector but reject QR as a format.
    }
  }

  try {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    // Load only when a native QR detector is unavailable, after staff starts scanning.
    const { default: decodeQr } = await import("jsqr");
    return {
      minimumFrameIntervalMs: 120,
      dispose: () => {
        // Resizing clears the last captured pixels from the in-memory canvas.
        canvas.width = 0;
        canvas.height = 0;
      },
      detect: async (video) => {
        if (video.videoWidth < 1 || video.videoHeight < 1) return [];
        const scale = Math.min(1, 640 / video.videoWidth);
        const width = Math.max(1, Math.round(video.videoWidth * scale));
        const height = Math.max(1, Math.round(video.videoHeight * scale));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        context.drawImage(video, 0, 0, width, height);
        const image = context.getImageData(0, 0, width, height);
        const result = decodeQr(image.data, width, height, { inversionAttempts: "attemptBoth" });
        return result ? [{ rawValue: result.data }] : [];
      },
    };
  } catch {
    return null;
  }
}

export interface CameraQrScannerSession {
  stop(): void;
}

/** Stop scanning when staff leaves the page; returning never restarts the camera. */
export function stopCameraWhenBackgrounded(
  stop: () => void,
  page: Document,
  browser: Window,
): () => void {
  const onVisibilityChange = () => {
    if (page.visibilityState === "hidden") stop();
  };
  const onPageHide = () => stop();
  page.addEventListener("visibilitychange", onVisibilityChange);
  browser.addEventListener("pagehide", onPageHide);
  onVisibilityChange();
  return () => {
    page.removeEventListener("visibilitychange", onVisibilityChange);
    browser.removeEventListener("pagehide", onPageHide);
  };
}

export interface StartCameraQrScannerOptions {
  video: HTMLVideoElement;
  /** Stops a granted camera even when cancellation precedes permission resolution. */
  signal?: AbortSignal;
  onCode(rawValue: string): void;
  onUnavailable(): void;
}

/**
 * Starts a single QR-only scan loop. The raw value stays in the callback scope;
 * the route validates it with the existing opaque-pass parser before submission.
 */
export async function startCameraQrScanner(
  options: StartCameraQrScannerOptions,
): Promise<CameraQrScannerSession | null> {
  if (options.signal?.aborted || typeof browserCapabilities().getUserMedia !== "function")
    return null;

  const decoder = await createQrDecoder();
  if (!decoder) return null;
  if (options.signal?.aborted) {
    decoder.dispose();
    return null;
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
  } catch {
    decoder.dispose();
    return null;
  }

  if (options.signal?.aborted) {
    stream.getTracks().forEach((track) => track.stop());
    decoder.dispose();
    return null;
  }

  let active = true;
  let frame: number | null = null;

  const stop = () => {
    if (!active) return;
    active = false;
    options.signal?.removeEventListener("abort", stop);
    if (frame !== null) window.cancelAnimationFrame(frame);
    options.video.pause();
    options.video.srcObject = null;
    stream.getTracks().forEach((track) => track.stop());
    decoder.dispose();
  };

  options.signal?.addEventListener("abort", stop, { once: true });
  if (options.signal?.aborted) {
    stop();
    return null;
  }

  try {
    options.video.muted = true;
    options.video.playsInline = true;
    options.video.srcObject = stream;
    await options.video.play();
  } catch {
    stop();
    return null;
  }
  if (!active) return null;

  let lastScanAt = -Infinity;
  const scheduleFrame = () => {
    frame = window.requestAnimationFrame((now) => {
      void scanFrame(now);
    });
  };
  const scanFrame = async (now: number) => {
    if (!active) return;
    if (now - lastScanAt < decoder.minimumFrameIntervalMs) {
      scheduleFrame();
      return;
    }
    lastScanAt = now;
    try {
      const matches = await decoder.detect(options.video);
      if (!active) return;
      const rawValue = matches.find(
        (match) => typeof match.rawValue === "string" && match.rawValue.length > 0,
      )?.rawValue;
      if (rawValue) {
        stop();
        options.onCode(rawValue);
        return;
      }
      scheduleFrame();
    } catch {
      stop();
      options.onUnavailable();
    }
  };

  scheduleFrame();
  return { stop };
}
