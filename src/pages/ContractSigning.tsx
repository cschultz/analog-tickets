import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface Contract {
  id: string;
  title: string;
  content_html: string | null;
  pdf_path: string | null;
  requires_countersign: boolean;
  status: string;
  expires_at: string | null;
  entity_type: string;
}

interface EventDetails {
  title: string;
  event_date: string;
}

export default function ContractSigning() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<Contract | null>(null);
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(false);
  
  // Signature form
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (token) {
      loadContract();
    } else {
      setError("Invalid contract link");
      setLoading(false);
    }
  }, [token]);

  const loadContract = async () => {
    try {
      // Validate token and get contract
      const { data: contractData, error: contractError } = await supabase
        .rpc("validate_contract_token", { p_token: token });
      
      if (contractError || !contractData?.length) {
        setError("This contract link is invalid or has expired");
        setLoading(false);
        return;
      }

      const contractId = contractData[0].contract_id;

      // Fetch contract details
      const { data: contract, error: fetchError } = await supabase
        .from("contracts")
        .select("*, event_details:event_id(title, event_date)")
        .eq("id", contractId)
        .single();

      if (fetchError || !contract) {
        setError("Contract not found");
        setLoading(false);
        return;
      }

      // Check if already signed
      if (["signed", "countersigned", "completed"].includes(contract.status)) {
        setSigned(true);
      }

      setContract(contract);
      setEventDetails(contract.event_details as unknown as EventDetails);

      // If PDF, get signed URL
      if (contract.pdf_path) {
        const { data: urlData } = await supabase.storage
          .from("production-documents")
          .createSignedUrl(contract.pdf_path, 3600);
        if (urlData?.signedUrl) {
          setPdfUrl(urlData.signedUrl);
        }
      }

      // Mark as viewed if not already
      if (contract.status === "sent") {
        await supabase
          .from("contracts")
          .update({ status: "viewed", viewed_at: new Date().toISOString() })
          .eq("id", contractId);
      }
    } catch (err) {
      console.error("Error loading contract:", err);
      setError("Failed to load contract");
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async () => {
    if (!signerName.trim() || !signerEmail.trim() || !agreed) {
      toast.error("Please fill in all required fields and agree to the terms");
      return;
    }

    if (!contract) return;

    setSubmitting(true);
    try {
      // Insert signature
      const { error: sigError } = await supabase
        .from("contract_signatures")
        .insert([{
          contract_id: contract.id,
          signer_type: "recipient",
          signer_name: signerName.trim(),
          signer_email: signerEmail.trim(),
          signer_title: signerTitle.trim() || null,
          ip_address: null, // Would need server-side to capture
          user_agent: navigator.userAgent,
        }]);

      if (sigError) throw sigError;

      // Update contract status
      const newStatus = contract.requires_countersign ? "signed" : "completed";
      const { error: updateError } = await supabase
        .from("contracts")
        .update({ status: newStatus })
        .eq("id", contract.id);

      if (updateError) throw updateError;

      setSigned(true);
      toast.success("Contract signed successfully!");
    } catch (err: any) {
      console.error("Error signing contract:", err);
      toast.error("Failed to sign contract: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading contract...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Unable to Load Contract</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Contract Signed!</h2>
            <p className="text-muted-foreground mb-4">
              Thank you for signing the contract. 
              {contract?.requires_countersign && 
                " We will send you a fully executed copy once countersigned."}
            </p>
            {eventDetails && (
              <p className="text-sm text-muted-foreground">
                {eventDetails.title} • {format(new Date(eventDetails.event_date), "MMMM d, yyyy")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">{contract?.title}</h1>
          {eventDetails && (
            <p className="text-muted-foreground">
              {eventDetails.title} • {format(new Date(eventDetails.event_date), "MMMM d, yyyy")}
            </p>
          )}
          {contract?.expires_at && (
            <p className="text-sm text-[hsl(var(--admin-warning))] mt-2">
              Please sign by {format(new Date(contract.expires_at), "MMMM d, yyyy")}
            </p>
          )}
        </div>

        {/* Contract Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Contract Terms
            </CardTitle>
            <CardDescription>
              Please review the contract carefully before signing
            </CardDescription>
          </CardHeader>
          <CardContent>
            {contract?.content_html ? (
              <div 
                className="prose prose-sm max-w-none p-4 bg-muted/30 rounded-lg max-h-[60vh] overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(contract.content_html) }}
              />
            ) : pdfUrl ? (
              <div className="w-full h-[60vh]">
                <iframe
                  src={pdfUrl}
                  className="w-full h-full rounded-lg border"
                  title="Contract PDF"
                />
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No contract content available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Signature Form */}
        <Card>
          <CardHeader>
            <CardTitle>Sign This Contract</CardTitle>
            <CardDescription>
              By signing below, you agree to all terms and conditions stated above
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="signer-name">Full Legal Name *</Label>
                <Input
                  id="signer-name"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signer-email">Email Address *</Label>
                <Input
                  id="signer-email"
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="signer-title">Title/Position (optional)</Label>
              <Input
                id="signer-title"
                value={signerTitle}
                onChange={(e) => setSignerTitle(e.target.value)}
                placeholder="e.g., Owner, Manager"
              />
            </div>

            <div className="flex items-start space-x-3 pt-4">
              <Checkbox
                id="agree"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked === true)}
              />
              <Label htmlFor="agree" className="text-sm leading-relaxed">
                I have read and agree to the terms and conditions of this contract. 
                I understand that by typing my name and clicking "Sign Contract", 
                I am creating a legally binding electronic signature.
              </Label>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleSign}
              disabled={submitting || !agreed || !signerName.trim() || !signerEmail.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Signing...
                </>
              ) : (
                "Sign Contract"
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              Your signature will be timestamped and recorded for legal purposes.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
