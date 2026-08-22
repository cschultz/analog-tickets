import { useState, useEffect } from "react";
import { AdminCard, AdminCardContent, AdminCardDescription, AdminCardHeader, AdminCardTitle } from "@/components/admin/AdminCard";
import { AdminButton, AdminBadge, AdminTabs, AdminTabsContent, AdminTabsList, AdminTabsTrigger } from "@/components/admin";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Activity, 
  PlayCircle,
  Clock,
  Zap,
  Database,
  CreditCard,
  Mail,
  Ticket,
  Users,
  TrendingUp,
  Shield,
  HeartPulse
} from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import PreviewTokenManager from "@/components/admin/PreviewTokenManager";

interface HealthCheck {
  name: string;
  status: "passed" | "failed" | "warning";
  message?: string;
  error?: string;
  duration_ms?: number;
}

interface HealthReport {
  timestamp: string;
  status: "healthy" | "degraded" | "unhealthy" | "error";
  summary?: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
    duration_ms: number;
  };
  checks: HealthCheck[];
  error?: string;
}

interface TestResult {
  name: string;
  status: "passed" | "failed" | "skipped";
  message?: string;
  error?: string;
  duration_ms: number;
}

interface TestSuite {
  name: string;
  tests: TestResult[];
}

interface TestReport {
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    status: string;
  };
  suites: TestSuite[];
}

export default function SystemHealthPage() {
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [testReport, setTestReport] = useState<TestReport | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [isLoadingTests, setIsLoadingTests] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      runHealthCheck();
    }, 60000); // Every minute
    
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const runHealthCheck = async () => {
    setIsLoadingHealth(true);
    try {
      const { data, error } = await supabase.functions.invoke("health-check-checkout");

      if (error) {
        toast.error(`Health check failed: ${error.message}`);
        setHealthReport({
          timestamp: new Date().toISOString(),
          status: "error",
          checks: [],
          error: error.message,
        });
        return;
      }

      setHealthReport(data);
      setLastRefresh(new Date());
      
      if (data.status === "healthy") {
        toast.success("All systems operational");
      } else if (data.status === "degraded") {
        toast.warning("System operational with warnings");
      } else {
        toast.error("Critical issues detected");
      }
    } catch (error: any) {
      console.error("Health check error:", error);
      toast.error("Failed to run health check");
    } finally {
      setIsLoadingHealth(false);
    }
  };

  const runTestSuite = async () => {
    setIsLoadingTests(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-ticketing-flow");

      if (error) {
        toast.error(`Test suite failed: ${error.message}`);
        return;
      }

      setTestReport(data);
      
      if (data.summary.status === "PASSED") {
        toast.success(`All ${data.summary.total} tests passed`);
      } else {
        toast.error(`${data.summary.failed} tests failed`);
      }
    } catch (error: any) {
      console.error("Test suite error:", error);
      toast.error("Failed to run test suite");
    } finally {
      setIsLoadingTests(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return <CheckCircle2 className="h-4 w-4 text-[hsl(var(--admin-success))]" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-[hsl(var(--admin-warning))]" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-[hsl(var(--admin-error))]" />;
      case "skipped":
        return <Clock className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getOverallStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
      case "PASSED":
        return "bg-[hsl(var(--admin-success))]";
      case "degraded":
        return "bg-[hsl(var(--admin-warning))]";
      case "unhealthy":
      case "FAILED":
        return "bg-[hsl(var(--admin-danger))]";
      default:
        return "bg-[hsl(var(--admin-muted))]";
    }
  };

  const getCategoryIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("stripe") || lower.includes("payment")) return CreditCard;
    if (lower.includes("database") || lower.includes("supabase")) return Database;
    if (lower.includes("email") || lower.includes("resend")) return Mail;
    if (lower.includes("ticket") || lower.includes("inventory")) return Ticket;
    if (lower.includes("registration") || lower.includes("user")) return Users;
    if (lower.includes("webhook")) return Zap;
    if (lower.includes("env") || lower.includes("secret")) return Shield;
    return Activity;
  };

  const passedPercentage = healthReport?.summary 
    ? Math.round((healthReport.summary.passed / healthReport.summary.total) * 100) 
    : 0;

  const testPassedPercentage = testReport?.summary
    ? Math.round((testReport.summary.passed / testReport.summary.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="System Health"
        subtitle="Monitor system status and run tests"
        icon={HeartPulse}
        actions={
          <AdminButton
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? "border-[hsl(var(--admin-success))] text-[hsl(var(--admin-success))]" : ""}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "Auto-refresh ON" : "Auto-refresh"}
          </AdminButton>
        }
      />

      {/* Status Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Health Status Card */}
        <AdminCard className={healthReport ? "" : "opacity-60"}>
          <AdminCardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">System Status</p>
                <p className="text-2xl font-bold capitalize">
                  {healthReport?.status || "Unknown"}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full ${getOverallStatusColor(healthReport?.status || "")} flex items-center justify-center`}>
                {healthReport?.status === "healthy" ? (
                  <CheckCircle2 className="h-6 w-6 text-white" />
                ) : healthReport?.status === "degraded" ? (
                  <AlertTriangle className="h-6 w-6 text-white" />
                ) : healthReport?.status === "unhealthy" ? (
                  <XCircle className="h-6 w-6 text-white" />
                ) : (
                  <Activity className="h-6 w-6 text-white" />
                )}
              </div>
            </div>
            {healthReport?.summary && (
              <div className="mt-4">
                <div className="h-2 bg-[hsl(var(--admin-border))] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[hsl(var(--admin-success))] transition-all duration-300" 
                    style={{ width: `${passedPercentage}%` }}
                  />
                </div>
                <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                  {healthReport.summary.passed}/{healthReport.summary.total} checks passed
                </p>
              </div>
            )}
          </AdminCardContent>
        </AdminCard>

        <AdminCard className={testReport ? "" : "opacity-60"}>
          <AdminCardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Test Suite</p>
                <p className="text-2xl font-bold">
                  {testReport?.summary.status || "Not Run"}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full ${getOverallStatusColor(testReport?.summary.status || "")} flex items-center justify-center`}>
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
            </div>
            {testReport?.summary && (
              <div className="mt-4">
                <div className="h-2 bg-[hsl(var(--admin-border))] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[hsl(var(--admin-success))] transition-all duration-300" 
                    style={{ width: `${testPassedPercentage}%` }}
                  />
                </div>
                <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-1">
                  {testReport.summary.passed}/{testReport.summary.total} tests passed
                </p>
              </div>
            )}
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[hsl(var(--admin-text-muted))]">Response Time</p>
                <p className="text-2xl font-bold">
                  {healthReport?.summary?.duration_ms 
                    ? `${healthReport.summary.duration_ms}ms` 
                    : "—"}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-[hsl(var(--admin-info))] flex items-center justify-center">
                <Zap className="h-6 w-6 text-white" />
              </div>
            </div>
            {lastRefresh && (
              <p className="text-xs text-[hsl(var(--admin-text-muted))] mt-4">
                Last checked: {lastRefresh.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" })}
              </p>
            )}
          </AdminCardContent>
        </AdminCard>
      </div>

      {/* Main Content Tabs */}
      <AdminTabs defaultValue="health" className="space-y-4">
        <AdminTabsList className="grid w-full grid-cols-3">
          <AdminTabsTrigger value="health" className="gap-2">
            <Activity className="h-4 w-4" />
            Health Checks
          </AdminTabsTrigger>
          <AdminTabsTrigger value="tests" className="gap-2">
            <PlayCircle className="h-4 w-4" />
            Test Suite
          </AdminTabsTrigger>
          <AdminTabsTrigger value="access" className="gap-2">
            <Shield className="h-4 w-4" />
            Access Tokens
          </AdminTabsTrigger>
        </AdminTabsList>

        {/* Health Checks Tab */}
        <AdminTabsContent value="health" className="space-y-4">
          <AdminCard>
            <AdminCardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <AdminCardTitle className="text-base font-semibold">Health Checks</AdminCardTitle>
                <AdminCardDescription className="text-xs">
                  Verify Stripe, database, and email services
                </AdminCardDescription>
              </div>
              <AdminButton onClick={runHealthCheck} disabled={isLoadingHealth} size="sm">
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingHealth ? "animate-spin" : ""}`} />
                Run Checks
              </AdminButton>
            </AdminCardHeader>
            <AdminCardContent>
              {healthReport?.checks && healthReport.checks.length > 0 ? (
                <div className="space-y-2">
                  {healthReport.checks.map((check, index) => {
                    const IconComponent = getCategoryIcon(check.name);
                    return (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          check.status === "failed" 
                            ? "border-[hsl(var(--admin-danger))]/30 bg-[hsl(var(--admin-danger))]/10" 
                            : check.status === "warning"
                            ? "border-[hsl(var(--admin-warning))]/30 bg-[hsl(var(--admin-warning))]/10"
                            : "border-[hsl(var(--admin-success))]/30 bg-[hsl(var(--admin-success))]/10"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <IconComponent className="h-4 w-4 text-[hsl(var(--admin-text-muted))]" />
                          <div>
                            <span className="text-sm font-medium">{check.name}</span>
                            {(check.message || check.error) && (
                              <p className="text-xs text-[hsl(var(--admin-text-muted))]">
                                {check.message || check.error}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {check.duration_ms && (
                            <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                              {check.duration_ms}ms
                            </span>
                          )}
                          {getStatusIcon(check.status)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center text-[hsl(var(--admin-text-muted))] py-12">
                  <Activity className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No health check results</p>
                  <p className="text-xs">Click "Run Checks" to verify system status</p>
                </div>
              )}
            </AdminCardContent>
          </AdminCard>
        </AdminTabsContent>

        {/* Test Suite Tab */}
        <AdminTabsContent value="tests" className="space-y-4">
          <AdminCard>
            <AdminCardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <AdminCardTitle className="text-base font-semibold">Ticketing Flow Tests</AdminCardTitle>
                <AdminCardDescription className="text-xs">
                  Run automated tests for the complete ticketing system
                </AdminCardDescription>
              </div>
              <AdminButton onClick={runTestSuite} disabled={isLoadingTests} size="sm">
                <PlayCircle className={`mr-2 h-4 w-4 ${isLoadingTests ? "animate-pulse" : ""}`} />
                {isLoadingTests ? "Running..." : "Run Tests"}
              </AdminButton>
            </AdminCardHeader>
            <AdminCardContent>
              {testReport?.suites && testReport.suites.length > 0 ? (
                <div className="space-y-6">
                  {testReport.suites.map((suite, suiteIndex) => (
                    <div key={suiteIndex} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">{suite.name}</h4>
                        <AdminBadge intent="neutral" size="sm">
                          {suite.tests.filter(t => t.status === "passed").length}/{suite.tests.length} passed
                        </AdminBadge>
                      </div>
                      <div className="space-y-1">
                        {suite.tests.map((test, testIndex) => (
                          <div
                            key={testIndex}
                            className={`flex items-center justify-between p-2 rounded-md text-sm ${
                              test.status === "failed"
                                ? "bg-[hsl(var(--admin-danger))]/10"
                                : test.status === "passed"
                                ? "bg-[hsl(var(--admin-success))]/10"
                                : "bg-[hsl(var(--admin-muted))]/30"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {getStatusIcon(test.status)}
                              <span>{test.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {test.message && (
                                <span className="text-xs text-[hsl(var(--admin-text-muted))] max-w-48 truncate">
                                  {test.message}
                                </span>
                              )}
                              <span className="text-xs text-[hsl(var(--admin-text-muted))]">
                                {test.duration_ms}ms
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  {/* Summary */}
                  <div className="pt-4 border-t border-[hsl(var(--admin-border))]">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Total</span>
                      <div className="flex gap-4">
                        <span className="text-[hsl(var(--admin-success))]">{testReport.summary.passed} passed</span>
                        {testReport.summary.failed > 0 && (
                          <span className="text-[hsl(var(--admin-error))]">{testReport.summary.failed} failed</span>
                        )}
                        {testReport.summary.skipped > 0 && (
                          <span className="text-[hsl(var(--admin-text-muted))]">{testReport.summary.skipped} skipped</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-[hsl(var(--admin-text-muted))] py-12">
                  <PlayCircle className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">No test results</p>
                  <p className="text-xs">Click "Run Tests" to execute the test suite</p>
                </div>
              )}
            </AdminCardContent>
          </AdminCard>

          {/* Test Documentation Link */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-[hsl(var(--admin-warning)/0.1)] border border-[hsl(var(--admin-warning)/0.3)]">
            <AlertTriangle className="h-4 w-4 text-[hsl(var(--admin-warning))] mt-0.5" />
            <p className="text-sm text-[hsl(var(--admin-text))]">
              For E2E browser tests, run <code className="bg-[hsl(var(--admin-hover))] px-1 py-0.5 rounded text-xs">npx playwright test</code> locally.
              See <code className="bg-[hsl(var(--admin-hover))] px-1 py-0.5 rounded text-xs">docs/ticketing-test-checklist.md</code> for the full manual QA checklist.
            </p>
          </div>
        </AdminTabsContent>

        {/* Access Tokens Tab */}
        <AdminTabsContent value="access">
          <PreviewTokenManager />
        </AdminTabsContent>
      </AdminTabs>
    </div>
  );
}
