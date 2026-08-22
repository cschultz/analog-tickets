/**
 * Team/Admins Page
 * 
 * Central hub for admin user management including email aliases
 */

import { AdminPageHeader } from "@/components/admin";
import { EmailAliasManager } from "@/components/admin/EmailAliasManager";
import { Users } from "lucide-react";

export default function TeamPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={Users}
        title="Team"
        subtitle="Manage admin users and email aliases"
      />

      {/* Email Aliases - Self-Service */}
      <EmailAliasManager />
    </div>
  );
}
