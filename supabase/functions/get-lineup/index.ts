import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { eventId } = await req.json();
    
    if (!eventId) {
      return new Response(JSON.stringify({ error: 'eventId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Fetching lineup for event:', eventId);

    // Fetch artists with their offer/scheduling data (include performance_date from artists table)
    const { data: artists, error: artistsError } = await supabase
      .from('artists')
      .select('id, name, bio, genre, instagram_url, spotify_url, website_url, performance_date, set_time')
      .eq('event_id', eventId);

    if (artistsError) {
      console.error('Error fetching artists:', artistsError);
      throw artistsError;
    }

    // Fetch scheduling data from artist_offers
    const { data: offers, error: offersError } = await supabase
      .from('artist_offers')
      .select('artist_id, artist_name, performance_date, set_time, stage, status')
      .eq('event_id', eventId)
      .eq('status', 'accepted');

    if (offersError) {
      console.error('Error fetching offers:', offersError);
      throw offersError;
    }

    console.log(`Found ${artists?.length || 0} artists and ${offers?.length || 0} offers`);

    // Merge artist data with scheduling info from offers
    // Fall back to artist's own performance_date if no offer exists
    const artistsWithSchedule = artists?.map(artist => {
      const offer = offers?.find(o => o.artist_id === artist.id || o.artist_name === artist.name);
      return {
        ...artist,
        // Use offer date if available, otherwise use artist's own performance_date
        performance_date: offer?.performance_date || artist.performance_date || null,
        set_time: offer?.set_time || artist.set_time || null,
        stage: offer?.stage || null,
      };
    }) || [];

    // Also include artists from offers that might not be in artists table yet
    const offerArtistNames = new Set(artistsWithSchedule.map(a => a.name));
    const additionalFromOffers = offers
      ?.filter(o => !offerArtistNames.has(o.artist_name))
      .map(o => ({
        id: null,
        name: o.artist_name,
        bio: null,
        genre: null,
        instagram_url: null,
        spotify_url: null,
        website_url: null,
        performance_date: o.performance_date,
        set_time: o.set_time,
        stage: o.stage,
      })) || [];

    const allArtists = [...artistsWithSchedule, ...additionalFromOffers];

    // Group by day and sort by set_time DESC within each day
    const sortBySetTime = (a: any, b: any) => {
      if (!a.set_time && !b.set_time) return 0;
      if (!a.set_time) return 1;
      if (!b.set_time) return -1;
      // Parse time strings like "8:00 PM" and sort descending
      const parseTime = (t: string) => {
        if (t === 'TBD') return 0;
        const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return 0;
        let hours = parseInt(match[1]);
        const mins = parseInt(match[2]);
        const isPM = match[3].toUpperCase() === 'PM';
        if (isPM && hours !== 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
        return hours * 60 + mins;
      };
      return parseTime(b.set_time) - parseTime(a.set_time);
    };

    // Group by performance date
    const byDay: Record<string, any[]> = {};
    allArtists.forEach(artist => {
      const day = artist.performance_date || 'unscheduled';
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(artist);
    });

    // Sort each day's artists by set time DESC
    Object.keys(byDay).forEach(day => {
      byDay[day].sort(sortBySetTime);
    });

    // Remove duplicates (Starboro appears twice)
    Object.keys(byDay).forEach(day => {
      const seen = new Set();
      byDay[day] = byDay[day].filter(artist => {
        if (seen.has(artist.name)) return false;
        seen.add(artist.name);
        return true;
      });
    });

    console.log('Lineup grouped by day:', Object.keys(byDay));

    return new Response(JSON.stringify({ 
      artists: allArtists,
      byDay,
      eventId 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('get-lineup error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
