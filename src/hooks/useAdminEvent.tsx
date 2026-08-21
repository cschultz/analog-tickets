import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Event {
  id: string;
  title: string;
  event_date: string;
  status: string;
  is_active: boolean;
}

interface AdminEventContextType {
  selectedEventId: string;
  setSelectedEventId: (id: string) => void;
  selectedEvent: Event | null;
  events: Event[] | undefined;
  isLoading: boolean;
}

const AdminEventContext = createContext<AdminEventContextType | undefined>(undefined);

const STORAGE_KEY = "admin-selected-event-id";

export function AdminEventProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [selectedEventId, setSelectedEventIdState] = useState<string>("");

  // Only enable query when user is authenticated
  const isAuthenticated = !!user && !authLoading;

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ["admin-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_details")
        .select("id, title, event_date, status, is_active")
        .order("event_date", { ascending: false });

      if (error) {
        console.error("Error fetching admin events:", error);
        throw error;
      }
      return data as Event[];
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes - events don't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
  });

  // Combined loading state
  const isLoading = authLoading || eventsLoading;

  // Initialize from localStorage or default to published/active event
  useEffect(() => {
    if (events && events.length > 0 && !selectedEventId) {
      const storedId = localStorage.getItem(STORAGE_KEY);
      
      // Check if stored ID is valid
      if (storedId && events.some(e => e.id === storedId)) {
        setSelectedEventIdState(storedId);
      } else {
        // Default to published event or first event
        const publishedEvent = events.find(e => e.status === "published" && e.is_active);
        const defaultEvent = publishedEvent || events[0];
        setSelectedEventIdState(defaultEvent.id);
        localStorage.setItem(STORAGE_KEY, defaultEvent.id);
      }
    }
  }, [events, selectedEventId]);

  const setSelectedEventId = (id: string) => {
    setSelectedEventIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  };

  // Only return selectedEvent if it matches a valid event (prevents "" from being used)
  const selectedEvent = (selectedEventId && events?.find(e => e.id === selectedEventId)) || null;

  return (
    <AdminEventContext.Provider 
      value={{ 
        selectedEventId, 
        setSelectedEventId, 
        selectedEvent,
        events,
        isLoading 
      }}
    >
      {children}
    </AdminEventContext.Provider>
  );
}

export function useAdminEvent() {
  const context = useContext(AdminEventContext);
  if (context === undefined) {
    throw new Error("useAdminEvent must be used within an AdminEventProvider");
  }
  return context;
}
