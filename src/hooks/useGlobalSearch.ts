import { useState, useCallback, useMemo, useEffect } from "react";
import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";

interface SearchResult {
  id: string;
  type: "registration" | "artist" | "vendor" | "partner" | "artisan" | "customer";
  title: string;
  subtitle?: string;
  searchableText?: string; // additional text to score against (e.g. email)
  metadata?: Record<string, any>;
  url: string;
}

interface RecentSearch {
  query: string;
  timestamp: number;
}

interface UseGlobalSearchOptions {
  eventId?: string;
  maxResults?: number;
  debounceMs?: number;
}

const RECENT_SEARCHES_KEY = "admin-recent-searches";
const MAX_RECENT_SEARCHES = 10;

// Simple fuzzy matching
function fuzzyMatch(text: string, query: string): boolean {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  
  return queryIndex === queryLower.length;
}

// Score fuzzy matches (higher = better match)
function fuzzyScore(text: string, query: string): number {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  // Exact match = highest score
  if (textLower === queryLower) return 100;
  
  // Starts with = high score
  if (textLower.startsWith(queryLower)) return 80;
  
  // Contains = medium score
  if (textLower.includes(queryLower)) return 60;
  
  // Fuzzy match = lower score based on character positions
  let score = 0;
  let queryIndex = 0;
  let lastMatchIndex = -1;
  
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) score += 5;
      else score += 2;
      
      lastMatchIndex = i;
      queryIndex++;
    }
  }
  
  if (queryIndex === queryLower.length) {
    return score;
  }
  
  return 0;
}

export function useGlobalSearch({
  eventId,
  maxResults = 20,
  debounceMs = 200,
}: UseGlobalSearchOptions = {}) {
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const debouncedQuery = useDebounce(query, debounceMs);

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Save search to recent searches
  const addRecentSearch = useCallback((searchQuery: string) => {
    if (!searchQuery.trim()) return;
    
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s.query !== searchQuery);
      const updated = [{ query: searchQuery, timestamp: Date.now() }, ...filtered].slice(
        0,
        MAX_RECENT_SEARCHES
      );
      
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  // Search registrations
  const { data: registrations } = useAuthQuery({
    queryKey: ["search-registrations", debouncedQuery, eventId],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      
      let queryBuilder = supabase
        .from("registrations")
        .select("id, name, email, ticket_type")
        .or(`name.ilike.%${debouncedQuery}%,email.ilike.%${debouncedQuery}%`)
        .limit(10);

      if (eventId) {
        queryBuilder = queryBuilder.eq("event_id", eventId);
      }

      const { data } = await queryBuilder;
      return data || [];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  // Search artists
  const { data: artists } = useAuthQuery({
    queryKey: ["search-artists", debouncedQuery, eventId],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      
      let queryBuilder = supabase
        .from("artists")
        .select("id, name, genre, pipeline_status")
        .ilike("name", `%${debouncedQuery}%`)
        .limit(10);

      if (eventId) {
        queryBuilder = queryBuilder.eq("event_id", eventId);
      }

      const { data } = await queryBuilder;
      return data || [];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  // Search vendors
  const { data: vendors } = useAuthQuery({
    queryKey: ["search-vendors", debouncedQuery, eventId],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      
      let queryBuilder = supabase
        .from("vendors")
        .select("id, name, category, pipeline_status")
        .ilike("name", `%${debouncedQuery}%`)
        .limit(10);

      if (eventId) {
        queryBuilder = queryBuilder.eq("event_id", eventId);
      }

      const { data } = await queryBuilder;
      return data || [];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  // Search partners
  const { data: partners } = useAuthQuery({
    queryKey: ["search-partners", debouncedQuery, eventId],
    queryFn: async () => {
      if (!debouncedQuery) return [];
      
      let queryBuilder = supabase
        .from("partners")
        .select("id, name, tier, pipeline_status")
        .ilike("name", `%${debouncedQuery}%`)
        .limit(10);

      if (eventId) {
        queryBuilder = queryBuilder.eq("event_id", eventId);
      }

      const { data } = await queryBuilder;
      return data || [];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  // Combine and sort results
  const results: SearchResult[] = useMemo(() => {
    if (!debouncedQuery) return [];

    const allResults: SearchResult[] = [];

    // Add registrations
    registrations?.forEach((reg) => {
      allResults.push({
        id: reg.id,
        type: "registration",
        title: reg.name || reg.email,
        subtitle: [reg.email, reg.ticket_type?.replace(/_/g, " ")].filter(Boolean).join(" · "),
        searchableText: `${reg.name || ""} ${reg.email || ""}`.trim(),
        url: `/admin/registrations?id=${reg.id}`,
      });
    });

    // Add artists
    artists?.forEach((artist) => {
      allResults.push({
        id: artist.id,
        type: "artist",
        title: artist.name,
        subtitle: artist.genre || artist.pipeline_status,
        url: `/admin/artists/${artist.id}`,
      });
    });

    // Add vendors
    vendors?.forEach((vendor) => {
      allResults.push({
        id: vendor.id,
        type: "vendor",
        title: vendor.name,
        subtitle: vendor.category || vendor.pipeline_status,
        url: `/admin/vendors/${vendor.id}`,
      });
    });

    // Add partners
    partners?.forEach((partner) => {
      allResults.push({
        id: partner.id,
        type: "partner",
        title: partner.name,
        subtitle: partner.tier || partner.pipeline_status,
        url: `/admin/partners/${partner.id}`,
      });
    });

    // Sort by fuzzy score — score against title AND searchableText (name + email)
    return allResults
      .map((result) => {
        const titleScore = fuzzyScore(result.title || "", debouncedQuery);
        const extraScore = result.searchableText
          ? fuzzyScore(result.searchableText, debouncedQuery)
          : 0;
        return { ...result, score: Math.max(titleScore, extraScore) };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }, [registrations, artists, vendors, partners, debouncedQuery, maxResults]);

  const isSearching = debouncedQuery.length >= 2;

  return {
    query,
    setQuery,
    results,
    isSearching,
    recentSearches,
    addRecentSearch,
    clearRecentSearches,
  };
}
