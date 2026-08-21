import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, Mail, User, Users, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface EmailSettings {
  id: string;
  signature_line: string;
  signature_name: string;
  talent_from_email: string;
  talent_from_name: string;
  production_from_email: string;
  production_from_name: string;
  guest_from_email: string;
  guest_from_name: string;
  artist_cc_emails: string[];
  vendor_cc_emails: string[];
  artisan_cc_emails: string[];
  volunteer_cc_emails: string[];
  partner_cc_emails: string[];
}

interface CCEmailInputProps {
  label: string;
  description?: string;
  emails: string[];
  onEmailsChange: (emails: string[]) => void;
}

function CCEmailInput({ label, description, emails, onEmailsChange }: CCEmailInputProps) {
  const [inputValue, setInputValue] = useState("");

  const addEmail = () => {
    const email = inputValue.trim().toLowerCase();
    if (email && email.includes("@") && !emails.includes(email)) {
      onEmailsChange([...emails, email]);
      setInputValue("");
    }
  };

  const removeEmail = (emailToRemove: string) => {
    onEmailsChange(emails.filter((e) => e !== emailToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addEmail();
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm">{label}</Label>
      {description && (
        <p className="text-xs text-[hsl(var(--admin-text-muted))]">{description}</p>
      )}
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="email@example.com"
          className="flex-1"
        />
        <Button type="button" variant="adminOutline" size="sm" onClick={addEmail}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {emails.map((email) => (
            <Badge
              key={email}
              variant="secondary"
              className="flex items-center gap-1 py-1 px-2"
            >
              {email}
              <button
                type="button"
                onClick={() => removeEmail(email)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmailSignatureSettings() {
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [signatureLine, setSignatureLine] = useState("");
  const [signatureName, setSignatureName] = useState("");
  
  // Sender settings.
  // DEMO-ONLY DEFAULTS: placeholder identities on the reserved example.org
  // domain. Real sender addresses are configured per deployment (and enforced
  // by backend email configuration), never hardcoded here.
  const [talentFromEmail, setTalentFromEmail] = useState("talent@example.org");
  const [talentFromName, setTalentFromName] = useState("Demo Organizer");
  const [productionFromEmail, setProductionFromEmail] = useState("team@example.org");
  const [productionFromName, setProductionFromName] = useState("Analog Team");
  const [guestFromEmail, setGuestFromEmail] = useState("hello@example.org");
  const [guestFromName, setGuestFromName] = useState("Analog");
  
  // CC email settings per production type
  const [artistCcEmails, setArtistCcEmails] = useState<string[]>([]);
  const [vendorCcEmails, setVendorCcEmails] = useState<string[]>([]);
  const [artisanCcEmails, setArtisanCcEmails] = useState<string[]>([]);
  const [volunteerCcEmails, setVolunteerCcEmails] = useState<string[]>([]);
  const [partnerCcEmails, setPartnerCcEmails] = useState<string[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("email_settings")
        .select("*")
        .limit(1)
        .single();

      if (error) throw error;

      if (data) {
        setSettings(data as EmailSettings);
        setSignatureLine(data.signature_line);
        setSignatureName(data.signature_name);
        
        // Sender settings.
  // DEMO-ONLY DEFAULTS: placeholder identities on the reserved example.org
  // domain. Real sender addresses are configured per deployment (and enforced
  // by backend email configuration), never hardcoded here.
        setTalentFromEmail(data.talent_from_email || "talent@example.org");
        setTalentFromName(data.talent_from_name || "Demo Organizer");
        setProductionFromEmail(data.production_from_email || "team@example.org");
        setProductionFromName(data.production_from_name || "Analog Team");
        setGuestFromEmail(data.guest_from_email || "hello@example.org");
        setGuestFromName(data.guest_from_name || "Analog");
        
        // CC email settings
        setArtistCcEmails((data as any).artist_cc_emails || []);
        setVendorCcEmails((data as any).vendor_cc_emails || []);
        setArtisanCcEmails((data as any).artisan_cc_emails || []);
        setVolunteerCcEmails((data as any).volunteer_cc_emails || []);
        setPartnerCcEmails((data as any).partner_cc_emails || []);
      }
    } catch (error) {
      console.error("Error fetching email settings:", error);
      toast.error("Failed to load email settings");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("email_settings")
        .update({
          signature_line: signatureLine,
          signature_name: signatureName,
          talent_from_email: talentFromEmail,
          talent_from_name: talentFromName,
          production_from_email: productionFromEmail,
          production_from_name: productionFromName,
          guest_from_email: guestFromEmail,
          guest_from_name: guestFromName,
          artist_cc_emails: artistCcEmails,
          vendor_cc_emails: vendorCcEmails,
          artisan_cc_emails: artisanCcEmails,
          volunteer_cc_emails: volunteerCcEmails,
          partner_cc_emails: partnerCcEmails,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", settings.id);

      if (error) throw error;

      toast.success("Email settings updated");
    } catch (error) {
      console.error("Error saving email settings:", error);
      toast.error("Failed to save email settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminCardTitle>Email Settings</AdminCardTitle>
        <AdminCardDescription>
          Configure sender identities, CC recipients, signatures, and automation
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-6">
        {/* Sender Identity Section */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <User className="h-4 w-4" />
            Sender Identities (From)
          </h4>
          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
            Configure who emails appear to come from. These show as "Name &lt;email&gt;" in recipients' inboxes.
          </p>
          
          {/* Talent / Artist Emails */}
          <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))] space-y-3">
            <Label className="text-sm font-medium">Artist / Talent Emails</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="talentFromName" className="text-xs text-[hsl(var(--admin-text-muted))]">
                  From Name
                </Label>
                <Input
                  id="talentFromName"
                  value={talentFromName}
                  onChange={(e) => setTalentFromName(e.target.value)}
                  placeholder="Demo Organizer"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="talentFromEmail" className="text-xs text-[hsl(var(--admin-text-muted))]">
                  From Email
                </Label>
                <Input
                  id="talentFromEmail"
                  value={talentFromEmail}
                  onChange={(e) => setTalentFromEmail(e.target.value)}
                  placeholder="talent@example.org"
                />
              </div>
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Preview: <span className="font-mono">{talentFromName} &lt;{talentFromEmail}&gt;</span>
            </p>
          </div>

          {/* Production Emails (Vendors, Artisans, Partners, Volunteers) */}
          <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))] space-y-3">
            <Label className="text-sm font-medium">Production Emails (Vendors, Artisans, Partners, Volunteers)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="productionFromName" className="text-xs text-[hsl(var(--admin-text-muted))]">
                  From Name
                </Label>
                <Input
                  id="productionFromName"
                  value={productionFromName}
                  onChange={(e) => setProductionFromName(e.target.value)}
                  placeholder="Analog Team"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="productionFromEmail" className="text-xs text-[hsl(var(--admin-text-muted))]">
                  From Email
                </Label>
                <Input
                  id="productionFromEmail"
                  value={productionFromEmail}
                  onChange={(e) => setProductionFromEmail(e.target.value)}
                  placeholder="team@example.org"
                />
              </div>
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Preview: <span className="font-mono">{productionFromName} &lt;{productionFromEmail}&gt;</span>
            </p>
          </div>

          {/* Guest Emails (Ticket holders, Waitlist, etc) */}
          <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))] space-y-3">
            <Label className="text-sm font-medium">Guest Emails (Tickets, Confirmations, Reminders)</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="guestFromName" className="text-xs text-[hsl(var(--admin-text-muted))]">
                  From Name
                </Label>
                <Input
                  id="guestFromName"
                  value={guestFromName}
                  onChange={(e) => setGuestFromName(e.target.value)}
                  placeholder="Analog"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="guestFromEmail" className="text-xs text-[hsl(var(--admin-text-muted))]">
                  From Email
                </Label>
                <Input
                  id="guestFromEmail"
                  value={guestFromEmail}
                  onChange={(e) => setGuestFromEmail(e.target.value)}
                  placeholder="hello@example.org"
                />
              </div>
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              Preview: <span className="font-mono">{guestFromName} &lt;{guestFromEmail}&gt;</span>
            </p>
          </div>
        </div>

        <Separator className="bg-[hsl(var(--admin-border))]" />

        {/* Default CC Recipients Section */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Users className="h-4 w-4" />
            Default CC Recipients
          </h4>
          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
            Configure default CC recipients for each type of email. These will be automatically added to the CC field when composing emails, but can be edited before sending.
          </p>
          
          <div className="grid gap-4">
            <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
              <CCEmailInput
                label="Artist / Talent Emails CC"
                description="People who should receive copies of all artist communications"
                emails={artistCcEmails}
                onEmailsChange={setArtistCcEmails}
              />
            </div>

            <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
              <CCEmailInput
                label="Vendor Emails CC"
                description="People who should receive copies of all vendor communications"
                emails={vendorCcEmails}
                onEmailsChange={setVendorCcEmails}
              />
            </div>

            <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
              <CCEmailInput
                label="Artisan Emails CC"
                description="People who should receive copies of all artisan communications"
                emails={artisanCcEmails}
                onEmailsChange={setArtisanCcEmails}
              />
            </div>

            <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
              <CCEmailInput
                label="Volunteer Emails CC"
                description="People who should receive copies of all volunteer communications"
                emails={volunteerCcEmails}
                onEmailsChange={setVolunteerCcEmails}
              />
            </div>

            <div className="p-4 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
              <CCEmailInput
                label="Partner Emails CC"
                description="People who should receive copies of all partner communications"
                emails={partnerCcEmails}
                onEmailsChange={setPartnerCcEmails}
              />
            </div>
          </div>
        </div>

        <Separator className="bg-[hsl(var(--admin-border))]" />

        {/* Signature Section */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Signature
          </h4>
          
          <div className="space-y-2">
            <Label htmlFor="signatureLine">Sign-off line</Label>
            <Input
              id="signatureLine"
              value={signatureLine}
              onChange={(e) => setSignatureLine(e.target.value)}
              placeholder="e.g., Best regards, or ✌️&❤️,"
            />
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              The closing line before your name (e.g., "Best regards," or "✌️&❤️,")
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signatureName">Signature name</Label>
            <Input
              id="signatureName"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              placeholder="e.g., Demo Organizers"
            />
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              The name(s) that appear after the sign-off line
            </p>
          </div>

          <div className="pt-2">
            <p className="text-sm text-[hsl(var(--admin-text-muted))] mb-3">Signature Preview:</p>
            <div className="bg-[hsl(var(--admin-surface-hover))] p-4 rounded-lg text-sm">
              <p>{signatureLine}</p>
              <p>{signatureName}</p>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving} variant="admin" className="w-full">
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Settings
        </Button>
      </AdminCardContent>
    </AdminCard>
  );
}
