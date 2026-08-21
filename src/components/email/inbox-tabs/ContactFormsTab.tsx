import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent } from "@/components/admin/AdminCard";
import {
  AdminBadge,
  AdminButton,
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { MessageSquareText, Mail, User, Clock, Trash2, Download } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
}

interface ContactFormsTabProps {
  searchQuery: string;
}

export function ContactFormsTab({ searchQuery }: ContactFormsTabProps) {
  const queryClient = useQueryClient();
  const [selectedSubmission, setSelectedSubmission] = useState<ContactSubmission | null>(null);

  const { data: submissions = [], isLoading, refetch } = useAuthQuery({
    queryKey: ["contact-forms-inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_submissions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as ContactSubmission[];
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const filteredSubmissions = submissions.filter(
    (s) =>
      s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.message?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExport = () => {
    const headers = ["Date", "Name", "Email", "Message"];
    const csvData = submissions.map((s) => [
      format(new Date(s.created_at), "yyyy-MM-dd HH:mm"),
      s.name,
      s.email,
      s.message.replace(/"/g, '""'),
    ]);

    const csv = [
      headers.join(","),
      ...csvData.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contact-submissions-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Exported successfully");
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardContent className="flex justify-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-[hsl(var(--admin-info))] border-t-transparent rounded-full" />
        </AdminCardContent>
      </AdminCard>
    );
  }

  if (filteredSubmissions.length === 0) {
    return (
      <AdminCard>
        <AdminCardContent className="text-center py-12 text-[hsl(var(--admin-text-muted))]">
          <MessageSquareText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">No contact form submissions yet</p>
          <p className="text-sm mt-1">Messages from the contact form will appear here</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <>
      <AdminCard>
        <AdminCardContent className="p-0">
          {/* Export button */}
          <div className="p-3 border-b border-[hsl(var(--admin-border))] flex justify-end">
            <AdminButton variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </AdminButton>
          </div>
          <AdminScrollArea className="h-[560px]">
            <div className="divide-y divide-[hsl(var(--admin-border))]">
              {filteredSubmissions.map((submission) => (
                <button
                  key={submission.id}
                  className="w-full text-left p-4 hover:bg-[hsl(var(--admin-hover))] transition-colors flex items-start gap-3"
                  onClick={() => setSelectedSubmission(submission)}
                >
                  <div className="p-2 rounded-full shrink-0 bg-[hsl(var(--admin-hover))]">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{submission.name}</span>
                      <span className="text-sm text-[hsl(var(--admin-text-muted))] truncate">
                        {submission.email}
                      </span>
                    </div>
                    <div className="text-sm text-[hsl(var(--admin-text-muted))] truncate">
                      {submission.message}
                    </div>
                  </div>
                  <div className="text-xs text-[hsl(var(--admin-text-muted))] shrink-0 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}
                  </div>
                </button>
              ))}
            </div>
          </AdminScrollArea>
        </AdminCardContent>
      </AdminCard>

      <AdminDialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <AdminDialogContent className="max-w-lg">
          <AdminDialogHeader>
            <AdminDialogTitle>Contact Form Submission</AdminDialogTitle>
          </AdminDialogHeader>
          {selectedSubmission && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-[hsl(var(--admin-text-muted))] mb-1">Name</div>
                  <div className="font-medium">{selectedSubmission.name}</div>
                </div>
                <div>
                  <div className="text-[hsl(var(--admin-text-muted))] mb-1">Date</div>
                  <div className="font-medium">
                    {format(new Date(selectedSubmission.created_at), "MMM d, yyyy h:mm a")}
                  </div>
                </div>
              </div>
              <div className="text-sm">
                <div className="text-[hsl(var(--admin-text-muted))] mb-1">Email</div>
                <a
                  href={`mailto:${selectedSubmission.email}`}
                  className="font-medium text-[hsl(var(--admin-info))] hover:underline"
                >
                  {selectedSubmission.email}
                </a>
              </div>
              <div className="text-sm">
                <div className="text-[hsl(var(--admin-text-muted))] mb-1">Message</div>
                <div className="p-3 rounded-lg bg-[hsl(var(--admin-hover))] whitespace-pre-wrap">
                  {selectedSubmission.message}
                </div>
              </div>
              <div className="flex justify-end">
                <AdminButton variant="admin" asChild>
                  <a href={`mailto:${selectedSubmission.email}?subject=Re: Contact Form Submission`}>
                    <Mail className="h-4 w-4 mr-1" />
                    Reply
                  </a>
                </AdminButton>
              </div>
            </div>
          )}
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
}
