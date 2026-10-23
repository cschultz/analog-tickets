// The package root selects its Node renderer during SSR, pulling pngjs into the
// Worker bundle. We only need the pure matrix encoder for the inline SVG.
import { create as createQrMatrix } from "qrcode/lib/core/qrcode.js";
import { PASS_CODE_RE } from "./checkin-core";

/** QR payload is the opaque code only. No URL, labels, identifiers, networking or persistence. */
export function buildOwnerPassQr(code: unknown): { size: number; path: string } | null {
  if (typeof code !== "string" || !PASS_CODE_RE.test(code)) return null;
  try {
    const { modules } = createQrMatrix([{ data: new TextEncoder().encode(code), mode: "byte" }], {
      errorCorrectionLevel: "M",
      version: 3,
    });
    // Fixed 29-module symbol plus four-module white quiet zone on every side.
    if (modules.size !== 29 || modules.data.length !== 29 * 29) return null;
    let path = "";
    for (let y = 0; y < modules.size; y++)
      for (let x = 0; x < modules.size; x++)
        if (modules.get(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    return { size: 37, path };
  } catch {
    return null;
  }
}
