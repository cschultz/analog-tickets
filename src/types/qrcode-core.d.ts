declare module "qrcode/lib/core/qrcode.js" {
  import type { QRCode, QRCodeOptions, QRCodeSegment } from "qrcode";

  export function create(text: string | QRCodeSegment[], options?: QRCodeOptions): QRCode;
}
