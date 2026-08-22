import { WebhookMonitor } from "@/components/WebhookMonitor";
import { SmsDeliveryMonitor } from "@/components/SmsDeliveryMonitor";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Webhook } from "lucide-react";

export default function WebhooksPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Webhook Monitor"
        subtitle="Monitor webhook events, payments, and SMS delivery"
        icon={Webhook}
      />
      <WebhookMonitor />
      <SmsDeliveryMonitor />
    </div>
  );
}
