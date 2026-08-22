import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimitDb } from "../_shared/error-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HTML escape function to prevent XSS in email templates
function escapeHtml(text: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}

// Input validation schema
const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000, "Message too long (max 2000 characters)"),
});

const RequestSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50, "Too many messages in conversation"),
  sessionId: z.string().regex(/^session_\d+_[a-z0-9]+$/, "Invalid session ID format"),
});

// Rate limiting configuration - now DB-backed
const RATE_LIMIT_MAX_REQUESTS = 10; // 10 requests per minute per session
const RATE_LIMIT_WINDOW_SECONDS = 60; // 1 minute

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse and validate input
    const rawBody = await req.json();
    const validationResult = RequestSchema.safeParse(rawBody);

    if (!validationResult.success) {
      console.error("[support-chat] Validation error:", validationResult.error.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid request format",
          details: validationResult.error.errors[0]?.message 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { messages, sessionId } = validationResult.data;

    // Check rate limit (DB-backed, persists across cold starts)
    const rateLimitResult = await checkRateLimitDb(
      sessionId,
      "support-chat",
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_SECONDS
    );
    
    if (!rateLimitResult.allowed) {
      console.warn("[support-chat] Rate limit exceeded for session:", sessionId);
      const retryAfter = Math.ceil((rateLimitResult.resetsAt.getTime() - Date.now()) / 1000);
      return new Response(
        JSON.stringify({ 
          error: "Too many requests. Please wait a moment before trying again.",
          retryAfter
        }),
        {
          status: 429,
          headers: { 
            ...corsHeaders, 
            "Content-Type": "application/json",
            "Retry-After": retryAfter.toString()
          },
        }
      );
    }
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("[support-chat] Processing chat request");
    console.log("[support-chat] sessionId:", sessionId, "messages count:", messages?.length || 0);

    // System prompt with event-specific knowledge
    const systemPrompt = `You are a concise, friendly support assistant for Cosmico 2026 (formerly Cosmico).

STYLE RULES:
- Keep answers SHORT — 2-3 sentences max unless the question needs more detail.
- Be direct. Answer the question first, then add context only if helpful.
- Don't repeat the question back. Don't over-explain.
- Warm but efficient. Think texting a friend, not writing an essay.

EXISTING TICKET HOLDERS (IMPORTANT):
- Most people you talk to ALREADY have festival tickets. When a question relates to anything they manage from their account — adding a dinner or add-on, booking lodging, transferring a ticket, getting their QR code, updating info, looking up their order, upgrading — ALWAYS ask early: "Do you already have a festival ticket?"
- If YES (or they say they bought tickets / have an order / are attending): direct them to [your tickets](https://example.invalid/my-tickets) where they can manage everything (add-ons, dinner, lodging for VIP, transfers, QR codes when sent 7 days out).
- If NO: route to [grab tickets](https://example.invalid/tickets) first, then mention they can add the dinner / add-ons after purchase.
- Don't ask if they have a ticket when the question is purely informational (lineup, schedule, what's the venue, etc.).

LINK FORMATTING:
- When you reference a key page, ALWAYS write it as a markdown link so it's clickable in chat: [label](https://full-url).
- Use friendly labels, not raw URLs. Examples:
  - Friday Long Table Dinner → if they have a ticket: [add it from your tickets](https://example.invalid/my-tickets); if not: [grab tickets](https://example.invalid/tickets) first
  - Bar program → [bar info](https://example.invalid/bar)
  - Getting here / parking / shuttles → [getting here](https://example.invalid/gettinghere)
  - Founders / story → [our story](https://example.invalid/story)
  - Tickets → [grab tickets](https://example.invalid/tickets)
  - Lineup → [full lineup](https://example.invalid/lineup)
  - Schedule → [full schedule](https://example.invalid/schedule)
  - Lodging → [book lodging](https://example.invalid/accommodations) (VIP) or [stay info](https://example.invalid/stay)
  - Wine Camp → [Wine Camp lineup](https://example.invalid/winecamp)
  - Food → [food vendors](https://example.invalid/eat)
  - Sauna → [sauna village](https://example.invalid/sauna)
  - Volunteer → [get involved](https://example.invalid/get-involved)
  - Giveaway → [enter the giveaway](https://example.invalid/win)
  - My tickets → [look up your tickets](https://example.invalid/my-tickets)
- Email addresses (hello@example.invalid) can be written plain — they'll auto-link.
- Don't link the same URL twice in one reply. Don't wrap full sentences as link text.

COSMICO 2026:

=== EVENT BASICS ===
- Dates: Friday May 15 – Saturday May 16, 2026 (main festival). Sunday May 17 is a VIP-only bonus show at an intimate offsite Sonoma County location.
- Venue: Wildhaven Sonoma, near Healdsburg, California
- All ages welcome (kids under 12 free with ticketed adult)
- Tickets: https://example.invalid/tickets

=== ARTIST LINEUP (ANNOUNCED — full lineup at https://example.invalid/lineup) ===

FRIDAY MAY 15:
- 7:00 PM — Reed Foehl (duo) — Americana. Grammy-nominated songwriter performing as a duo.
- 8:00 PM — Mood Swing — Live Band. DJ Timoteo Gigante + drummer Ethan Schiff bridging ancestral grooves with contemporary dance culture.
- 9:00 PM — Gilligan Moss — Electronic / Indie Dance. Brooklyn-based duo returning after a triumphant set at Cosmico 2025. Headlining Friday.

SATURDAY MAY 16:
- 1:00 PM — Gaby De La Juentes — DJ Set
- 2:30 PM — Jeremy Sole — DJ Set
- 3:00 PM — Broken Compass Bluegrass — Bluegrass. Forward-leaning bluegrass rooted in tradition.
- 6:00 PM — Maggie Koerner — Soul / Americana. Full band, from New Orleans. Latest album "Upstate."
- 6:30 PM — Alex Amen — Folk / Indie. Full band. Has played Newport Folk Festival, AmericanaFest, ACL.
- 8:00 PM — The Heavy Heavy — Rock / Psychedelia. UK-based headliner. Laurel Canyon-inspired, sun-soaked psychedelia. Saturday headliner.

SUNDAY MAY 17 (VIP ONLY — intimate offsite venue):
- Estero — Cinematic / Instrumental. Brand-new project from Sonoma County locals including Eric Lindell and John Courage.
- 3:00 PM — The Heavy Heavy (Acoustic Set) — A stripped-down acoustic performance.
- 4:00 PM — Starboro — Roots Rock / Americana. Brand-new band featuring Daniel "Womz" Womack (Futurebirds) and Johnny Delaware (Susto). One of their first shows ever.

When asked about music or lineup, share the specific artists and schedule above. Direct them to https://example.invalid/lineup for full details and artist bios.

=== TICKETS (Tier 2 pricing — current prices) ===
1. Weekend Pass (GA 2-Day, Fri & Sat) — $239
   - Most popular. All main stage performances, WineCamp, White Sage Market
   - Does NOT include Sunday show or on-site lodging

2. VIP Weekend Pass (3-Day, Fri–Sun) — $449
   - Everything in GA plus hosted drinks, VIP viewing area, Sunday creek gathering at the founders' home
   - Eligible for on-site glamping add-on

3. Saturday Pass — $169
   - Saturday-only access, main performances, White Sage Market
   - Does NOT include WineCamp

4. Friday Pass — $109
   - Friday-only opening night access, main performances, food & beverage vendors

5. Youth Tickets — Ages 13-17
   - 2-Day (Fri + Sat): $100
   - Saturday Only: $60
   - Children 12 and under are FREE with a ticketed adult

6. Patrons Packages (Premier & Ultimate) — contact hello@example.invalid for details

- Payment plans available at checkout (min $100 cart, 2-payment 50/50 split, final payment due May 1st)
- IMPORTANT: Do NOT mention or discuss Krewe tickets. They are not available for public sale.

=== FULL WEEKEND SCHEDULE (https://example.invalid/schedule) ===
Times subject to change. Final schedule shared with ticket holders the week of the event.

FRIDAY · MAY 15 (GA + VIP)
A long, slow ramp into the weekend. Doors at 4. First notes at 6. Communal dinner at 7.
- 3:00 PM — On-site check-in opens (Wildhaven guests only)
- 3:00–6:00 PM — Sauna & wellness
- 4:00 PM — Festival doors open
- 4:00–10:00 PM — Shuttle service running (continuous loops to/from offsite lots)
- 4:00–9:30 PM — Bars open (GA + VIP)
- 5:00 PM — Food service opens
- 5:00–6:00 PM — Reed Foehl (main stage)
- 5:45 PM — Opening ceremony (land acknowledgment + calling the directions)
- 6:00–7:00 PM — Particle Kid (main stage — Micah Nelson's psychedelic-folk project)
- 7:00 PM — Field Day Dinner (communal picnic-table dinner — opening-night ramen by Naomi McLeod)
- 7:10–7:55 PM — Timoteo Giganté DJ set (dinner soundtrack)
- 7:55–8:55 PM — Mood Swing (main stage)
- 9:00–10:30 PM — Gilligan Moss (main stage — closing the night)

SATURDAY · MAY 16 (GA + VIP)
Coffee on the deck, sauna in the morning, Wine Camp in the afternoon, headliners at golden hour, Jeremy Sole past midnight.
- 8:00–10:00 AM — Coffee + grab-and-go breakfast (Bodega Deck — acoustic pop-up performances)
- 8:00 AM–3:00 PM — Sauna & wellness
- 1:00 PM — Doors open
- 1:00–8:00 PM — Food service
- 1:00–8:00 PM — White Sage Marketplace
- 1:00–4:00 PM — Wine Camp (independent Sonoma winemakers)
- 1:00–5:00 PM — Kids Camp (guided art and nature play)
- 1:00–4:00 PM — Aperol Day Party
- 3:00–10:30 PM — GA Bar open
- 4:00–5:00 PM — Broken Compass Bluegrass (main stage)
- 5:00–10:30 PM — VIP Bar open
- 5:20–6:25 PM — Maggie Koerner (main stage)
- 6:45–8:15 PM — Alex Amen (main stage)
- 8:40–10:30 PM — The Heavy Heavy (Saturday headliner, main stage)
- 10:30 PM — Jeremy Sole — Afters (late-night dancing)

SUNDAY · MAY 17 (VIP ONLY — secret offsite location)
A smaller, more personal closer. Sauna, an acoustic Heavy Heavy set, Starboro into golden hour.
- 8:00–11:00 AM — Sauna open
- 11:00 AM — Guest checkout (on-site stays)
- 1:00 PM — Doors open (VIP party at secret location)
- 1:00–4:00 PM — Pizza service
- 1:30–3:00 PM — Champagne + cheese tasting
- 1:35–2:50 PM — Estero (main stage)
- 3:20–4:20 PM — The Heavy Heavy — Acoustic (main stage)
- 4:50–6:30 PM — Starboro (festival closing set)
- 6:30 PM — Festival close

=== THE EXPERIENCE ===
- WineCamp: A curated group of independent Sonoma County winemakers pouring what they're excited about right now. No pretense — talk shop with the people who made the wine. Full lineup at https://example.invalid/winecamp
- Bar Program — Big West Studio: Two distinct bar environments, Coyote and Raven, produced with Big West Wine Fest (co-produced by Nina Kravetz and Emily Weber). Hosted tasting pours and natural wine. Full info at https://example.invalid/bar
- Food Vendors: Curated lineup of food vendors onsite all weekend. Real food, made by people who care. Full lineup at https://example.invalid/eat
- Friday Long Table Dinner (a.k.a. "Japanese picnic" / "picnic dinner" / "ramen dinner" — these are all the same event): Communal picnic-table opening-night ramen by Naomi McLeod (Field Day + Creative), served around 7:00 PM. Add-on requires a Friday-eligible festival ticket. ALWAYS ask if they already have a festival ticket — if YES, send them to [add the dinner from your tickets](https://example.invalid/my-tickets); if NO, send them to [grab tickets](https://example.invalid/tickets) first and let them know they can add the dinner right after checkout (or anytime from My Tickets).
- Coffee + grab-and-go breakfast: Available on-site Saturday and Sunday mornings (free for guests staying on-site).
- Aperol Day Party: Saturday afternoon day party alongside Wine Camp and Kids Camp.
- Sauna Village: Hot/cold sauna ritual stations running all weekend, between sets and before dinner. Sauna partners (including Fjord and Sundrop Sauna) at https://example.invalid/sauna
- Sound meditation: Guided sound bath / gong meditation sessions (recently led by Anderson Pugash) as part of the wellness programming.
- River swims: Wildhaven sits on the Russian River — swims between sets are part of the day
- White Sage Market: Artisan market with local makers and craftspeople
- Analog Kids: Thoughtfully guided art and nature play for kids, so parents can enjoy WineCamp
- Bodega Deck: Acoustic pop-up performances during the day on Saturday
- Live music across multiple days with curated lineup
- Morning rituals, late-night dancing (Jeremy Sole closing Saturday past midnight)
- Community-centered — this is a gathering, not just a festival

=== GETTING HERE (https://example.invalid/gettinghere) ===
Venue: Wildhaven Sonoma — 2411 Alexander Valley Rd, Healdsburg, CA 95448 (~5 minutes north of downtown Healdsburg, about 75 miles / 1h 20m north of San Francisco). Detailed directions, parking passes, and shuttle schedules emailed 7 days out.

RIDESHARE (Uber / Lyft) — easiest option
- Drop-off and pick-up directly at the venue gate. No shuttle, no walk.
- Strongly recommended for Friday and Saturday nights — late-night surge is real, so request your ride 15–20 min before you actually want to leave.
- No drop-off fee. Riders should pin "2411 Alexander Valley Rd, Healdsburg, CA 95448" as the destination.

BIKE
- Free, staffed bike parking on-site near the main entrance.
- Healdsburg → Wildhaven is a short, scenic ride (~10–15 min on quiet country roads). Great option if you're staying in town.
- We don't store bikes overnight — bring a lock.

DRIVING & PARKING
- On-site parking is reserved for guests staying at Wildhaven (1 car per tent/cabin). It is NOT available for day guests.
- Two offsite paid parking lots near Healdsburg with continuous shuttle loops running to/from the venue all day and night.
- Shuttle parking pass must be purchased in advance — link sent in the pre-event email. Drive-up parking is not guaranteed.
- Carpooling is strongly encouraged — fewer cars = faster shuttles for everyone.
- No overnight parking at the offsite lots; all cars must be picked up by the end of each night.

SHUTTLES
- Continuous loops between the offsite parking lots and the venue gate.
- Friday: running 4:00 PM – 10:00 PM (last shuttle back ~30 min after the closing set).
- Saturday: running 1:00 PM – 11:30 PM.
- Sunday (VIP only): shuttle from a designated Healdsburg pickup to the secret offsite location — details emailed to VIP guests the week of.
- Shuttles are free with your shuttle parking pass. ADA-accessible shuttle available on request — email hello@example.invalid in advance.

DRIVING DROP-OFF (no parking)
- A friend or partner can drop you at the venue gate, but they cannot park there. After drop-off they need to leave or use an offsite lot.

FROM THE AIRPORT
- STS (Charles M. Schulz–Sonoma County) is the closest airport — ~30 min drive to Healdsburg.
- SFO is ~1h 45m, OAK ~1h 30m. Rental car or rideshare from either works.



=== FOUNDERS / STORY ===
- Founded by Event Organizer and Anne Driscoll. Chris is the author of "Analog," a #1 Amazon bestseller about putting phones down and reconnecting in real life.
- Discovery-focused booking — guests trust the curators to introduce them to new music.
- Full story: https://example.invalid/story

=== LODGING & ACCOMMODATIONS ===
- VIP tickets do NOT include lodging, but VIP holders can book on-site stays as an add-on
- Lodging is limited and available only to VIP guests
- RV & SPRINTER VAN CAMPING: We have limited on-site camping spots available for RVs and sprinter vans. This requires a VIP ticket to stay on-site. Availability is very limited. To book, contact us directly at hello@example.invalid — collect their name and email so the team can follow up.
- It's glamping-style at Wildhaven Sonoma — tent cabins or small cabins with real beds, linens, and electricity, right along the river
- Pricing starts at $275/night and varies by accommodation type (tents or cabins)
- More info: https://example.invalid/stay
- To book, VIP holders go to https://example.invalid/accommodations and look up their registration by email
- GA ticket holders do NOT have access to on-site lodging — off-site hotels and vacation rentals are available in nearby Healdsburg

=== VOLUNTEERING ===
- Yes, we are accepting volunteers! Sign up at https://example.invalid/get-involved
- Volunteering is unpaid. You work one 4-hour shift per day in exchange for festival access that day.
- It's a great way to be part of the Reunion community.
- Our 2026 artist lineup and artisan market are fully locked in — not accepting new performer or vendor applications

=== GIVEAWAY ===
- We're running a ticket giveaway at https://example.invalid/win
- Enter for a chance to win free tickets

=== TICKETING FAQ ===

REFUNDS & CANCELLATIONS
- All ticket sales are FINAL and NON-REFUNDABLE — no refunds for change of plans, weather, travel issues, or artist substitutions.
- Lineup is subject to change; individual artist cancellations are not grounds for a refund.
- The event is rain or shine. We only refund if Cosmico itself is fully cancelled by the organizers.
- Payment plan installments are also non-refundable once charged. Missing the May 1st final payment can forfeit the order — email hello@example.invalid immediately if there's a card issue.
- For any refund-adjacent question (medical, military deployment, bereavement), do NOT promise a refund. Offer to escalate with [NEEDS_FOLLOWUP] so the team can review case-by-case.

TICKET TRANSFERS
- Tickets are FULLY TRANSFERABLE to another person at no cost.
- To transfer: the original purchaser emails hello@example.invalid with their order email + the new attendee's full name and email. The team reissues the QR code to the new person.
- Transfers can happen any time up to 24 hours before the event.
- The new attendee must show ID matching the name on the reissued ticket at check-in.
- Do NOT sell tickets above face value — resale on third-party sites (StubHub, etc.) is not supported and those QR codes may be voided if flagged for scalping.

TICKET DELIVERY
- Confirmation email arrives immediately after purchase (check spam/promotions if missing).
- Actual entry QR codes are emailed 7 days before the event — this is intentional, to prevent scalping and screenshot fraud.
- If someone hasn't received their confirmation, ask for the order email and offer to escalate ([NEEDS_FOLLOWUP]) so the team can resend.
- Tickets can also be looked up at https://example.invalid/my-tickets using the purchase email.

ENTRY & CHECK-IN
- Doors: Friday 4:00 PM, Saturday 1:00 PM, Sunday 1:00 PM (VIP only).
- Bring: your QR code (printed or on your phone) + a valid government-issued photo ID.
- Re-entry is allowed all weekend — wristbands are issued at first check-in and must stay on.
- VIP guests use a separate VIP entry lane.
- Sunday is VIP-only at a secret offsite location — exact address shared with VIP holders the week of.

ID & AGE POLICY
- Valid government-issued photo ID required at check-in for everyone 18+.
- Must be 21+ to drink alcohol — separate 21+ wristband issued at the bar with ID check.
- Acceptable IDs: driver's license, passport, state ID, military ID. Photos of IDs are NOT accepted.
- Youth tickets (13–17): must be accompanied by a ticketed adult in the same order. Adult must be physically present at check-in.
- Free Child tickets (0–12): also must be in a ticketed adult's order and accompanied at check-in.
- Name on ID must match name on ticket. If they don't match, the order owner needs to do a transfer in advance (see TICKET TRANSFERS above).

NAME CHANGES
- Name on a ticket can be changed any time before the event by emailing hello@example.invalid from the original purchase email.
- No fee for name changes.

LOST OR FORGOTTEN TICKETS
- If someone shows up without their QR code, the check-in team can look them up by ID + purchase email at the gate. Encourage them to arrive a few minutes earlier.

=== KEY POLICIES ===
- Tickets are NON-REFUNDABLE but can be transferred to another person. Contact hello@example.invalid to arrange.
- Tickets with QR codes are emailed 7 days before the event (to prevent scalping).
- On-site parking is limited to 1 car per tent/cabin. Off-site paid parking with shuttle available.
- Outside alcohol not permitted. Small snacks and water are fine. You can bring your own food.

=== ABOUT COSMICO ===
- A 2-day music and community gathering in Sonoma wine country
- The evolution of Cosmico — same spirit, new name, new home at Wildhaven Sonoma
- Founded on the idea of reconnecting in real life — putting phones down and being present
- "Live in the Real" is the ethos
- Intimate scale (~700 people), not a massive festival

=== COMMON QUESTIONS ===
- "How do I buy tickets?" → https://example.invalid/tickets
- "What music is there?" / "Who's playing?" → Share the lineup above. The full lineup has been announced! Direct to https://example.invalid/lineup
- "Can I come Sunday with GA?" → No, Sunday is VIP only. GA covers Friday & Saturday.
- "Where do I book lodging?" → VIP holders: https://example.invalid/accommodations (look up by email). GA guests: off-site hotels in Healdsburg.
- "Can I bring my RV or sprinter van?" → Yes! Limited on-site spots. VIP ticket required. Contact hello@example.invalid — very limited.
- "Can I volunteer?" → Yes! Visit https://example.invalid/get-involved
- "When will I get my tickets?" → 7 days before the event (to prevent scalping)
- "Can I get a refund?" → Non-refundable but fully transferable. Contact hello@example.invalid.
- "Are kids welcome?" → Yes, under 12 free with a ticketed adult. Youth (13-17) tickets available. Family-friendly spaces and Analog Kids activities.
- "Can I bring my dog?" → No, dogs not allowed (safety reasons). Service animals welcome with documentation.
- "How do I get there?" → Two offsite parking locations near Healdsburg with continuous shuttle loops. Uber/carpooling encouraged. Directions sent before event.
- "What's the Friday schedule?" → Doors open at 4:00 PM, music begins at 5:00 PM. Full schedule at https://example.invalid/schedule
- "What's the schedule?" / "When does X play?" / "What time does it start?" → Full guest schedule with set times for all three days at https://example.invalid/schedule
- "What food is available?" → Curated food vendors onsite all weekend, plus Friday Long Table Dinner with Ramen (advance signup). Full lineup at https://example.invalid/eat. You can bring your own food. No outside alcohol.
- "Japanese picnic" / "picnic dinner" / "ramen dinner" / "Friday dinner" → Yes — that's the Friday Long Table Dinner (communal ramen by Naomi McLeod, ~7 PM Friday). Ask if they already have a festival ticket: if YES, direct them to [add it from your tickets](https://example.invalid/my-tickets); if NO, send them to [grab tickets](https://example.invalid/tickets) and note they can add the dinner right after checkout.
- "Is there a sauna?" / "What's the sauna village?" → Yes — Sauna Village runs all weekend with hot/cold ritual stations between sets. Sauna partners include Fjord and Sundrop Sauna. Full info at https://example.invalid/sauna
- "Which wineries are pouring?" / "What's WineCamp?" → A curated group of independent Sonoma County winemakers pouring what they love right now. WineCamp access is included with VIP and GA 2-Day passes, not Saturday-only passes. Full lineup at https://example.invalid/winecamp
- "Can I swim in the river?" → Yes — Wildhaven sits on the Russian River. River entry and swimming are strictly at your own risk; there are no lifeguards on site, and children must be supervised at all times by the river.
- "Can I bring chairs?" → Yes — high-back and low-back chairs are both welcome. They must be set up in the designated chair area (not in the main standing/dance zones near the stage).
- "Is the festival cashless?" → Yes — Cosmico is cashless. Bring a card; we accept Apple Pay and all major credit cards. Independent food vendors set their own policies but most are card-friendly.
- "Where is medical / first aid?" → On-site medical is at the Medic tent, located right inside the gates as you come through check-in. Find any staff member or head straight to the Medic tent if you need help.
- "Do the tents/cabins lock?" → No — on-site tents and cabins do not lock. Please don't bring valuables; keep wallet, phone, keys, and ID on you, or use a small personal lockbox or your vehicle.
- "Is there power / a fridge in the tents?" → Tents and cabins have power for charging and small essentials. There is no refrigerator in the rooms — bring a cooler with ice for anything that needs to stay cold.
- "How many vehicles can I bring on-site?" → One vehicle per tent or cabin, no exceptions. Additional guests should carpool, use the shuttle from off-site parking, or take a rideshare.
- "Showers and restrooms?" → On-site guests have access to shared showers and shared restrooms. Day guests have clean porta-johns throughout the festival grounds.
- "Can I leave and come back?" → Yes — re-entry is allowed. Keep your wristband on and you're welcome back through the gates.
- "Is the festival ADA accessible?" → Yes — there is wheelchair accessibility throughout the campground, and we can set up a dedicated viewing area for any guest with ADA needs. Reach out at hello@example.invalid in advance with specific requests.
- "Can I bring a camera?" → Yes, personal cameras welcome.
- "What's included in my ticket?" → All tickets include live music, the market, and wellness experiences. WineCamp is included with VIP and GA 2-Day passes only, not Saturday-only passes. VIP also adds exclusive areas, premium viewing, and the Sunday show.
- "What is a Krewe ticket?" → Krewe tickets are not available for public sale. If asked, just redirect to the Weekend or VIP passes.
- "Is there a giveaway?" → Yes! Enter at https://example.invalid/win
- "Can I perform or be a vendor?" → The 2026 lineup and market are fully locked in. Drop your info at /get-involved for future events.

=== PROMO CODE HELP ===
If a user mentions a promo code isn't working, is expired, invalid, or asks for help with a code:
1. Politely ask them to share the exact promo code (e.g., "Sure! What's the code you're trying to use?").
2. Once they share it, call the lookup_promo_code tool with that code.
3. If the code is EXPIRED, do NOT extend it automatically. Tell them the code expired and ASK if they'd like you to extend it by 48 hours so they can use it. Example: "Looks like that code expired on [date]. Want me to extend it by 48 hours so you can still use it?"
   - Only after they confirm (yes/sure/please/etc.), call extend_promo_code with that code, then confirm it's active again and they can retry checkout.
   - If they decline, thank them and let them know you're here if they change their mind.
4. If the code is INACTIVE, MAX_USES_REACHED, or NOT_FOUND, apologize and offer to escalate (add [NEEDS_FOLLOWUP]).
5. If the code is VALID, tell them it's active and to try again — sometimes it's a typo or caching. Ask them to refresh and re-enter exactly as shown.
Never invent or guess promo codes. Only use the tools. Never extend a code without explicit user confirmation.

=== WHEN TO ESCALATE ===
ONLY escalate (add [NEEDS_FOLLOWUP] tag) for:
- Specific payment/checkout errors
- Ticket not received after purchase
- Account access problems
- Accessibility requests
- Questions you truly can't answer

Do NOT escalate for general questions — just answer them.

Contact email: hello@example.invalid
Website: example.invalid`;


    // Enhanced system prompt for escalation detection
    const escalationSystemPrompt = `${systemPrompt}

=== ESCALATION DETECTION ===
Add "[NEEDS_FOLLOWUP]" at the END of your response ONLY for:
- Specific technical errors (payment failed, page broken)
- Ticket not received after confirmed purchase
- Account access problems
- Accessibility requests
- Questions you truly can't answer

Do NOT escalate for general questions — just answer them directly.

The [NEEDS_FOLLOWUP] tag is hidden from the user and triggers a contact form.`;

    // Tool definitions for promo code help
    const tools = [
      {
        type: "function",
        function: {
          name: "lookup_promo_code",
          description: "Look up a promo code to check if it's valid, expired, inactive, or out of uses. Use when a user shares a promo code they need help with.",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "The promo code to check (case-insensitive)" },
            },
            required: ["code"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "extend_promo_code",
          description: "Extend an expired promo code by 48 hours. ONLY call after lookup_promo_code returned status=EXPIRED AND the user has explicitly confirmed they want it extended. Never call without user confirmation.",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string", description: "The promo code to extend" },
            },
            required: ["code"],
          },
        },
      },
    ];

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    async function executeTool(name: string, args: any): Promise<any> {
      const code = String(args?.code || "").trim().toUpperCase();
      if (!code) return { error: "No code provided" };

      if (name === "lookup_promo_code") {
        const { data: promo, error } = await supabaseAdmin
          .from("promo_codes")
          .select("code, is_active, valid_until, valid_from, max_uses, current_uses, discount_type, discount_value, allowed_ticket_types")
          .ilike("code", code)
          .maybeSingle();

        if (error) return { status: "ERROR", message: error.message };
        if (!promo) return { status: "NOT_FOUND", code };
        if (!promo.is_active) return { status: "INACTIVE", code: promo.code };
        if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
          return { status: "EXPIRED", code: promo.code, expired_at: promo.valid_until };
        }
        if (promo.valid_from && new Date(promo.valid_from) > new Date()) {
          return { status: "NOT_YET_ACTIVE", code: promo.code, starts_at: promo.valid_from };
        }
        if (promo.max_uses && promo.current_uses >= promo.max_uses) {
          return { status: "MAX_USES_REACHED", code: promo.code };
        }
        return {
          status: "VALID",
          code: promo.code,
          discount: promo.discount_type === "percentage" ? `${promo.discount_value}% off` : `$${promo.discount_value} off`,
          valid_until: promo.valid_until,
        };
      }

      if (name === "extend_promo_code") {
        const newExpiry = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabaseAdmin
          .from("promo_codes")
          .update({ valid_until: newExpiry, is_active: true, updated_at: new Date().toISOString() })
          .ilike("code", code)
          .select("code, valid_until")
          .maybeSingle();

        if (error) return { status: "ERROR", message: error.message };
        if (!data) return { status: "NOT_FOUND", code };
        console.log("[support-chat] Extended promo code:", data.code, "until", data.valid_until);
        return { status: "EXTENDED", code: data.code, new_valid_until: data.valid_until, hours_added: 72 };
      }

      return { error: "Unknown tool" };
    }

    // Multi-turn loop: allow up to 4 tool calls
    const conversationMessages: any[] = [
      { role: "system", content: escalationSystemPrompt },
      ...messages,
    ];

    let aiMessage = "";
    let response: Response | null = null;

    for (let iter = 0; iter < 5; iter++) {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: conversationMessages,
          tools,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[support-chat] AI gateway error:", response.status, errorText);

        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Service is temporarily busy. Please try again in a moment." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: "Service temporarily unavailable. Please contact support directly." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        throw new Error(`AI gateway error: ${response.status}`);
      }

      const data = await response.json();
      const choice = data.choices[0].message;
      const toolCalls = choice.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        conversationMessages.push(choice);
        for (const tc of toolCalls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
          console.log("[support-chat] Tool call:", tc.function.name, args);
          const result = await executeTool(tc.function.name, args);
          conversationMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        }
        continue;
      }

      aiMessage = choice.content || "";
      break;
    }

    // Check for escalation flag and remove from visible message
    const needsFollowup = aiMessage.includes("[NEEDS_FOLLOWUP]");
    aiMessage = aiMessage.replace(/\s*\[NEEDS_FOLLOWUP\]\s*/g, "").trim();

    console.log("[support-chat] Escalation detected:", needsFollowup);

    // Extract name and email from conversation if mentioned
    const supabase = supabaseAdmin;

    // Only look at user messages for extraction
    const userMessages = messages.filter((m: any) => m.role === "user");
    const conversationText = userMessages.map((m: any) => m.content).join(" ");
    
    // Improved email extraction
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emailMatches = conversationText.match(emailRegex);
    const extractedEmail = emailMatches ? emailMatches[emailMatches.length - 1] : null;

    // Improved name extraction with more patterns
    let extractedName = null;
    const namePatterns = [
      // Pattern for "Name - email@domain.com" format
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*-\s*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/i,
      // Pattern for "Name email@domain.com" format (no dash)
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/i,
      /(?:my name is|i'm|i am|this is|name's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:here|speaking)/i,
      /(?:call me|contact)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /\bI'm\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
    ];
    for (const pattern of namePatterns) {
      const match = conversationText.match(pattern);
      if (match && match[1]) {
        extractedName = match[1].trim();
        break;
      }
    }

    console.log("[support-chat] Extracted info - name:", extractedName, "email:", extractedEmail);

    // Log chatbot interaction as intent signal for lead scoring
    const signalType = extractedEmail ? 'chatbot_email_captured' : 'chatbot_interaction';
    await supabase.from("cart_intent_signals").insert({
      session_id: `chat-${sessionId}`,
      signal_type: signalType,
      email: extractedEmail || null,
      name: extractedName || null,
      lead_status: extractedEmail ? 'warm' : null,
    }).then(({ error }) => {
      if (error) console.error("[support-chat] Failed to log intent signal:", error);
      else console.log("[support-chat] Logged intent signal:", signalType);
    });

    // Create or update chat log
    const fullConversation = [...messages, { role: "assistant", content: aiMessage }];
    
    const { data: existingLog } = await supabase
      .from("chat_logs")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (existingLog) {
      // Update existing log
      await supabase
        .from("chat_logs")
        .update({
          conversation: fullConversation,
          user_name: extractedName || existingLog.user_name,
          user_email: extractedEmail || existingLog.user_email,
          updated_at: new Date().toISOString(),
        })
        .eq("session_id", sessionId);
      
      console.log("[support-chat] Updated chat log for session:", sessionId);
    } else {
      // Create new log
      await supabase
        .from("chat_logs")
        .insert({
          session_id: sessionId,
          conversation: fullConversation,
          user_name: extractedName,
          user_email: extractedEmail,
        });
      
      console.log("[support-chat] Created new chat log for session:", sessionId);
    }

    // Send email notification to admins for new conversations (more than 1 user message)
    const userMessageCount = messages.filter((m: any) => m.role === "user").length;
    if (userMessageCount === 1) {
      try {
        console.log("[support-chat] New conversation detected, sending admin notification");
        
        const { data: adminRoles, error: rolesError } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        console.log("[support-chat] Admin roles found:", adminRoles?.length || 0);
        if (rolesError) console.error("[support-chat] Error fetching admin roles:", rolesError);

        if (adminRoles && adminRoles.length > 0) {
          const adminIds = adminRoles.map((r) => r.user_id);
          const { data: adminProfiles, error: profilesError } = await supabase
            .from("profiles")
            .select("email")
            .in("id", adminIds);

          console.log("[support-chat] Admin profiles found:", adminProfiles?.length || 0);
          if (profilesError) console.error("[support-chat] Error fetching admin profiles:", profilesError);

          if (adminProfiles && adminProfiles.length > 0) {
            const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
            const adminEmails = adminProfiles.map((p) => p.email);

            const conversationHtml = fullConversation
              .map((m: any) => `
                <div style="margin: 10px 0; padding: 10px; background: ${m.role === 'user' ? '#f0f0f0' : '#e3f2fd'}; border-radius: 5px;">
                  <strong>${m.role === 'user' ? 'User' : 'AI'}:</strong>
                  <p>${escapeHtml(m.content)}</p>
                </div>
              `)
              .join("");

            console.log("[support-chat] Sending emails to:", adminEmails);
            console.log("[support-chat] Contact info - Name:", extractedName, "Email:", extractedEmail);
            
            await Promise.all(
              adminEmails.map((adminEmail) =>
                resend.emails.send({
                  from: "The Cosmico Team <hello@example.invalid>",
                  to: adminEmail,
                  subject: `New Chatbot Conversation${extractedName ? ` from ${extractedName}` : ''}`,
                  html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                      <h2 style="color: #333;">New Chatbot Interaction</h2>
                      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        ${extractedName ? `<p style="margin: 5px 0;"><strong>Name:</strong> ${extractedName}</p>` : '<p style="margin: 5px 0;"><em>No name provided</em></p>'}
                        ${extractedEmail ? `<p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${extractedEmail}">${extractedEmail}</a></p>` : '<p style="margin: 5px 0;"><em>No email provided</em></p>'}
                        <p style="margin: 5px 0; font-size: 12px; color: #666;"><strong>Session ID:</strong> ${sessionId}</p>
                      </div>
                      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
                      <h3 style="color: #333;">Conversation:</h3>
                      ${conversationHtml}
                    </div>
                  `,
                })
              )
            );

            console.log("[support-chat] Sent email notifications to admins");
          }
        }
      } catch (emailError) {
        console.error("[support-chat] Failed to send admin emails:", emailError);
        // Don't fail the request if email sending fails
      }
    }

    return new Response(
      JSON.stringify({ 
        message: aiMessage,
        needsFollowup: needsFollowup 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[support-chat] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Unable to process your request. Please try again or contact us directly." 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
