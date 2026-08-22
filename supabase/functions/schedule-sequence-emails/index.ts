import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { corsHeaders } from "../_shared/email-template.ts";

// This function schedules drip sequence emails for a new registration
// It should be called after a successful ticket purchase

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { registrationId } = await req.json();

    if (!registrationId) {
      return new Response(
        JSON.stringify({ error: 'Missing registrationId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch registration details
    const { data: registration, error: regError } = await supabaseAdmin
      .from('registrations')
      .select('id, event_id, created_at')
      .eq('id', registrationId)
      .single();

    if (regError || !registration) {
      console.error('Registration not found:', regError);
      return new Response(
        JSON.stringify({ error: 'Registration not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch event details for event date
    const { data: eventData, error: eventError } = await supabaseAdmin
      .from('event_details')
      .select('id, event_date')
      .eq('id', registration.event_id)
      .single();

    if (eventError || !eventData) {
      console.error('Event not found:', eventError);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventDate = new Date(eventData.event_date);
    const purchaseDate = new Date(registration.created_at);

    // Fetch active sequences for ticket_purchase trigger
    const { data: sequences, error: seqError } = await supabaseAdmin
      .from('email_sequences')
      .select(`
        id,
        email_sequence_steps (
          id,
          timing_type,
          timing_days,
          timing_hour,
          is_active
        )
      `)
      .eq('is_active', true)
      .eq('trigger_type', 'ticket_purchase');

    if (seqError) {
      console.error('Error fetching sequences:', seqError);
      throw seqError;
    }

    if (!sequences || sequences.length === 0) {
      console.log('No active sequences found');
      return new Response(
        JSON.stringify({ message: 'No active sequences', scheduled: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let scheduled = 0;

    for (const sequence of sequences) {
      const steps = sequence.email_sequence_steps as any[];
      
      for (const step of steps) {
        if (!step.is_active) continue;

        // Calculate scheduled time based on timing type
        let scheduledFor: Date;
        
        if (step.timing_type === 'after_purchase') {
          // Days after purchase
          scheduledFor = new Date(purchaseDate);
          scheduledFor.setDate(scheduledFor.getDate() + step.timing_days);
        } else {
          // Days before event
          scheduledFor = new Date(eventDate);
          scheduledFor.setDate(scheduledFor.getDate() - step.timing_days);
        }

        // Set the specific hour
        scheduledFor.setHours(step.timing_hour, 0, 0, 0);

        // Only schedule if it's in the future
        if (scheduledFor > new Date()) {
          // Check if already scheduled
          const { data: existing } = await supabaseAdmin
            .from('email_sequence_logs')
            .select('id')
            .eq('registration_id', registrationId)
            .eq('step_id', step.id)
            .limit(1);

          if (!existing || existing.length === 0) {
            await supabaseAdmin.from('email_sequence_logs').insert({
              sequence_id: sequence.id,
              step_id: step.id,
              registration_id: registrationId,
              status: 'pending',
              scheduled_for: scheduledFor.toISOString(),
            });
            scheduled++;
            console.log(`Scheduled step ${step.id} for ${scheduledFor.toISOString()}`);
          }
        }
      }
    }

    console.log(`Scheduled ${scheduled} sequence emails for registration ${registrationId}`);

    return new Response(
      JSON.stringify({ success: true, scheduled }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error scheduling sequence emails:', error);
    return new Response(
      JSON.stringify({ error: error?.message || 'Failed to schedule emails' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
