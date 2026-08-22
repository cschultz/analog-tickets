// Scheduled job tracking utilities
// Note: These utilities work with the scheduled_job_history table

type SupabaseClient = { from: (table: string) => any; rpc: (fn: string, params?: any) => Promise<any> };

export interface JobContext {
  jobId: string;
  jobName: string;
  startTime: number;
  supabase: SupabaseClient;
}

/**
 * Start tracking a scheduled job
 */
export async function startJob(
  supabase: SupabaseClient,
  jobName: string,
  metadata?: Record<string, unknown>
): Promise<JobContext | null> {
  try {
    const { data: jobId, error } = await supabase.rpc("start_scheduled_job", {
      p_job_name: jobName,
      p_metadata: metadata || null,
    });

    if (error) {
      console.error(`[${jobName}] Failed to start job tracking:`, error);
      return null;
    }

    console.log(`[${jobName}] Job started with ID: ${jobId}`);

    return {
      jobId,
      jobName,
      startTime: Date.now(),
      supabase,
    };
  } catch (error) {
    console.error(`[${jobName}] Error starting job:`, error);
    return null;
  }
}

/**
 * Complete a tracked job
 */
export async function completeJob(
  ctx: JobContext | null,
  status: "success" | "failed" | "partial",
  recordsProcessed: number = 0,
  errorMessage?: string
): Promise<void> {
  if (!ctx) return;

  const duration = Date.now() - ctx.startTime;

  try {
    const { error } = await ctx.supabase.rpc("complete_scheduled_job", {
      p_job_id: ctx.jobId,
      p_status: status,
      p_records_processed: recordsProcessed,
      p_error_message: errorMessage || null,
    });

    if (error) {
      console.error(`[${ctx.jobName}] Failed to complete job tracking:`, error);
    } else {
      console.log(`[${ctx.jobName}] Job completed: ${status}, ${recordsProcessed} records in ${duration}ms`);
    }
  } catch (error) {
    console.error(`[${ctx.jobName}] Error completing job:`, error);
  }
}

/**
 * Wrapper for running a tracked job
 */
export async function withJobTracking<T>(
  supabase: SupabaseClient,
  jobName: string,
  metadata: Record<string, unknown> | undefined,
  handler: () => Promise<{ recordsProcessed: number; result: T }>
): Promise<T | null> {
  const ctx = await startJob(supabase, jobName, metadata);
  
  try {
    const { recordsProcessed, result } = await handler();
    await completeJob(ctx, "success", recordsProcessed);
    return result;
  } catch (error: any) {
    console.error(`[${jobName}] Job failed:`, error);
    await completeJob(ctx, "failed", 0, error.message);
    throw error;
  }
}

interface JobHistoryRecord {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  duration_ms: number | null;
  records_processed: number;
  error_message: string | null;
}

/**
 * Get recent job history for a specific job
 */
export async function getJobHistory(
  supabase: SupabaseClient,
  jobName: string,
  limit: number = 10
): Promise<JobHistoryRecord[]> {
  const { data, error } = await supabase
    .from("scheduled_job_history")
    .select("id, started_at, completed_at, status, duration_ms, records_processed, error_message")
    .eq("job_name", jobName)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`[${jobName}] Failed to get job history:`, error);
    return [];
  }

  return (data as JobHistoryRecord[]) || [];
}

/**
 * Check if a job is currently running (started but not completed)
 */
export async function isJobRunning(
  supabase: SupabaseClient,
  jobName: string,
  maxAgeMs: number = 30 * 60 * 1000 // 30 minutes default
): Promise<boolean> {
  const cutoffTime = new Date(Date.now() - maxAgeMs).toISOString();

  const { data, error } = await supabase
    .from("scheduled_job_history")
    .select("id")
    .eq("job_name", jobName)
    .eq("status", "running")
    .gt("started_at", cutoffTime)
    .limit(1);

  if (error) {
    console.error(`[${jobName}] Failed to check running status:`, error);
    return false;
  }

  return ((data as any[])?.length || 0) > 0;
}

interface JobStatsRecord {
  status: string;
  duration_ms: number | null;
  records_processed: number | null;
}

/**
 * Get job statistics for the last N hours
 */
export async function getJobStats(
  supabase: SupabaseClient,
  jobName: string,
  hours: number = 24
): Promise<{
  totalRuns: number;
  successCount: number;
  failedCount: number;
  avgDurationMs: number;
  totalRecordsProcessed: number;
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("scheduled_job_history")
    .select("status, duration_ms, records_processed")
    .eq("job_name", jobName)
    .gte("started_at", since);

  if (error || !data) {
    console.error(`[${jobName}] Failed to get job stats:`, error);
    return {
      totalRuns: 0,
      successCount: 0,
      failedCount: 0,
      avgDurationMs: 0,
      totalRecordsProcessed: 0,
    };
  }

  const typedData = data as JobStatsRecord[];
  const successCount = typedData.filter(j => j.status === "success").length;
  const failedCount = typedData.filter(j => j.status === "failed").length;
  const durations = typedData.filter(j => j.duration_ms).map(j => j.duration_ms!);
  const avgDurationMs = durations.length > 0 
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const totalRecordsProcessed = typedData.reduce((sum, j) => sum + (j.records_processed || 0), 0);

  return {
    totalRuns: typedData.length,
    successCount,
    failedCount,
    avgDurationMs,
    totalRecordsProcessed,
  };
}
