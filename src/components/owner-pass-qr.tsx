import { buildOwnerPassQr } from "@/lib/owner-pass-qr";

/** Synchronous SVG rendering: code changes/unmount cannot leave a stale asynchronous bitmap. */
export function OwnerPassQr({ code }: { code: string }) {
  const qr = buildOwnerPassQr(code);
  if (!qr) return <p>QR unavailable. Use the manual code with authorized door staff.</p>;
  return (
    <svg
      role="img"
      aria-label="Admission QR code"
      width="222"
      height="222"
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      className="mx-auto my-3 block max-w-full"
      style={{ height: "auto", aspectRatio: "1" }}
      shapeRendering="crispEdges"
    >
      <title>Admission QR code</title>
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
  );
}
