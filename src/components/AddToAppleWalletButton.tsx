import { useMemo, useState } from "react";
import { Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getSupabaseUrl, getSupabaseAnonKey } from "@/platform/config/env";

interface AddToAppleWalletButtonProps {
  ticketId: string;
  holderName?: string;
  /** Pretty ticket type label, e.g. "VIP — 3 Day". Shown in the confirmation. */
  ticketTypeLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  variant?: "badge" | "full";
  /**
   * If true, the button is shown on every platform (label adapts).
   * If false (default), only renders on iOS/iPadOS/macOS where Wallet is supported.
   */
  alwaysVisible?: boolean;
  /**
   * If true, prompts a confirmation dialog before downloading. Use this when the
   * holder has multiple tickets so they can verify they're grabbing the right one.
   */
  requireConfirm?: boolean;
}

const SUPABASE_URL = getSupabaseUrl();
const ANON_KEY = getSupabaseAnonKey();

function detectApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = (navigator as any).platform || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  const isMac = /Macintosh/.test(ua);
  return isIOS || isMac;
}

/**
 * Apple Wallet "Add" button.
 * Hits the generate-apple-wallet-pass edge function and triggers a .pkpass download.
 * iOS Safari opens the file in Wallet automatically; on desktop we save the file
 * with a friendly message about emailing it to your phone.
 *
 * When `requireConfirm` is true, an AlertDialog asks the user to confirm the
 * attendee + ticket type before the pass is generated.
 */
export function AddToAppleWalletButton({
  ticketId,
  holderName,
  ticketTypeLabel,
  className,
  style,
  variant = "badge",
  alwaysVisible = true,
  requireConfirm = false,
}: AddToAppleWalletButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isApple = useMemo(detectApplePlatform, []);

  if (!alwaysVisible && !isApple) return null;

  const downloadPass = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const url = `${SUPABASE_URL}/functions/v1/generate-apple-wallet-pass?ticket_id=${encodeURIComponent(ticketId)}`;
      const res = await fetch(url, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const safeName = (holderName || "ticket")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "ticket";
      const fileName = `analog-commons-${safeName}.pkpass`;
      const objectUrl = URL.createObjectURL(
        new Blob([blob], { type: "application/vnd.apple.pkpass" }),
      );
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
      if (isApple) {
        toast.success(
          holderName
            ? `Pass for ${holderName} downloaded — open it to add to Apple Wallet.`
            : "Pass downloaded — open it to add to Apple Wallet.",
        );
      } else {
        toast.success("Pass downloaded. Email it to yourself to open on iPhone.");
      }
    } catch (err: any) {
      console.error("Apple Wallet pass error:", err);
      toast.error("Couldn't generate Apple Wallet pass. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    if (loading) return;
    if (requireConfirm) {
      setConfirmOpen(true);
    } else {
      void downloadPass();
    }
  };

  // Apple-style black pill, per Apple Wallet guidelines.
  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#000",
    color: "#fff",
    borderRadius: 8,
    padding: variant === "full" ? "10px 16px" : "6px 10px",
    fontSize: variant === "full" ? 13 : 11,
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif",
    fontWeight: 500,
    letterSpacing: 0.2,
    border: "1px solid #000",
    cursor: loading ? "wait" : "pointer",
    opacity: loading ? 0.7 : 1,
    transition: "opacity 0.15s ease",
    whiteSpace: "nowrap",
    ...style,
  };

  const label = loading
    ? "Preparing…"
    : isApple
    ? "Add to Apple Wallet"
    : "Download Wallet pass";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={className}
        style={baseStyle}
        aria-label={label}
        title={isApple ? "Add to Apple Wallet" : "Download .pkpass — open on iPhone to add to Wallet"}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : isApple ? (
          <svg
            width={variant === "full" ? 16 : 14}
            height={variant === "full" ? 16 : 14}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M17.05 12.04c-.03-2.74 2.24-4.06 2.34-4.13-1.28-1.87-3.27-2.13-3.97-2.16-1.69-.17-3.3.99-4.16.99-.86 0-2.18-.97-3.59-.94-1.85.03-3.55 1.07-4.5 2.72-1.92 3.33-.49 8.26 1.38 10.96.92 1.32 2.01 2.81 3.43 2.76 1.38-.06 1.9-.89 3.57-.89 1.66 0 2.13.89 3.59.86 1.49-.03 2.42-1.34 3.32-2.67 1.05-1.53 1.48-3.01 1.5-3.09-.03-.01-2.88-1.1-2.91-4.41ZM14.3 4.27c.76-.92 1.27-2.2 1.13-3.47-1.09.04-2.41.73-3.2 1.65-.71.81-1.33 2.11-1.16 3.36 1.22.09 2.46-.62 3.23-1.54Z" />
          </svg>
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        <span>{label}</span>
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Download this Wallet pass?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  You have multiple tickets. Confirm you're grabbing the pass for the right
                  attendee — each ticket has its own QR code.
                </p>
                <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1">
                  <div>
                    <span className="text-muted-foreground">Attendee: </span>
                    <span className="font-medium text-foreground">
                      {holderName || "Unnamed guest"}
                    </span>
                  </div>
                  {ticketTypeLabel && (
                    <div>
                      <span className="text-muted-foreground">Ticket: </span>
                      <span className="font-medium text-foreground">{ticketTypeLabel}</span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground pt-1">
                    Pass ID: {ticketId.slice(0, 8).toUpperCase()}
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                setConfirmOpen(false);
                void downloadPass();
              }}
            >
              {isApple ? "Add to Apple Wallet" : "Download pass"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default AddToAppleWalletButton;
