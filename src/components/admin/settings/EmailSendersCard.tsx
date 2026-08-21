import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminInput } from "@/components/admin";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { Send, Users, Music, Store, Wine, FileSignature, Bell } from "lucide-react";
import { AdminAccordionItem } from "@/components/admin/AdminCollapsible";

interface EmailSendersCardProps {
  // Artist pipeline
  artistFromEmail: string;
  artistFromName: string;
  onArtistFromEmailChange: (value: string) => void;
  onArtistFromNameChange: (value: string) => void;
  
  // Production/Pipeline (vendors, artisans, partners)
  productionFromEmail: string;
  productionFromName: string;
  onProductionFromEmailChange: (value: string) => void;
  onProductionFromNameChange: (value: string) => void;
  
  // Guest emails
  guestFromEmail: string;
  guestFromName: string;
  onGuestFromEmailChange: (value: string) => void;
  onGuestFromNameChange: (value: string) => void;
  
  // Winery (optional)
  wineryFromEmail?: string;
  wineryFromName?: string;
  onWineryFromEmailChange?: (value: string) => void;
  onWineryFromNameChange?: (value: string) => void;
  
  // Contract emails
  contractFromEmail: string;
  contractFromName: string;
  onContractFromEmailChange: (value: string) => void;
  onContractFromNameChange: (value: string) => void;
  
  // System emails
  systemFromEmail: string;
  systemFromName: string;
  onSystemFromEmailChange: (value: string) => void;
  onSystemFromNameChange: (value: string) => void;
}

interface SenderFieldProps {
  description?: string;
  emailValue: string;
  nameValue: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  emailPlaceholder?: string;
  namePlaceholder?: string;
}

function SenderField({
  description,
  emailValue,
  nameValue,
  onEmailChange,
  onNameChange,
  emailPlaceholder,
  namePlaceholder,
}: SenderFieldProps) {
  return (
    <div className="space-y-3">
      {description && (
        <p className="text-xs text-[hsl(var(--admin-text-muted))]">{description}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <AdminLabel className="text-xs">From Name</AdminLabel>
          <AdminInput
            value={nameValue}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={namePlaceholder || "Demo Organizers from Analog"}
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <AdminLabel className="text-xs">From Email</AdminLabel>
          <AdminInput
            type="email"
            value={emailValue}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder={emailPlaceholder || "team@example.org"}
            className="h-8 text-sm"
          />
        </div>
      </div>
      <div className="text-xs text-[hsl(var(--admin-text-muted))] bg-[hsl(var(--admin-surface-hover))] rounded px-2 py-1.5 font-mono">
        {nameValue || "Sender"} &lt;{emailValue || "email@domain.com"}&gt;
      </div>
    </div>
  );
}

export function EmailSendersCard({
  artistFromEmail,
  artistFromName,
  onArtistFromEmailChange,
  onArtistFromNameChange,
  productionFromEmail,
  productionFromName,
  onProductionFromEmailChange,
  onProductionFromNameChange,
  guestFromEmail,
  guestFromName,
  onGuestFromEmailChange,
  onGuestFromNameChange,
  wineryFromEmail,
  wineryFromName,
  onWineryFromEmailChange,
  onWineryFromNameChange,
  contractFromEmail,
  contractFromName,
  onContractFromEmailChange,
  onContractFromNameChange,
  systemFromEmail,
  systemFromName,
  onSystemFromEmailChange,
  onSystemFromNameChange,
}: EmailSendersCardProps) {
  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <AdminCardTitle className="text-base font-semibold">Email Senders</AdminCardTitle>
        </div>
        <AdminCardDescription className="text-xs">
          Configure the "from" address for each email type. Pipeline emails automatically CC inbox@example.org.
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-2">
        {/* Artist Pipeline */}
        <AdminAccordionItem
          title={
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 text-[hsl(var(--admin-primary))]" />
              <span>Artist Emails</span>
            </div>
          }
          defaultOpen
        >
          <SenderField
            description="Booking inquiries, payment requests, logistics. Replies go to inbox@example.org."
            emailValue={artistFromEmail}
            nameValue={artistFromName}
            onEmailChange={onArtistFromEmailChange}
            onNameChange={onArtistFromNameChange}
            emailPlaceholder="organizer@example.org"
            namePlaceholder="Demo Organizer"
          />
        </AdminAccordionItem>

        {/* Guest Emails */}
        <AdminAccordionItem
          title={
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-[hsl(var(--admin-success))]" />
              <span>Guest Emails</span>
            </div>
          }
          defaultOpen
        >
          <SenderField
            description="Confirmations, announcements, lodging. Personal emails guests can reply to."
            emailValue={guestFromEmail}
            nameValue={guestFromName}
            onEmailChange={onGuestFromEmailChange}
            onNameChange={onGuestFromNameChange}
            emailPlaceholder="hello@example.org"
            namePlaceholder="Demo Organizers from Analog"
          />
        </AdminAccordionItem>

        {/* Production Pipeline */}
        <AdminAccordionItem
          title={
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-[hsl(var(--admin-warning))]" />
              <span>Vendor / Artisan / Partner</span>
            </div>
          }
        >
          <SenderField
            description="Vendor, artisan, and partner communications. Auto-CCs inbox@example.org."
            emailValue={productionFromEmail}
            nameValue={productionFromName}
            onEmailChange={onProductionFromEmailChange}
            onNameChange={onProductionFromNameChange}
            emailPlaceholder="team@example.org"
            namePlaceholder="Demo Organizers from Analog"
          />
        </AdminAccordionItem>

        {/* WineCamp (if handlers provided) */}
        {onWineryFromEmailChange && onWineryFromNameChange && (
          <AdminAccordionItem
            title={
              <div className="flex items-center gap-2">
                <Wine className="h-4 w-4 text-[hsl(var(--admin-accent))]" />
                <span>WineCamp Emails</span>
              </div>
            }
          >
            <SenderField
              description="WineCamp pipeline emails. Auto-CCs inbox@example.org."
              emailValue={wineryFromEmail || ""}
              nameValue={wineryFromName || ""}
              onEmailChange={onWineryFromEmailChange}
              onNameChange={onWineryFromNameChange}
              emailPlaceholder="organizer@example.org"
              namePlaceholder="Demo Organizer"
            />
          </AdminAccordionItem>
        )}

        {/* Contracts */}
        <AdminAccordionItem
          title={
            <div className="flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-[hsl(var(--admin-info))]" />
              <span>Contract Emails</span>
            </div>
          }
        >
          <SenderField
            description="Contract delivery and reminders. Auto-CCs inbox@example.org."
            emailValue={contractFromEmail}
            nameValue={contractFromName}
            onEmailChange={onContractFromEmailChange}
            onNameChange={onContractFromNameChange}
            emailPlaceholder="contracts@example.org"
            namePlaceholder="Analog Team"
          />
        </AdminAccordionItem>

        {/* System */}
        <AdminAccordionItem
          title={
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
              <span>System Notifications</span>
            </div>
          }
        >
          <SenderField
            description="Automated notifications, reminders, and system alerts. No-reply address."
            emailValue={systemFromEmail}
            nameValue={systemFromName}
            onEmailChange={onSystemFromEmailChange}
            onNameChange={onSystemFromNameChange}
            emailPlaceholder="noreply@example.org"
            namePlaceholder="Cosmico"
          />
        </AdminAccordionItem>
      </AdminCardContent>
    </AdminCard>
  );
}
