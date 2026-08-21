import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const PREVIEW_ACCESS_KEY = 'analog_preview_access';

export const usePreviewAccess = () => {
  const [hasPreviewAccess, setHasPreviewAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPreviewAccess();
  }, []);

  const checkPreviewAccess = async () => {
    const storedToken = localStorage.getItem(PREVIEW_ACCESS_KEY);
    
    if (!storedToken) {
      setHasPreviewAccess(false);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('validate_preview_token', {
        p_token: storedToken
      });

      if (error || !data) {
        localStorage.removeItem(PREVIEW_ACCESS_KEY);
        setHasPreviewAccess(false);
      } else {
        setHasPreviewAccess(true);
      }
    } catch {
      localStorage.removeItem(PREVIEW_ACCESS_KEY);
      setHasPreviewAccess(false);
    }
    
    setLoading(false);
  };

  const grantPreviewAccess = (token: string) => {
    localStorage.setItem(PREVIEW_ACCESS_KEY, token);
    setHasPreviewAccess(true);
  };

  const revokePreviewAccess = () => {
    localStorage.removeItem(PREVIEW_ACCESS_KEY);
    setHasPreviewAccess(false);
  };

  return { hasPreviewAccess, loading, grantPreviewAccess, revokePreviewAccess, checkPreviewAccess };
};
