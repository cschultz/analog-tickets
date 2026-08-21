import QRCode from "react-qr-code";
import { AdminCard, AdminCardContent, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton } from "@/components/admin";
import { Download } from "lucide-react";

interface QRCodeDisplayProps {
  /** Per-ticket UUID (preferred) or registration ID. Used as the QR payload. */
  registrationId: string;
  name: string;
}

export const QRCodeDisplay = ({ registrationId, name }: QRCodeDisplayProps) => {
  // Per-ticket UUID is the standard payload — Box Office scanner reads raw UUIDs.
  const qrValue = registrationId;

  const downloadQRCode = () => {
    const svg = document.getElementById(`qr-${registrationId}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");

      const downloadLink = document.createElement("a");
      downloadLink.download = `qr-${name.replace(/\s+/g, '-')}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <AdminCard className="w-full max-w-sm mx-auto">
      <AdminCardHeader>
        <AdminCardTitle className="text-center">
          QR Code for {name}
        </AdminCardTitle>
      </AdminCardHeader>
      <AdminCardContent className="flex flex-col items-center gap-4">
        <div className="p-4 bg-white rounded-lg">
          <QRCode
            id={`qr-${registrationId}`}
            value={qrValue}
            size={200}
            level="H"
          />
        </div>
        <AdminButton
          onClick={downloadQRCode}
          variant="adminOutline"
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Download QR Code
        </AdminButton>
      </AdminCardContent>
    </AdminCard>
  );
};
