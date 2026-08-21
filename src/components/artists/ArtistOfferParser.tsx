import { useState } from "react";
import { 
  AdminButton,
  AdminTextarea,
  AdminCard,
  AdminCardContent,
  AdminCardDescription,
  AdminCardHeader,
  AdminCardTitle,
  AdminBadge,
} from "@/components/admin";
import { Loader2, FileText, Check, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ParsedOffer {
  artist_name: string;
  offer_amount: number | null;
  performance_date: string | null;
  set_time: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
}

interface ArtistOfferParserProps {
  eventId?: string;
  onOfferCreated?: () => void;
}

export function ArtistOfferParser({ eventId, onOfferCreated }: ArtistOfferParserProps) {
  const [offerText, setOfferText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<{
    offer: any;
    parsed: ParsedOffer;
    artistMatched: boolean;
  } | null>(null);

  const handleParse = async () => {
    if (!offerText.trim()) {
      toast.error("Please paste an offer to parse");
      return;
    }

    setIsParsing(true);
    setParsedResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in to parse offers");
        return;
      }

      const { data, error } = await supabase.functions.invoke('parse-artist-offer', {
        body: { offerText, eventId }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      setParsedResult(data);
      toast.success(`Offer for ${data.parsed.artist_name} created successfully!`);
      onOfferCreated?.();
      
    } catch (error) {
      console.error('Parse error:', error);
      toast.error(error instanceof Error ? error.message : "Failed to parse offer");
    } finally {
      setIsParsing(false);
    }
  };

  const handleClear = () => {
    setOfferText("");
    setParsedResult(null);
  };

  return (
    <div className="space-y-4">
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Parse Artist Offer
          </AdminCardTitle>
          <AdminCardDescription>
            Paste an offer email or document and AI will extract all the details
          </AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <AdminTextarea
            placeholder="Paste the offer text here...

Example:
OFFER
Artist: Band Name
Festival: Event Name
Date: May 17, 2025
Offer: $4,000 + lodging
..."
            value={offerText}
            onChange={(e) => setOfferText(e.target.value)}
            className="min-h-[200px] font-mono text-sm"
          />
          
          <div className="flex gap-2">
            <AdminButton 
              variant="admin"
              onClick={handleParse} 
              disabled={isParsing || !offerText.trim()}
            >
              {isParsing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Parse Offer
                </>
              )}
            </AdminButton>
            
            {(offerText || parsedResult) && (
              <AdminButton variant="adminOutline" onClick={handleClear}>
                Clear
              </AdminButton>
            )}
          </div>
        </AdminCardContent>
      </AdminCard>

      {parsedResult && (
        <AdminCard className="border-[hsl(var(--admin-success)/0.3)] bg-[hsl(var(--admin-success)/0.05)]">
          <AdminCardHeader>
            <AdminCardTitle className="flex items-center gap-2 text-[hsl(var(--admin-success))]">
              <Check className="h-5 w-5" />
              Offer Created Successfully
            </AdminCardTitle>
          </AdminCardHeader>
          <AdminCardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-[hsl(var(--admin-text-muted))]">Artist:</span>
                <span className="ml-2 font-medium">{parsedResult.parsed.artist_name}</span>
                {parsedResult.artistMatched ? (
                  <AdminBadge intent="neutral" className="ml-2 text-xs">Linked</AdminBadge>
                ) : (
                  <AdminBadge intent="neutral" className="ml-2 text-xs">New</AdminBadge>
                )}
              </div>
              
              {parsedResult.parsed.offer_amount && (
                <div>
                  <span className="text-[hsl(var(--admin-text-muted))]">Amount:</span>
                  <span className="ml-2 font-medium">
                    ${parsedResult.parsed.offer_amount.toLocaleString()}
                  </span>
                </div>
              )}
              
              {parsedResult.parsed.performance_date && (
                <div>
                  <span className="text-[hsl(var(--admin-text-muted))]">Date:</span>
                  <span className="ml-2 font-medium">
                    {new Date(parsedResult.parsed.performance_date).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}
                  </span>
                </div>
              )}
              
              {parsedResult.parsed.set_time && (
                <div>
                  <span className="text-[hsl(var(--admin-text-muted))]">Set Time:</span>
                  <span className="ml-2 font-medium">{parsedResult.parsed.set_time}</span>
                </div>
              )}
              
              {(parsedResult.parsed.venue_name || parsedResult.parsed.city) && (
                <div className="col-span-2">
                  <span className="text-[hsl(var(--admin-text-muted))]">Venue:</span>
                  <span className="ml-2 font-medium">
                    {[parsedResult.parsed.venue_name, parsedResult.parsed.city, parsedResult.parsed.state]
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </div>
              )}
            </div>
            
            <div className="pt-2 border-t">
              <AdminButton variant="adminOutline" size="sm" onClick={handleClear}>
                Parse Another Offer
              </AdminButton>
            </div>
          </AdminCardContent>
        </AdminCard>
      )}
    </div>
  );
}
