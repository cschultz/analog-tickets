import { Eye } from "lucide-react";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogDescription,
  AdminDialogHeader,
  AdminDialogTitle,
  AdminDialogTrigger,
  AdminButton,
} from "@/components/admin";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

// Color palette matching email templates
const colors = {
  background: "#F3EEE6",
  surface: "#FFFFFF",
  surfaceAlt: "#F9F7F4",
  primary: "#A37552",
  primaryGold: "#C7A97A",
  text: "#322821",
  textMuted: "#7B6E61",
  border: "#D1C2AE",
};

interface DripEmailPreviewModalProps {
  stepName: string;
  subject: string;
  heading?: string | null;
  introText?: string | null;
  bodyHtml: string;
  footerText?: string | null;
  timingDescription: string;
  trigger?: React.ReactNode;
}

export function DripEmailPreviewModal({
  stepName,
  subject,
  heading,
  introText,
  bodyHtml,
  footerText,
  timingDescription,
  trigger,
}: DripEmailPreviewModalProps) {
  // Sample data for preview
  const sampleName = "Sarah";
  const sampleTicketType = "Crew — 3 Day Pass";
  const sampleEventDate = "May 14–16, 2027";

  // Replace template variables with sample data
  const replaceVars = (text: string) => {
    return text
      .replace(/\{\{first_name\}\}/g, sampleName)
      .replace(/\{\{name\}\}/g, sampleName)
      .replace(/\{\{ticket_type\}\}/g, sampleTicketType)
      .replace(/\{\{event_date\}\}/g, sampleEventDate)
      .replace(/\{\{event_name\}\}/g, "Cosmico 2026")
      .replace(/\{\{venue_name\}\}/g, "Example Meadow");
  };

  const processedHeading = heading ? replaceVars(heading) : null;
  const processedIntro = introText ? replaceVars(introText) : null;
  const processedBody = replaceVars(bodyHtml);
  const processedFooter = footerText ? replaceVars(footerText) : null;

  return (
    <AdminDialog>
      <AdminDialogTrigger asChild>
        {trigger || (
          <AdminButton variant="adminGhost" size="sm">
            <Eye className="h-4 w-4" />
          </AdminButton>
        )}
      </AdminDialogTrigger>
      <AdminDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <AdminDialogHeader className="p-6 pb-0">
          <AdminDialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Preview: {stepName}
          </AdminDialogTitle>
          <AdminDialogDescription>
            This email is sent <strong>{timingDescription}</strong>. Sample data shown below.
          </AdminDialogDescription>
        </AdminDialogHeader>

        <div className="p-4">
          {/* Email metadata */}
          <div className="bg-[hsl(var(--admin-hover))] rounded-lg p-4 mb-4 text-sm space-y-1">
            <div className="flex gap-2">
              <span className="font-medium text-[hsl(var(--admin-text-muted))] w-16">From:</span>
              <span className="text-[hsl(var(--admin-text))]">Cosmico &lt;hello@example.org&gt;</span>
            </div>
            <div className="flex gap-2">
              <span className="font-medium text-[hsl(var(--admin-text-muted))] w-16">To:</span>
              <span className="text-[hsl(var(--admin-text))]">{sampleName.toLowerCase()}@example.com</span>
            </div>
            <div className="flex gap-2">
              <span className="font-medium text-[hsl(var(--admin-text-muted))] w-16">Subject:</span>
              <span className="text-[hsl(var(--admin-text))]">{replaceVars(subject)}</span>
            </div>
          </div>

          {/* Email preview container - Plain text style */}
          <div className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden shadow-sm">
            <div style={{ background: colors.background }}>
              <div style={{ maxWidth: 600, margin: "0 auto", background: colors.surface, padding: "40px 30px" }}>
                {/* Body content - plain text style, no header/footer */}
                <div
                  style={{ color: colors.text, lineHeight: 1.7, fontSize: 15 }}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(processedBody) }}
                />
              </div>
            </div>
          </div>

          {/* Info note */}
          <div className="mt-4 flex items-start gap-2 text-sm text-[hsl(var(--admin-text-muted))] bg-[hsl(var(--admin-warning)/0.1)] border border-[hsl(var(--admin-warning)/0.3)] rounded-lg p-3">
            <span className="text-[hsl(var(--admin-warning))]">ℹ️</span>
            <p>
              Template variables like <code className="bg-[hsl(var(--admin-warning)/0.2)] px-1 rounded">{"{{first_name}}"}</code> will be replaced with actual attendee data when sent.
            </p>
          </div>
        </div>
      </AdminDialogContent>
    </AdminDialog>
  );
}
