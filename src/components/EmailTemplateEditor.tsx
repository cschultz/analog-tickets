import { useState, useEffect, useRef } from "react";
import { AdminButton, AdminInput, AdminTextarea } from "@/components/admin";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminLabel } from "@/components/admin/AdminFormPrimitives";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import {
  AdminDialog,
  AdminDialogContent,
  AdminDialogHeader,
  AdminDialogTitle,
} from "@/components/admin/AdminDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, RotateCcw, Eye } from "lucide-react";
import { MergeFieldInsert } from "@/components/drip/MergeFieldInsert";

interface EmailTemplate {
  id: string;
  template_type: string;
  subject: string;
  heading: string | null;
  intro_text: string | null;
  footer_text: string | null;
  updated_at: string;
}

const TEMPLATE_TYPES = [
  { value: 'ticket_confirmation', label: 'Ticket Confirmation' },
  { value: 'payment_failed', label: 'Payment Failed' },
  { value: 'payment_reminder', label: 'Payment Reminder' },
  { value: 'event_reminder', label: 'Event Reminder' },
  { value: 'abandoned_registration', label: 'Abandoned Registration' },
  { value: 'abandoned_registration_followup', label: 'Abandoned Registration Follow-up' },
  { value: 'post_event_thank_you', label: 'Post-Event Thank You' },
];

export const EmailTemplateEditor = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedType, setSelectedType] = useState('ticket_confirmation');
  const [currentTemplate, setCurrentTemplate] = useState<EmailTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeField, setActiveField] = useState<'subject' | 'heading' | 'intro' | 'footer' | null>(null);
  
  const subjectRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchAllTemplates();
  }, []);

  useEffect(() => {
    const template = templates.find(t => t.template_type === selectedType);
    setCurrentTemplate(template || null);
  }, [selectedType, templates]);

  const fetchAllTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('template_type');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Failed to load email templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentTemplate) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject: currentTemplate.subject,
          heading: currentTemplate.heading,
          intro_text: currentTemplate.intro_text,
          footer_text: currentTemplate.footer_text,
        })
        .eq('id', currentTemplate.id);

      if (error) throw error;
      toast.success('Email template updated successfully!');
      fetchAllTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save email template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    const defaults: Record<string, any> = {
      ticket_confirmation: {
        subject: '✨ You\'re In for {{event_name}} ✨',
        heading: '✨ You\'re In for {{event_name}} ✨',
        intro_text: 'Hi {{name}}, You\'re officially on the list. We\'re so glad you\'re joining us.',
        footer_text: 'Reply to this email anytime — we\'ve got you. 21+ event. Tickets are non-refundable.',
      },
      payment_failed: {
        subject: 'Payment Issue - {{event_name}}',
        heading: '⚠️ Payment Could Not Be Completed',
        intro_text: 'Hi {{name}}, we had trouble processing your payment for {{event_name}}.',
        footer_text: 'Please try again or contact us if you need assistance. We hope to see you there!',
      },
      payment_reminder: {
        subject: 'Complete Your Purchase - {{event_name}}',
        heading: '⏰ Complete Your Registration',
        intro_text: 'Hi {{name}}, you started a ticket purchase but didn\'t complete it. Your spot is waiting!',
        footer_text: 'Don\'t miss out on this magical gathering. Complete your purchase soon!',
      },
      event_reminder: {
        subject: 'See You Soon - {{event_name}}',
        heading: '🎉 The Event is Almost Here!',
        intro_text: 'Hi {{name}}, we\'re excited to see you at {{event_name}}!',
        footer_text: 'Remember to bring your ticket QR code. Can\'t wait to celebrate with you!',
      },
    };

    if (!currentTemplate) return;

    const defaultTemplate = defaults[selectedType];
    if (!defaultTemplate) return;

    setCurrentTemplate({
      ...currentTemplate,
      ...defaultTemplate,
    });

    toast.info('Template reset to default (not saved yet)');
  };

  const handleInsertField = (field: string) => {
    if (!currentTemplate || !activeField) {
      toast.error('Please click in a text field first');
      return;
    }

    const insertAtCursor = (
      ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement>,
      value: string | null,
      setValue: (newValue: string) => void
    ) => {
      const element = ref.current;
      if (!element) return;
      
      const start = element.selectionStart || 0;
      const end = element.selectionEnd || 0;
      const currentValue = value || '';
      const newValue = currentValue.substring(0, start) + field + currentValue.substring(end);
      setValue(newValue);
      
      // Restore cursor position after the inserted field
      setTimeout(() => {
        element.focus();
        element.setSelectionRange(start + field.length, start + field.length);
      }, 0);
    };

    switch (activeField) {
      case 'subject':
        insertAtCursor(subjectRef, currentTemplate.subject, (v) => 
          setCurrentTemplate({ ...currentTemplate, subject: v }));
        break;
      case 'heading':
        insertAtCursor(headingRef, currentTemplate.heading, (v) => 
          setCurrentTemplate({ ...currentTemplate, heading: v }));
        break;
      case 'intro':
        insertAtCursor(introRef, currentTemplate.intro_text, (v) => 
          setCurrentTemplate({ ...currentTemplate, intro_text: v }));
        break;
      case 'footer':
        insertAtCursor(footerRef, currentTemplate.footer_text, (v) => 
          setCurrentTemplate({ ...currentTemplate, footer_text: v }));
        break;
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

  if (!currentTemplate) {
    return (
      <AdminCard>
        <AdminCardContent className="py-8 text-center text-[hsl(var(--admin-text-muted))]">
          No template found
        </AdminCardContent>
      </AdminCard>
    );
  }

  const getTemplateDescription = (type: string) => {
    const descriptions: Record<string, string> = {
      ticket_confirmation: 'Sent when a ticket purchase is completed successfully',
      payment_failed: 'Sent when a payment fails or is declined',
      payment_reminder: 'Sent to remind users to complete their pending purchase',
      event_reminder: 'Sent before the event to remind attendees',
    };
    return descriptions[type] || '';
  };

  return (
    <>
      <AdminCard>
        <AdminCardHeader action={<MergeFieldInsert onInsert={handleInsertField} />}>
          <div>
            <AdminCardTitle>Email Template Editor</AdminCardTitle>
            <AdminCardDescription>
              Customize email templates for different scenarios. Click in a field, then use "Insert Field" to add dynamic variables.
            </AdminCardDescription>
          </div>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="space-y-2">
            <AdminLabel htmlFor="template-type" className="text-[hsl(var(--admin-text))]">Template Type</AdminLabel>
            <AdminSelect value={selectedType} onValueChange={setSelectedType}>
              {TEMPLATE_TYPES.map((type) => (
                <AdminSelectItem key={type.value} value={type.value}>
                  {type.label}
                </AdminSelectItem>
              ))}
            </AdminSelect>
            <p className="text-xs text-[hsl(var(--admin-text-muted))]">
              {getTemplateDescription(selectedType)}
            </p>
          </div>

          <div className="space-y-2">
            <AdminLabel htmlFor="subject" className="text-[hsl(var(--admin-text))]">Email Subject</AdminLabel>
            <AdminInput
              id="subject"
              ref={subjectRef}
              value={currentTemplate.subject}
              onChange={(e) => setCurrentTemplate({ ...currentTemplate, subject: e.target.value })}
              onFocus={() => setActiveField('subject')}
              placeholder="Email subject line"
              maxLength={200}
              className="bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))]"
            />
          </div>

          <div className="space-y-2">
            <AdminLabel htmlFor="heading" className="text-[hsl(var(--admin-text))]">Email Heading</AdminLabel>
            <AdminInput
              id="heading"
              ref={headingRef}
              value={currentTemplate.heading || ''}
              onChange={(e) => setCurrentTemplate({ ...currentTemplate, heading: e.target.value })}
              onFocus={() => setActiveField('heading')}
              placeholder="Main heading in the email"
              maxLength={100}
              className="bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))]"
            />
          </div>

          <div className="space-y-2">
            <AdminLabel htmlFor="intro" className="text-[hsl(var(--admin-text))]">Intro Text</AdminLabel>
            <AdminTextarea
              id="intro"
              ref={introRef}
              value={currentTemplate.intro_text || ''}
              onChange={(e) => setCurrentTemplate({ ...currentTemplate, intro_text: e.target.value })}
              onFocus={() => setActiveField('intro')}
              placeholder="Text shown right after the heading"
              rows={6}
              maxLength={1000}
              className="bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))] min-h-[150px] resize-y"
            />
          </div>

          <div className="space-y-2">
            <AdminLabel htmlFor="footer" className="text-[hsl(var(--admin-text))]">Footer Text</AdminLabel>
            <AdminTextarea
              id="footer"
              ref={footerRef}
              value={currentTemplate.footer_text || ''}
              onChange={(e) => setCurrentTemplate({ ...currentTemplate, footer_text: e.target.value })}
              onFocus={() => setActiveField('footer')}
              placeholder="Text shown at the bottom of the email"
              rows={4}
              maxLength={500}
              className="bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))] min-h-[100px] resize-y"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <AdminButton
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1"
              variant="admin"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Template
                </>
              )}
            </AdminButton>

            <AdminButton
              onClick={() => setShowPreview(true)}
              variant="adminOutline"
            >
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </AdminButton>

            <AdminButton
              onClick={handleReset}
              variant="adminOutline"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to Default
            </AdminButton>
          </div>

          <p className="text-xs text-[hsl(var(--admin-text-muted))]">
            Last updated: {new Date(currentTemplate.updated_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}
          </p>
        </AdminCardContent>
      </AdminCard>

      {/* Preview Dialog */}
      <AdminDialog open={showPreview} onOpenChange={setShowPreview}>
        <AdminDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-[hsl(var(--admin-surface-alt))]">
          <AdminDialogHeader>
            <AdminDialogTitle className="text-[hsl(var(--admin-accent))]">
              Email Preview - {TEMPLATE_TYPES.find(t => t.value === selectedType)?.label}
            </AdminDialogTitle>
          </AdminDialogHeader>
          <div className="space-y-4">
            <div>
              <AdminLabel className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Subject:</AdminLabel>
              <p className="text-base text-[hsl(var(--admin-text))]">{currentTemplate.subject}</p>
            </div>
            
            <div className="border-2 p-6 rounded-lg bg-[hsl(var(--admin-surface))] border-[hsl(var(--admin-border))]">
              <h1 className="text-2xl font-semibold mb-4 text-center text-[hsl(var(--admin-accent))]">
                {currentTemplate.heading}
              </h1>
              
              <p className="text-center text-lg mb-4 text-[hsl(var(--admin-text))] whitespace-pre-wrap">
                {currentTemplate.intro_text?.replace('{{name}}', 'John Doe')}
              </p>

              {selectedType === 'ticket_confirmation' && (
                <>
                  <div className="my-6 p-4 bg-[hsl(var(--admin-surface-alt))] border-l-[3px] border-l-[hsl(var(--admin-accent-gold))]">
                    <h2 className="text-lg font-semibold mb-2 text-[hsl(var(--admin-accent))]">Your Ticket</h2>
                    <p className="text-sm text-[hsl(var(--admin-text))]"><strong>{"{{event_name}}"}</strong></p>
                    <p className="text-sm text-[hsl(var(--admin-text))]"><strong>Date:</strong> {"{{event_date}}"}</p>
                    <p className="text-sm text-[hsl(var(--admin-text))]"><strong>Location:</strong> {"{{event_location}}"}</p>
                    <p className="text-sm text-[hsl(var(--admin-text))]"><strong>Ticket Type:</strong> Dinner + Party</p>
                    <p className="text-sm text-[hsl(var(--admin-text))]"><strong>Dietary Notes:</strong> Vegetarian</p>
                  </div>

                  <div className="my-6 p-4 border-2 rounded bg-[hsl(var(--admin-surface-alt))] border-[hsl(var(--admin-accent-gold))]">
                    <h2 className="text-lg font-semibold mb-2 text-[hsl(var(--admin-accent))]">Guest Details</h2>
                    <p className="text-sm mb-2 text-[hsl(var(--admin-text))]"><strong>Additional guests on this ticket:</strong></p>
                    <p className="text-base text-[hsl(var(--admin-text))]">Jane Smith, Alex Johnson</p>
                    <p className="text-xs mt-2 text-[hsl(var(--admin-text-muted))]">These guests can check in using your QR code below.</p>
                  </div>

                  <div className="my-6 p-4 text-center border-2 border-[hsl(var(--admin-border))]">
                    <div className="text-sm text-[hsl(var(--admin-text-muted))] mb-2">QR Code would appear here</div>
                    <div className="w-48 h-48 mx-auto bg-[hsl(var(--admin-border))] flex items-center justify-center text-[hsl(var(--admin-text-muted))]">
                      QR Code
                    </div>
                  </div>
                </>
              )}

              <p className="text-center text-[hsl(var(--admin-text))] whitespace-pre-wrap">
                {currentTemplate.footer_text}
              </p>
            </div>
          </div>
        </AdminDialogContent>
      </AdminDialog>
    </>
  );
};
