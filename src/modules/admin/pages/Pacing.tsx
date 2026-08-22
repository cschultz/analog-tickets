import SalesPacingAnalysis from "@/components/admin/SalesPacingAnalysis";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { TrendingUp } from "lucide-react";

export default function Pacing() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sales Pacing"
        subtitle="Analyze ticket sales pacing compared to previous years"
        icon={TrendingUp}
      />
      <SalesPacingAnalysis />
    </div>
  );
}
