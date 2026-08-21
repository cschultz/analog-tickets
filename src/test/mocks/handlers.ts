import { http, HttpResponse } from 'msw';

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL?.replace(/\/+$/, '') ??
  'https://supabase-project-ref.supabase.co';

// Mock data
export const mockEvents = [
  {
    id: 'event-1',
    title: 'Analog Commons 2026',
    slug: 'analog-commons-2026',
    status: 'published',
    start_date: '2026-05-15',
    end_date: '2026-05-17',
    location: 'Example Valley, CA',
    created_at: '2025-01-01T00:00:00Z',
  },
  {
    id: 'event-2',
    title: 'Analog Commons 2027',
    slug: 'analog-commons-2027',
    status: 'draft',
    start_date: '2027-05-14',
    end_date: '2027-05-16',
    location: 'Example Valley, CA',
    created_at: '2025-06-01T00:00:00Z',
  },
];

export const mockRegistrations = [
  {
    id: 'reg-1',
    event_id: 'event-1',
    email: 'alice@example.com',
    first_name: 'Alice',
    last_name: 'Smith',
    ticket_type: 'ga',
    payment_status: 'paid',
    total_amount: 399,
    created_at: '2025-12-01T00:00:00Z',
  },
  {
    id: 'reg-2',
    event_id: 'event-1',
    email: 'bob@example.com',
    first_name: 'Bob',
    last_name: 'Jones',
    ticket_type: 'vip',
    payment_status: 'pending',
    total_amount: 799,
    created_at: '2025-12-02T00:00:00Z',
  },
];

export const mockUser = {
  id: 'user-123',
  email: 'admin@example.org',
  role: 'authenticated',
  aud: 'authenticated',
};

export const mockSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: mockUser,
};

export const handlers = [
  // Auth endpoints
  http.post(`${SUPABASE_URL}/auth/v1/token`, () => {
    return HttpResponse.json({
      ...mockSession,
    });
  }),

  http.get(`${SUPABASE_URL}/auth/v1/user`, () => {
    return HttpResponse.json(mockUser);
  }),

  // Events
  http.get(`${SUPABASE_URL}/rest/v1/event_details`, ({ request }) => {
    const url = new URL(request.url);
    const select = url.searchParams.get('select');
    
    return HttpResponse.json(mockEvents, {
      headers: {
        'Content-Range': '0-1/2',
      },
    });
  }),

  // Registrations
  http.get(`${SUPABASE_URL}/rest/v1/registrations`, ({ request }) => {
    const url = new URL(request.url);
    const eventId = url.searchParams.get('event_id');
    
    const filteredRegs = eventId 
      ? mockRegistrations.filter(r => r.event_id === eventId.replace('eq.', ''))
      : mockRegistrations;
    
    return HttpResponse.json(filteredRegs, {
      headers: {
        'Content-Range': `0-${filteredRegs.length - 1}/${filteredRegs.length}`,
      },
    });
  }),

  // User roles (admin check)
  http.post(`${SUPABASE_URL}/rest/v1/rpc/has_role`, () => {
    return HttpResponse.json(true);
  }),

  // Profiles
  http.get(`${SUPABASE_URL}/rest/v1/profiles`, () => {
    return HttpResponse.json([
      {
        id: 'user-123',
        full_name: 'Admin User',
        avatar_url: null,
      },
    ]);
  }),
];
