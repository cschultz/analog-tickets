import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminInput } from "@/components/admin";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { Mail } from "lucide-react";

interface EmailSignatureCardProps {
  signatureLine: string;
  signatureName: string;
  onSignatureLineChange: (value: string) => void;
  onSignatureNameChange: (value: string) => void;
}

export function EmailSignatureCard({
  signatureLine,
  signatureName,
  onSignatureLineChange,
  onSignatureNameChange,
}: EmailSignatureCardProps) {
  return (
    <AdminCard>
      <AdminCardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
          <AdminCardTitle className="text-base font-semibold">Email Signature</AdminCardTitle>
        </div>
        <AdminCardDescription className="text-xs">
          Customize the signature that appears at the bottom of all outgoing emails
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <AdminLabel htmlFor="signatureLine">Closing Line</AdminLabel>
            <AdminInput
              id="signatureLine"
              value={signatureLine}
              onChange={(e) => onSignatureLineChange(e.target.value)}
              placeholder="✌️&❤️,"
            />
          </div>
          <div className="space-y-2">
            <AdminLabel htmlFor="signatureName">Signature Name</AdminLabel>
            <AdminInput
              id="signatureName"
              value={signatureName}
              onChange={(e) => onSignatureNameChange(e.target.value)}
              placeholder="Demo Organizers"
            />
          </div>
        </div>
        
        <div className="p-3 rounded-lg bg-[hsl(var(--admin-surface-hover))]">
          <p className="text-xs text-[hsl(var(--admin-text-muted))] mb-1">Preview</p>
          <p className="text-sm">
            {signatureLine}<br />
            <span className="font-medium">{signatureName}</span>
          </p>
        </div>
      </AdminCardContent>
    </AdminCard>
  );
}
