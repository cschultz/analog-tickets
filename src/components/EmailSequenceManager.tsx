import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import {
  AdminButton,
  AdminInput,
  AdminBadge,
} from "@/components/admin";
import { AdminLabel, AdminSwitch } from "@/components/admin/AdminFormPrimitives";
import { AdminSelect, AdminSelectItem } from "@/components/admin/AdminSelect";
import { AdminCollapsible, AdminCollapsibleContent, AdminCollapsibleTrigger } from "@/components/admin/AdminCollapsible";
import { toast } from "sonner";
import { 
  Loader2, 
  Mail,
  Play, 
  Pause, 
  Edit, 
  Clock, 
  Calendar,
  ChevronDown,
  ChevronRight,
  Save,
  X,
  Eye,
  Send
} from "lucide-react";
import { RichTextEditor, RichTextEditorRef } from "./RichTextEditor";
import { DripEmailPreviewModal } from "@/components/admin/DripEmailPreviewModal";
import { MergeFieldInsert } from "@/components/drip/MergeFieldInsert";

interface EmailSequence {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string;
  created_at: string;
}

interface SequenceStep {
  id: string;
  sequence_id: string;
  step_order: number;
  name: string;
  subject: string;
  heading: string | null;
  intro_text: string | null;
  body_html: string;
  footer_text: string | null;
  timing_type: string;
  timing_days: number;
  timing_hour: number;
  is_active: boolean;
  email_format: 'plain_text' | 'html';
}

export const EmailSequenceManager = () => {
  const [sequences, setSequences] = useState<EmailSequence[]>([]);
  const [steps, setSteps] = useState<Record<string, SequenceStep[]>>({});
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<SequenceStep>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sendingTestFor, setSendingTestFor] = useState<string | null>(null);
  const editorRef = useRef<RichTextEditorRef>(null);

  useEffect(() => {
    fetchSequences();
  }, []);

  const fetchSequences = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("email_sequences")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching sequences:", error);
      toast.error("Failed to load email sequences");
    } else {
      setSequences(data || []);
    }
    setIsLoading(false);
  };

  const fetchSteps = async (sequenceId: string) => {
    const { data, error } = await supabase
      .from("email_sequence_steps")
      .select("*")
      .eq("sequence_id", sequenceId)
      .order("step_order", { ascending: true });

    if (error) {
      console.error("Error fetching steps:", error);
      toast.error("Failed to load sequence steps");
    } else {
      // Cast email_format from string to the expected union type
      const typedData = (data || []).map(step => ({
        ...step,
        email_format: (step.email_format || 'plain_text') as 'plain_text' | 'html'
      })) as SequenceStep[];
      setSteps(prev => ({ ...prev, [sequenceId]: typedData }));
    }
  };

  const toggleSequence = async (sequenceId: string) => {
    if (expandedSequence === sequenceId) {
      setExpandedSequence(null);
    } else {
      setExpandedSequence(sequenceId);
      if (!steps[sequenceId]) {
        await fetchSteps(sequenceId);
      }
    }
  };

  const toggleSequenceActive = async (sequence: EmailSequence) => {
    const { error } = await supabase
      .from("email_sequences")
      .update({ is_active: !sequence.is_active })
      .eq("id", sequence.id);

    if (error) {
      toast.error("Failed to update sequence");
    } else {
      setSequences(prev => 
        prev.map(s => s.id === sequence.id ? { ...s, is_active: !s.is_active } : s)
      );
      toast.success(sequence.is_active ? "Sequence paused" : "Sequence activated");
    }
  };

  const toggleStepActive = async (step: SequenceStep) => {
    const { error } = await supabase
      .from("email_sequence_steps")
      .update({ is_active: !step.is_active })
      .eq("id", step.id);

    if (error) {
      toast.error("Failed to update step");
    } else {
      setSteps(prev => ({
        ...prev,
        [step.sequence_id]: prev[step.sequence_id]?.map(s => 
          s.id === step.id ? { ...s, is_active: !s.is_active } : s
        ) || []
      }));
      toast.success(step.is_active ? "Step disabled" : "Step enabled");
    }
  };

  const startEditing = (step: SequenceStep) => {
    setEditingStep(step.id);
    setEditForm(step);
  };

  const cancelEditing = () => {
    setEditingStep(null);
    setEditForm({});
  };

  const saveStep = async () => {
    if (!editingStep || !editForm.sequence_id) return;
    
    setIsSaving(true);
    const { error } = await supabase
      .from("email_sequence_steps")
      .update({
        name: editForm.name,
        subject: editForm.subject,
        heading: editForm.heading,
        intro_text: editForm.intro_text,
        body_html: editForm.body_html,
        footer_text: editForm.footer_text,
        timing_type: editForm.timing_type,
        timing_days: editForm.timing_days,
        timing_hour: editForm.timing_hour,
        email_format: editForm.email_format,
      })
      .eq("id", editingStep);

    if (error) {
      toast.error("Failed to save step");
    } else {
      toast.success("Step saved");
      await fetchSteps(editForm.sequence_id);
      cancelEditing();
    }
    setIsSaving(false);
  };

  const sendTestEmail = async (stepId: string, stepName: string) => {
    setSendingTestFor(stepId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        toast.error("Could not get your email address");
        return;
      }

      const { data, error } = await supabase.functions.invoke('send-test-drip-email', {
        body: { stepId, testEmail: user.email }
      });

      if (error) throw error;

      toast.success(`Test email sent to ${user.email}`);
    } catch (err: any) {
      console.error('Error sending test email:', err);
      toast.error(err?.message || "Failed to send test email");
    } finally {
      setSendingTestFor(null);
    }
  };

  const formatTiming = (step: SequenceStep) => {
    if (step.timing_type === "after_purchase") {
      return `${step.timing_days} day${step.timing_days !== 1 ? "s" : ""} after purchase`;
    }
    return `${step.timing_days} day${step.timing_days !== 1 ? "s" : ""} before event`;
  };

  if (isLoading) {
    return (
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Sequences
          </AdminCardTitle>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
          </div>
        </AdminCardContent>
      </AdminCard>
    );
  }

  // Check if any sequence is active
  const anySequenceActive = sequences.some(s => s.is_active);

  const toggleAllSequences = async (activate: boolean) => {
    const { error } = await supabase
      .from("email_sequences")
      .update({ is_active: activate })
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Update all

    if (error) {
      toast.error("Failed to update sequences");
    } else {
      setSequences(prev => prev.map(s => ({ ...s, is_active: activate })));
      toast.success(activate ? "All drip sequences activated" : "All drip sequences paused");
    }
  };

  return (
    <AdminCard>
      <AdminCardHeader>
        <div className="flex items-center justify-between">
          <div>
            <AdminCardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Drip Email Sequences
            </AdminCardTitle>
            <AdminCardDescription>Automated post-purchase email journeys</AdminCardDescription>
          </div>
          <div className="flex items-center gap-3">
            <AdminLabel htmlFor="master-toggle" className="text-sm font-medium">
              {anySequenceActive ? "Drips Active" : "Drips Paused"}
            </AdminLabel>
            <AdminSwitch
              id="master-toggle"
              checked={anySequenceActive}
              onCheckedChange={toggleAllSequences}
            />
          </div>
        </div>
      </AdminCardHeader>
      <AdminCardContent>
      {!anySequenceActive && (
        <div className="mb-4 p-3 bg-[hsl(var(--admin-warning-muted))] border border-[hsl(var(--admin-warning))]/30 rounded-lg flex items-center gap-2 text-[hsl(var(--admin-warning))]">
          <Pause className="h-4 w-4" />
          <span className="text-sm font-medium">All drip sequences are currently paused. Toggle above to activate.</span>
        </div>
      )}
      <div className="space-y-4">
        {sequences.length === 0 ? (
          <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-4">
            No email sequences configured
          </p>
        ) : (
          sequences.map(sequence => (
            <div 
              key={sequence.id} 
              className="border border-[hsl(var(--admin-border))] rounded-lg overflow-hidden"
            >
              <div 
                className="flex items-center justify-between p-4 bg-[hsl(var(--admin-hover))] cursor-pointer hover:bg-[hsl(var(--admin-surface-alt))] transition-colors"
                onClick={() => toggleSequence(sequence.id)}
              >
                <div className="flex items-center gap-3">
                  {expandedSequence === sequence.id ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[hsl(var(--admin-text))]">{sequence.name}</span>
                      <AdminBadge intent={sequence.is_active ? "success" : "neutral"} showDot>
                        {sequence.is_active ? "Active" : "Paused"}
                      </AdminBadge>
                    </div>
                    {sequence.description && (
                      <p className="text-sm text-[hsl(var(--admin-text-muted))]">{sequence.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <AdminButton
                    variant="adminGhost"
                    size="sm"
                    onClick={() => toggleSequenceActive(sequence)}
                  >
                    {sequence.is_active ? (
                      <><Pause className="h-4 w-4 mr-1" /> Pause</>
                    ) : (
                      <><Play className="h-4 w-4 mr-1" /> Activate</>
                    )}
                  </AdminButton>
                </div>
              </div>

              {expandedSequence === sequence.id && (
                <div className="p-4 space-y-3 border-t border-[hsl(var(--admin-border))]">
                  {!steps[sequence.id] ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--admin-text-muted))]" />
                    </div>
                  ) : steps[sequence.id].length === 0 ? (
                    <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-4">
                      No steps in this sequence
                    </p>
                  ) : (
                    steps[sequence.id].map((step, index) => (
                      <div 
                        key={step.id}
                        className={`border border-[hsl(var(--admin-border))] rounded-lg p-4 ${!step.is_active ? "opacity-60" : ""}`}
                      >
                        {editingStep === step.id ? (
                          // Edit form
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium text-[hsl(var(--admin-text))]">Edit Step {step.step_order}</h4>
                              <div className="flex gap-2">
                                <AdminButton 
                                  variant="adminGhost" 
                                  size="sm" 
                                  onClick={cancelEditing}
                                >
                                  <X className="h-4 w-4" />
                                </AdminButton>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <AdminLabel>Step Name</AdminLabel>
                                <AdminInput
                                  value={editForm.name || ""}
                                  onChange={e => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                />
                              </div>
                              <div>
                                <AdminLabel>Subject Line</AdminLabel>
                                <AdminInput
                                  value={editForm.subject || ""}
                                  onChange={e => setEditForm(prev => ({ ...prev, subject: e.target.value }))}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4">
                              <div>
                                <AdminLabel>Timing</AdminLabel>
                                <AdminSelect
                                  value={editForm.timing_type}
                                  onValueChange={value => setEditForm(prev => ({ ...prev, timing_type: value }))}
                                >
                                  <AdminSelectItem value="after_purchase">After Purchase</AdminSelectItem>
                                  <AdminSelectItem value="before_event">Before Event</AdminSelectItem>
                                </AdminSelect>
                              </div>
                              <div>
                                <AdminLabel>Days</AdminLabel>
                                <AdminInput
                                  type="number"
                                  min="0"
                                  value={editForm.timing_days || 0}
                                  onChange={e => setEditForm(prev => ({ ...prev, timing_days: parseInt(e.target.value) || 0 }))}
                                />
                              </div>
                              <div>
                                <AdminLabel>Hour (0-23)</AdminLabel>
                                <AdminInput
                                  type="number"
                                  min="0"
                                  max="23"
                                  value={editForm.timing_hour || 10}
                                  onChange={e => setEditForm(prev => ({ ...prev, timing_hour: parseInt(e.target.value) || 10 }))}
                                />
                              </div>
                              <div>
                                <AdminLabel>Email Format</AdminLabel>
                                <AdminSelect
                                  value={editForm.email_format || 'plain_text'}
                                  onValueChange={value => setEditForm(prev => ({ ...prev, email_format: value as 'plain_text' | 'html' }))}
                                >
                                  <AdminSelectItem value="plain_text">Plain Text (Personal)</AdminSelectItem>
                                  <AdminSelectItem value="html">HTML (Branded)</AdminSelectItem>
                                </AdminSelect>
                              </div>
                            </div>

                            <div>
                              <AdminLabel>Email Heading</AdminLabel>
                              <AdminInput
                                value={editForm.heading || ""}
                                onChange={e => setEditForm(prev => ({ ...prev, heading: e.target.value }))}
                              />
                            </div>

                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <AdminLabel>Email Body</AdminLabel>
                                <MergeFieldInsert
                                  onInsert={(field) => {
                                    if (editorRef.current) {
                                      editorRef.current.insertContent(field);
                                    }
                                  }}
                                />
                              </div>
                              <RichTextEditor
                                ref={editorRef}
                                content={editForm.body_html || ""}
                                onChange={html => setEditForm(prev => ({ ...prev, body_html: html }))}
                              />
                            </div>

                            <AdminButton variant="admin" onClick={saveStep} disabled={isSaving} className="w-full">
                              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                              Save Changes
                            </AdminButton>
                          </div>
                        ) : (
                          // Display view
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium bg-[hsl(var(--admin-accent-muted))] text-[hsl(var(--admin-accent))] px-2 py-0.5 rounded">
                                  Step {step.step_order}
                                </span>
                                <span className="font-medium">{step.name}</span>
                                {!step.is_active && (
                                  <AdminBadge intent="neutral" size="sm">Disabled</AdminBadge>
                                )}
                              </div>
                              <p className="text-sm text-[hsl(var(--admin-text-muted))] mb-2">
                                Subject: <span className="text-[hsl(var(--admin-text))]">{step.subject}</span>
                              </p>
                              <div className="flex items-center gap-4 text-xs text-[hsl(var(--admin-text-muted))]">
                                {step.timing_type === "after_purchase" ? (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatTiming(step)}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {formatTiming(step)}
                                  </span>
                                )}
                                <span>at {step.timing_hour}:00</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <AdminSwitch
                                checked={step.is_active}
                                onCheckedChange={() => toggleStepActive(step)}
                              />
                              <DripEmailPreviewModal
                                stepName={step.name}
                                subject={step.subject}
                                heading={step.heading}
                                introText={step.intro_text}
                                bodyHtml={step.body_html}
                                footerText={step.footer_text}
                                timingDescription={formatTiming(step)}
                                trigger={
                                  <AdminButton variant="adminGhost" size="sm" title="Preview email">
                                    <Eye className="h-4 w-4" />
                                  </AdminButton>
                                }
                              />
                              <AdminButton
                                variant="adminGhost"
                                size="sm"
                                onClick={() => sendTestEmail(step.id, step.name)}
                                disabled={sendingTestFor === step.id}
                                title="Send test email to yourself"
                              >
                                {sendingTestFor === step.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4" />
                                )}
                              </AdminButton>
                              <AdminButton
                                variant="adminGhost"
                                size="sm"
                                onClick={() => startEditing(step)}
                                title="Edit step"
                              >
                                <Edit className="h-4 w-4" />
                              </AdminButton>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
      </AdminCardContent>
    </AdminCard>
  );
};
