import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function UndoTransfer() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [oldHolderName, setOldHolderName] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing undo token in link.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("undo-transfer", {
          body: { token },
        });
        if (cancelled) return;
        if (error || data?.error) {
          setState("error");
          setMessage(data?.error || error?.message || "Could not undo this transfer.");
          return;
        }
        setState("success");
        setMessage(data?.message || "Transfer reversed.");
        setOldHolderName(data?.oldHolderName || null);
      } catch (e: any) {
        if (cancelled) return;
        setState("error");
        setMessage(e?.message || "Something went wrong.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center px-4 py-16 font-serif">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="bg-[#1a1a1a] px-8 py-6 text-center">
          <h1 className="text-white text-2xl tracking-[0.2em] font-normal">COSMICO</h1>
        </div>

        <div className="px-8 py-10 text-center">
          {state === "loading" && (
            <>
              <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin text-[#1a1a1a]" />
              <h2 className="text-xl text-[#1a1a1a] mb-2">Reversing transfer…</h2>
              <p className="text-[#888] text-sm">Hang tight.</p>
            </>
          )}

          {state === "success" && (
            <>
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-600" />
              <h2 className="text-xl text-[#1a1a1a] mb-3">Transfer reversed</h2>
              <p className="text-[#4a4a4a] leading-relaxed mb-6">
                {oldHolderName
                  ? `Your ticket has been returned to ${oldHolderName}.`
                  : message}
              </p>
              <Link
                to="/my-tickets"
                className="inline-block bg-[#1a1a1a] text-white px-8 py-3 rounded text-sm tracking-wider"
              >
                VIEW MY TICKETS
              </Link>
            </>
          )}

          {state === "error" && (
            <>
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-amber-600" />
              <h2 className="text-xl text-[#1a1a1a] mb-3">Couldn't undo this transfer</h2>
              <p className="text-[#4a4a4a] leading-relaxed mb-6">{message}</p>
              <a
                href="mailto:hello@example.org"
                className="inline-block border border-[#1a1a1a] text-[#1a1a1a] px-8 py-3 rounded text-sm tracking-wider"
              >
                CONTACT SUPPORT
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
