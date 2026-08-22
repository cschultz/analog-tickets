import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton, AdminBadge, AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminScrollArea } from "@/components/admin/AdminScrollArea";
import { 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Activity,
  Smartphone,
  Monitor,
  Tablet,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  AlertCircle,
  Check,
  ShoppingCart,
  Mail,
  MailCheck,
  UserCheck
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow, subDays, subHours } from "date-fns";

interface CheckoutError {
  id: string;
  created_at: string;
  error_type: string;
  error_message: string;
  error_code: string | null;
  ticket_type: string | null;
  user_email: string | null;
  browser: string | null;
  device_type: string | null;
  resolved_at: string | null;
  resolution_notes: string | null;
}

interface CanaryRun {
  id: string;
  run_at: string;
  status: string;
  total_checks: number;
  passed_checks: number;
  warning_checks: number;
  failed_checks: number;
  duration_ms: number | null;
  failed_check_names: string[] | null;
  alert_sent: boolean;
}

interface AbandonedCart {
  id: string;
  email: string;
  name: string | null;
  ticket_type: string | null;
  captured_at: string;
  email_sent_at: string | null;
  converted_at: string | null;
  created_at: string;
}

export default function CheckoutHealthPage() {
  const queryClient = useQueryClient();
  const [isRunningCanary, setIsRunningCanary] = useState(false);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'1h' | '24h' | '7d'>('24h');

  // Fetch recent checkout errors
  const { data: errors = [], isLoading: loadingErrors } = useQuery({
    queryKey: ['checkout-errors', selectedTimeRange],
    queryFn: async () => {
      const cutoff = selectedTimeRange === '1h' 
        ? subHours(new Date(), 1)
        : selectedTimeRange === '24h'
        ? subHours(new Date(), 24)
        : subDays(new Date(), 7);
      
      const { data, error } = await supabase
        .from('checkout_errors')
        .select('*')
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return (data || []) as CheckoutError[];
    },
  });

  // Fetch canary run history
  const { data: canaryRuns = [], isLoading: loadingCanary } = useQuery({
    queryKey: ['canary-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('canary_run_history')
        .select('*')
        .order('run_at', { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return (data || []) as CanaryRun[];
    },
  });

  // Fetch abandoned carts
  const { data: abandonedCarts = [], isLoading: loadingAbandoned } = useQuery({
    queryKey: ['abandoned-carts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checkout_abandonment')
        .select('*')
        .order('captured_at', { ascending: false })
        .limit(200);
      
      if (error) throw error;
      return (data || []) as AbandonedCart[];
    },
  });


  const resolveError = useMutation({
    mutationFn: async ({ errorId, notes }: { errorId: string; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('checkout_errors')
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_notes: notes || 'Resolved by admin',
        })
        .eq('id', errorId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkout-errors'] });
      toast.success('Error marked as resolved');
    },
    onError: (error) => {
      toast.error(`Failed to resolve: ${error.message}`);
    },
  });

  // Run canary check
  const runCanaryCheck = async () => {
    setIsRunningCanary(true);
    try {
      const { data, error } = await supabase.functions.invoke('checkout-canary');
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['canary-runs'] });
      
      if (data.status === 'healthy') {
        toast.success(`All ${data.summary?.total || 0} checks passed`);
      } else if (data.status === 'degraded') {
        toast.warning(`${data.summary?.warnings || 0} warnings detected`);
      } else {
        toast.error(`${data.summary?.failed || 0} checks failed`);
      }
    } catch (error: any) {
      toast.error(`Canary check failed: ${error.message}`);
    } finally {
      setIsRunningCanary(false);
    }
  };

  // Calculate stats
  const unresolvedErrors = errors.filter(e => !e.resolved_at);
  const errorsByType = errors.reduce((acc, e) => {
    acc[e.error_type] = (acc[e.error_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const errorsByBrowser = errors.reduce((acc, e) => {
    const browser = e.browser || 'Unknown';
    acc[browser] = (acc[browser] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const errorsByDevice = errors.reduce((acc, e) => {
    const device = e.device_type || 'unknown';
    acc[device] = (acc[device] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const latestCanary = canaryRuns[0];
  const last24hCanaries = canaryRuns.filter(r => 
    new Date(r.run_at) > subHours(new Date(), 24)
  );
  const healthyRunsPercent = last24hCanaries.length > 0
    ? Math.round((last24hCanaries.filter(r => r.status === 'healthy').length / last24hCanaries.length) * 100)
    : 0;

  const getDeviceIcon = (device: string | null) => {
    switch (device?.toLowerCase()) {
      case 'mobile': return <Smartphone className="h-4 w-4" />;
      case 'tablet': return <Tablet className="h-4 w-4" />;
      default: return <Monitor className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <AdminBadge intent="success" size="sm">Healthy</AdminBadge>;
      case 'degraded':
        return <AdminBadge intent="warning" size="sm">Degraded</AdminBadge>;
      case 'unhealthy':
        return <AdminBadge intent="danger" size="sm">Unhealthy</AdminBadge>;
      default:
        return <AdminBadge intent="neutral" size="sm">{status}</AdminBadge>;
    }
  };

  const getErrorTypeBadge = (type: string) => {
    switch (type) {
      case 'stripe':
        return <AdminBadge intent="danger" size="sm">Stripe</AdminBadge>;
      case 'validation':
        return <AdminBadge intent="warning" size="sm">Validation</AdminBadge>;
      case 'database':
        return <AdminBadge intent="danger" size="sm">Database</AdminBadge>;
      case 'network':
        return <AdminBadge intent="neutral" size="sm">Network</AdminBadge>;
      default:
        return <AdminBadge intent="neutral" size="sm">{type}</AdminBadge>;
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Checkout Health"
        subtitle="Real-time checkout monitoring and error tracking"
        icon={ShieldCheck}
        actions={
          <AdminButton
            onClick={runCanaryCheck}
            disabled={isRunningCanary}
            size="sm"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRunningCanary ? 'animate-spin' : ''}`} />
            Run Health Check
          </AdminButton>
        }
      />

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Current Status */}
        <AdminCard>
          <AdminCardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Current Status</p>
                <p className="text-2xl font-bold capitalize">
                  {latestCanary?.status || 'Unknown'}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                latestCanary?.status === 'healthy' 
                  ? 'bg-[hsl(var(--admin-success))]' 
                  : latestCanary?.status === 'degraded'
                  ? 'bg-[hsl(var(--admin-warning))]'
                  : 'bg-[hsl(var(--admin-danger))]'
              }`}>
                {latestCanary?.status === 'healthy' ? (
                  <CheckCircle2 className="h-6 w-6 text-white" />
                ) : latestCanary?.status === 'degraded' ? (
                  <AlertTriangle className="h-6 w-6 text-white" />
                ) : (
                  <XCircle className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
            {latestCanary && (
              <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-2">
                Last check: {formatDistanceToNow(new Date(latestCanary.run_at), { addSuffix: true })}
              </p>
            )}
          </AdminCardContent>
        </AdminCard>

        {/* 24h Uptime */}
        <AdminCard>
          <AdminCardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">24h Uptime</p>
                <p className="text-2xl font-bold">{healthyRunsPercent}%</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-[hsl(var(--admin-info))] flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-2">
              {last24hCanaries.filter(r => r.status === 'healthy').length} / {last24hCanaries.length} checks healthy
            </p>
          </AdminCardContent>
        </AdminCard>

        {/* Unresolved Errors */}
        <AdminCard>
          <AdminCardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Unresolved Errors</p>
                <p className="text-2xl font-bold">{unresolvedErrors.length}</p>
              </div>
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                unresolvedErrors.length > 0 
                  ? 'bg-[hsl(var(--admin-danger))]' 
                  : 'bg-[hsl(var(--admin-success))]'
              }`}>
                {unresolvedErrors.length > 0 ? (
                  <AlertCircle className="h-6 w-6 text-white" />
                ) : (
                  <Check className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-2">
              {errors.length} total in selected period
            </p>
          </AdminCardContent>
        </AdminCard>

        {/* Error Rate */}
        <AdminCard>
          <AdminCardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Top Error Type</p>
                <p className="text-2xl font-bold capitalize">
                  {Object.entries(errorsByType).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None'}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-[hsl(var(--admin-muted))] flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-[hsl(var(--admin-text-muted))]" />
              </div>
            </div>
            <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-2">
              {Object.entries(errorsByType).sort((a, b) => b[1] - a[1])[0]?.[1] || 0} occurrences
            </p>
          </AdminCardContent>
        </AdminCard>
      </div>

      {/* Main Tabs */}
      <AdminTabs defaultValue="errors" className="space-y-4">
        <AdminTabsList className="grid w-full grid-cols-4">
          <AdminTabsTrigger value="errors" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Errors ({unresolvedErrors.length})
          </AdminTabsTrigger>
          <AdminTabsTrigger value="canary" className="gap-2">
            <Activity className="h-4 w-4" />
            Canary History
          </AdminTabsTrigger>
          <AdminTabsTrigger value="abandoned" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Abandoned ({abandonedCarts.length})
          </AdminTabsTrigger>
          <AdminTabsTrigger value="breakdown" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Browser Breakdown
          </AdminTabsTrigger>
        </AdminTabsList>

        {/* Errors Tab */}
        <AdminTabsContent value="errors" className="space-y-4">
          <AdminCard>
            <AdminCardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <AdminCardTitle className="text-base font-semibold">Checkout Errors</AdminCardTitle>
                <AdminCardDescription className="text-xs">
                  Real-time error tracking from checkout flow
                </AdminCardDescription>
              </div>
              <div className="flex items-center gap-2">
                {(['1h', '24h', '7d'] as const).map((range) => (
                  <AdminButton
                    key={range}
                    variant={selectedTimeRange === range ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTimeRange(range)}
                  >
                    {range}
                  </AdminButton>
                ))}
              </div>
            </AdminCardHeader>
            <AdminCardContent>
              {loadingErrors ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
                </div>
              ) : errors.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-[hsl(var(--admin-success))]" />
                  <p className="text-sm font-medium">No errors in this period</p>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">Checkout is running smoothly!</p>
                </div>
              ) : (
                <AdminScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {errors.map((error) => (
                      <div
                        key={error.id}
                        className={`p-3 rounded-lg border ${
                          error.resolved_at
                            ? 'border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-muted))]/30 opacity-60'
                            : 'border-[hsl(var(--admin-danger))]/30 bg-[hsl(var(--admin-danger))]/10'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {getErrorTypeBadge(error.error_type)}
                              {error.browser && (
                                <AdminBadge intent="neutral" size="sm">
                                  {error.browser}
                                </AdminBadge>
                              )}
                              {error.device_type && (
                                <span className="flex items-center gap-1 text-xs text-[hsl(var(--admin-text-muted))]">
                                  {getDeviceIcon(error.device_type)}
                                  {error.device_type}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium mt-1 truncate">
                              {error.error_message}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-xs text-[hsl(var(--admin-text-muted))]">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatDistanceToNow(new Date(error.created_at), { addSuffix: true })}
                              </span>
                              {error.ticket_type && (
                                <span>Ticket: {error.ticket_type}</span>
                              )}
                              {error.user_email && (
                                <span>{error.user_email}</span>
                              )}
                            </div>
                          </div>
                          {!error.resolved_at && (
                            <AdminButton
                              variant="outline"
                              size="sm"
                              onClick={() => resolveError.mutate({ errorId: error.id, notes: '' })}
                              disabled={resolveError.isPending}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Resolve
                            </AdminButton>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </AdminScrollArea>
              )}
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        {/* Canary History Tab */}
        <AdminTabsContent value="canary" className="space-y-4">
          <AdminCard>
            <AdminCardHeader>
              <AdminCardTitle className="text-base font-semibold">Canary Run History</AdminCardTitle>
              <AdminCardDescription className="text-xs">
                Hourly health checks of the checkout system
              </AdminCardDescription>
            </AdminCardHeader>
            <AdminCardContent>
              {loadingCanary ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-[hsl(var(--admin-text-muted))]" />
                </div>
              ) : canaryRuns.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="h-12 w-12 mx-auto mb-3 text-[hsl(var(--admin-text-muted))]" />
                  <p className="text-sm font-medium">No canary runs yet</p>
                  <p className="text-xs text-[hsl(var(--admin-text-muted))]">Run a health check to start monitoring</p>
                </div>
              ) : (
                <AdminScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {canaryRuns.map((run) => (
                      <div
                        key={run.id}
                        className={`p-3 rounded-lg border ${
                          run.status === 'healthy'
                            ? 'border-[hsl(var(--admin-success))]/30 bg-[hsl(var(--admin-success))]/10'
                            : run.status === 'degraded'
                            ? 'border-[hsl(var(--admin-warning))]/30 bg-[hsl(var(--admin-warning))]/10'
                            : 'border-[hsl(var(--admin-danger))]/30 bg-[hsl(var(--admin-danger))]/10'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getStatusBadge(run.status)}
                            <span className="text-sm">
                              {run.passed_checks}/{run.total_checks} passed
                              {run.warning_checks > 0 && ` • ${run.warning_checks} warnings`}
                              {run.failed_checks > 0 && ` • ${run.failed_checks} failed`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-[hsl(var(--admin-text-muted))]">
                            {run.duration_ms && <span>{run.duration_ms}ms</span>}
                            <span>{format(new Date(run.run_at), 'MMM d, HH:mm')}</span>
                          {run.alert_sent && (
                              <AdminBadge intent="danger" size="sm">Alert Sent</AdminBadge>
                            )}
                          </div>
                        </div>
                        {run.failed_check_names && run.failed_check_names.length > 0 && (
                          <p className="text-xs text-[hsl(var(--admin-danger))] mt-2">
                            Failed: {run.failed_check_names.join(', ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </AdminScrollArea>
              )}
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        {/* Browser Breakdown Tab */}
        <AdminTabsContent value="breakdown" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* By Browser */}
            <AdminCard>
              <AdminCardHeader>
                <AdminCardTitle className="text-base font-semibold">Errors by Browser</AdminCardTitle>
              </AdminCardHeader>
              <AdminCardContent>
                {Object.keys(errorsByBrowser).length === 0 ? (
                  <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-8">
                    No browser data available
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(errorsByBrowser)
                      .sort((a, b) => b[1] - a[1])
                      .map(([browser, count]) => (
                        <div key={browser} className="flex items-center justify-between">
                          <span className="text-sm">{browser}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-[hsl(var(--admin-border))] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[hsl(var(--admin-danger))]"
                                style={{ width: `${(count / errors.length) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </AdminCardContent>
            </AdminCard>

            {/* By Device */}
            <AdminCard>
              <AdminCardHeader>
                <AdminCardTitle className="text-base font-semibold">Errors by Device</AdminCardTitle>
              </AdminCardHeader>
              <AdminCardContent>
                {Object.keys(errorsByDevice).length === 0 ? (
                  <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-8">
                    No device data available
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(errorsByDevice)
                      .sort((a, b) => b[1] - a[1])
                      .map(([device, count]) => (
                        <div key={device} className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-sm">
                            {getDeviceIcon(device)}
                            <span className="capitalize">{device}</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 h-2 bg-[hsl(var(--admin-border))] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[hsl(var(--admin-warning))]"
                                style={{ width: `${(count / errors.length) * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-8 text-right">{count}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </AdminCardContent>
            </AdminCard>

            {/* By Error Type */}
            <AdminCard className="md:col-span-2">
              <AdminCardHeader>
                <AdminCardTitle className="text-base font-semibold">Errors by Type</AdminCardTitle>
              </AdminCardHeader>
              <AdminCardContent>
                {Object.keys(errorsByType).length === 0 ? (
                  <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-8">
                    No errors in this period
                  </p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(errorsByType)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => (
                        <div
                          key={type}
                          className="p-4 rounded-lg bg-[hsl(var(--admin-muted))]/30 text-center"
                        >
                          <p className="text-2xl font-bold">{count}</p>
                          <p className="text-sm text-[hsl(var(--admin-text-muted))] capitalize">{type}</p>
                        </div>
                      ))}
                  </div>
                )}
              </AdminCardContent>
            </AdminCard>
          </div>
        </AdminTabsContent>

        {/* Abandoned Carts Tab */}
        <AdminTabsContent value="abandoned" className="space-y-4">
          <AdminCard>
            <AdminCardHeader>
              <AdminCardTitle className="text-base font-semibold">Abandoned Carts</AdminCardTitle>
              <AdminCardDescription className="text-xs">
                Users who entered their email during checkout but didn't complete purchase
              </AdminCardDescription>
            </AdminCardHeader>
            <AdminCardContent>
              {loadingAbandoned ? (
                <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-8">Loading...</p>
              ) : abandonedCarts.length === 0 ? (
                <p className="text-sm text-[hsl(var(--admin-text-muted))] text-center py-8">
                  No abandoned carts captured yet
                </p>
              ) : (
                <>
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-[hsl(var(--admin-muted))]/30 text-center">
                      <p className="text-2xl font-bold">{abandonedCarts.length}</p>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))]">Total Captured</p>
                    </div>
                    <div className="p-4 rounded-lg bg-[hsl(var(--admin-muted))]/30 text-center">
                      <p className="text-2xl font-bold">{abandonedCarts.filter(c => c.email_sent_at).length}</p>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))]">Emails Sent</p>
                    </div>
                    <div className="p-4 rounded-lg bg-[hsl(var(--admin-muted))]/30 text-center">
                      <p className="text-2xl font-bold">{abandonedCarts.filter(c => c.converted_at).length}</p>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))]">Converted</p>
                    </div>
                    <div className="p-4 rounded-lg bg-[hsl(var(--admin-muted))]/30 text-center">
                      <p className="text-2xl font-bold">
                        {abandonedCarts.length > 0
                          ? Math.round((abandonedCarts.filter(c => c.converted_at).length / abandonedCarts.length) * 100)
                          : 0}%
                      </p>
                      <p className="text-xs text-[hsl(var(--admin-text-muted))]">Recovery Rate</p>
                    </div>
                  </div>

                  {/* Table */}
                  <AdminScrollArea className="h-[400px]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[hsl(var(--admin-border))]">
                          <th className="text-left py-2 px-3 text-[hsl(var(--admin-text-muted))] font-medium">Email</th>
                          <th className="text-left py-2 px-3 text-[hsl(var(--admin-text-muted))] font-medium">Name</th>
                          <th className="text-left py-2 px-3 text-[hsl(var(--admin-text-muted))] font-medium">Ticket</th>
                          <th className="text-left py-2 px-3 text-[hsl(var(--admin-text-muted))] font-medium">Captured</th>
                          <th className="text-left py-2 px-3 text-[hsl(var(--admin-text-muted))] font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {abandonedCarts.map((cart) => (
                          <tr key={cart.id} className="border-b border-[hsl(var(--admin-border))]/50 hover:bg-[hsl(var(--admin-muted))]/20">
                            <td className="py-2 px-3 font-mono text-xs">{cart.email}</td>
                            <td className="py-2 px-3">{cart.name || '—'}</td>
                            <td className="py-2 px-3 capitalize">{cart.ticket_type?.replace(/_/g, ' ') || '—'}</td>
                            <td className="py-2 px-3 text-[hsl(var(--admin-text-muted))]">
                              {formatDistanceToNow(new Date(cart.captured_at), { addSuffix: true })}
                            </td>
                            <td className="py-2 px-3">
                              {cart.converted_at ? (
                                <AdminBadge intent="success" size="sm">
                                  <UserCheck className="h-3 w-3 mr-1" />
                                  Converted
                                </AdminBadge>
                              ) : cart.email_sent_at ? (
                                <AdminBadge intent="info" size="sm">
                                  <MailCheck className="h-3 w-3 mr-1" />
                                  Email Sent
                                </AdminBadge>
                              ) : (
                                <AdminBadge intent="warning" size="sm">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Pending
                                </AdminBadge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </AdminScrollArea>
                </>
              )}
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
