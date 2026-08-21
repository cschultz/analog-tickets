import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { useAdminSenders, useDefaultSenderId, AdminSender } from "@/hooks/useAdminSenders";
import { useEffect } from "react";

interface FromSenderSelectProps {
  pipelineType: string;
  value: string; // userId
  onChange: (userId: string) => void;
}

export function FromSenderSelect({ pipelineType, value, onChange }: FromSenderSelectProps) {
  const { data: senders, isLoading } = useAdminSenders();
  const { data: defaultSenderId } = useDefaultSenderId(pipelineType);

  // Set default on mount
  useEffect(() => {
    if (!value && senders && senders.length > 0) {
      const defaultId = defaultSenderId || senders[0]?.userId;
      if (defaultId) onChange(defaultId);
    }
  }, [senders, defaultSenderId, value, onChange]);

  if (isLoading || !senders || senders.length === 0) return null;

  const selectedSender = senders.find(s => s.userId === value);

  return (
    <div>
      <AdminLabel>From</AdminLabel>
      <AdminSelect
        value={value}
        onValueChange={onChange}
        placeholder="Select sender..."
      >
        {senders.map((sender) => (
          <AdminSelectItem key={sender.userId} value={sender.userId}>
            {sender.fullName} &lt;{sender.senderEmail}&gt;
          </AdminSelectItem>
        ))}
      </AdminSelect>
    </div>
  );
}
