import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ProcessingStatus {
  isRunning: boolean;
  pending: number;
  complete: number;
}

export function usePhotoProcessing(eventId?: string) {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("manage-photo-cron", {
        body: { action: "status" },
      });
      if (error) throw error;
      setStatus(data);
    } catch (err) {
      console.error("Failed to check processing status:", err);
    }
  }, []);

  // Check status on mount and periodically while running
  useEffect(() => {
    if (!eventId) return;
    checkStatus();

    const interval = setInterval(checkStatus, 15000); // poll every 15s
    return () => clearInterval(interval);
  }, [eventId, checkStatus]);

  const startProcessing = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-photo-cron", {
        body: { action: "start" },
      });
      if (error) throw error;
      toast.success(`Photo processing started! ${data.pending} photos queued.`);
      setStatus(prev => prev ? { ...prev, isRunning: true, pending: data.pending } : { isRunning: true, pending: data.pending, complete: 0 });
    } catch (err) {
      toast.error("Failed to start processing");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const stopProcessing = useCallback(async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke("manage-photo-cron", {
        body: { action: "stop" },
      });
      if (error) throw error;
      toast.success("Photo processing stopped");
      setStatus(prev => prev ? { ...prev, isRunning: false } : null);
    } catch (err) {
      toast.error("Failed to stop processing");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isRunning: status?.isRunning || false,
    pending: status?.pending || 0,
    complete: status?.complete || 0,
    isLoading,
    startProcessing,
    stopProcessing,
    checkStatus,
  };
}
