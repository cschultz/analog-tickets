import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function UpgradeSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [ticketsUpgraded, setTicketsUpgraded] = useState(0);

  useEffect(() => {
    if (sessionId) {
      verifyPayment();
    } else {
      setStatus("error");
    }
  }, [sessionId]);

  const verifyPayment = async () => {
    const { data, error } = await supabase.functions.invoke("process-upgrade-payment", {
      body: { sessionId },
    });

    if (error || !data?.success) {
      setStatus("error");
    } else {
      setTicketsUpgraded(data.ticketsUpgraded || 0);
      setStatus("success");
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <p className="mt-4 text-lg">Processing your upgrade...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-16 w-16 mx-auto text-destructive" />
            <h1 className="mt-4 text-2xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-muted-foreground">
              We couldn't process your upgrade. Please contact us for assistance.
            </p>
            <Button asChild className="mt-6">
              <Link to="/">Return Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <CheckCircle className="h-16 w-16 mx-auto text-green-600" />
          <h1 className="mt-4 text-2xl font-bold">Upgrade Complete!</h1>
          <p className="mt-2 text-muted-foreground">
            {ticketsUpgraded} ticket{ticketsUpgraded !== 1 ? "s" : ""} upgraded to Dinner & Party.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            You'll receive a confirmation email shortly.
          </p>
          <Button asChild className="mt-6">
            <Link to="/">Return Home</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
