import { AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin/AdminUI";
import { SurveyEditor } from "@/components/SurveyEditor";
import { SurveyResponses } from "@/components/SurveyResponses";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ClipboardList } from "lucide-react";

export default function SurveysPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Survey Management"
        subtitle="Manage post-event surveys and view responses"
        icon={ClipboardList}
      />

      <AdminTabs defaultValue="editor" className="w-full">
        <AdminTabsList className="grid w-full grid-cols-2">
          <AdminTabsTrigger value="editor">Survey Editor</AdminTabsTrigger>
          <AdminTabsTrigger value="responses">Responses</AdminTabsTrigger>
        </AdminTabsList>

        <AdminTabsContent value="editor" className="mt-6">
          <SurveyEditor />
        </AdminTabsContent>

        <AdminTabsContent value="responses" className="mt-6">
          <SurveyResponses />
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
