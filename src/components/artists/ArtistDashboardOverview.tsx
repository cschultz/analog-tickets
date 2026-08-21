import { useAuthQuery } from "@/hooks/useAuthQuery";
import { supabase } from "@/integrations/supabase/client";
import { 
  AdminCard, 
  AdminCardContent, 
  AdminCardDescription, 
  AdminCardHeader, 
  AdminCardTitle,
  AdminBadge,
  AdminStatCard,
} from "@/components/admin";
import { Users, DollarSign, Clock, CheckCircle, Calendar, TrendingUp } from "lucide-react";
import { format, isFuture, parseISO } from "date-fns";

interface ArtistDashboardOverviewProps {
  eventId?: string;
}

interface OfferStats {
  total: number;
  totalValue: number;
  byStatus: Record<string, number>;
}

interface UpcomingPerformance {
  id: string;
  artist_name: string;
  performance_date: string;
  set_time: string | null;
  stage: string | null;
  offer_amount: number | null;
  status: string;
}

const ArtistDashboardOverview = ({ eventId }: ArtistDashboardOverviewProps) => {
  const { data: artistCount } = useAuthQuery({
    queryKey: ['artist-count', eventId],
    queryFn: async () => {
      if (!eventId) return 0;
      const { count, error } = await supabase
        .from('artists')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!eventId
  });

  const { data: offerStats } = useAuthQuery({
    queryKey: ['offer-stats', eventId],
    queryFn: async () => {
      if (!eventId) return { total: 0, totalValue: 0, byStatus: {} };
      const { data, error } = await supabase
        .from('artist_offers')
        .select('offer_amount, status')
        .eq('event_id', eventId);
      
      if (error) throw error;
      
      const stats: OfferStats = {
        total: data?.length || 0,
        totalValue: data?.reduce((sum, o) => sum + (o.offer_amount || 0), 0) || 0,
        byStatus: {}
      };
      
      data?.forEach(offer => {
        stats.byStatus[offer.status] = (stats.byStatus[offer.status] || 0) + 1;
      });
      
      return stats;
    },
    enabled: !!eventId
  });

  const { data: upcomingPerformances } = useAuthQuery({
    queryKey: ['upcoming-performances', eventId],
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase
        .from('artist_offers')
        .select('id, artist_name, performance_date, set_time, stage, offer_amount, status')
        .eq('event_id', eventId)
        .eq('status', 'accepted')
        .not('performance_date', 'is', null)
        .order('performance_date', { ascending: true });
      
      if (error) throw error;
      return (data || []) as UpcomingPerformance[];
    },
    enabled: !!eventId
  });

  const confirmedValue = upcomingPerformances?.reduce((sum, p) => sum + (p.offer_amount || 0), 0) || 0;

  if (!eventId) {
    return (
      <AdminCard>
        <AdminCardContent className="pt-6">
          <p className="text-[hsl(var(--admin-text-muted))] text-center">Please select an event to view the dashboard.</p>
        </AdminCardContent>
      </AdminCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminStatCard
          title="Total Artists"
          value={artistCount || 0}
          description="In roster"
          icon={<Users className="h-4 w-4" />}
        />

        <AdminStatCard
          title="Total Offers"
          value={offerStats?.total || 0}
          description={`$${(offerStats?.totalValue || 0).toLocaleString()} total value`}
          icon={<TrendingUp className="h-4 w-4" />}
        />

        <AdminStatCard
          title="Confirmed"
          value={offerStats?.byStatus?.accepted || 0}
          description={`$${confirmedValue.toLocaleString()} confirmed`}
          icon={<CheckCircle className="h-4 w-4" />}
        />

        <AdminStatCard
          title="Pending"
          value={(offerStats?.byStatus?.draft || 0) + (offerStats?.byStatus?.sent || 0)}
          description={`${offerStats?.byStatus?.draft || 0} draft, ${offerStats?.byStatus?.sent || 0} sent`}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Offer Pipeline */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-lg">Offer Pipeline</AdminCardTitle>
          <AdminCardDescription>Breakdown of offers by status</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="flex flex-wrap gap-3">
            {[
              { key: 'draft', label: 'Draft', intent: 'neutral' as const },
              { key: 'sent', label: 'Sent', intent: 'info' as const },
              { key: 'accepted', label: 'Accepted', intent: 'success' as const },
              { key: 'declined', label: 'Declined', intent: 'danger' as const },
              { key: 'countered', label: 'Countered', intent: 'warning' as const },
              { key: 'expired', label: 'Expired', intent: 'neutral' as const },
            ].map(status => {
              const count = offerStats?.byStatus?.[status.key] || 0;
              return (
                <div key={status.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--admin-hover))]">
                  <div className={`w-3 h-3 rounded-full ${
                    status.intent === 'success' ? 'bg-[hsl(var(--admin-success))]' :
                    status.intent === 'danger' ? 'bg-[hsl(var(--admin-danger))]' :
                    status.intent === 'warning' ? 'bg-[hsl(var(--admin-warning))]' :
                    status.intent === 'info' ? 'bg-[hsl(var(--admin-info))]' :
                    'bg-[hsl(var(--admin-text-muted))]'
                  }`} />
                  <span className="text-sm font-medium text-[hsl(var(--admin-text))]">{status.label}</span>
                  <AdminBadge intent="neutral" size="sm">{count}</AdminBadge>
                </div>
              );
            })}
          </div>
        </AdminCardContent>
      </AdminCard>

      {/* Upcoming Performances */}
      <AdminCard>
        <AdminCardHeader>
          <AdminCardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Confirmed Performances
          </AdminCardTitle>
          <AdminCardDescription>Artists with accepted offers and scheduled performances</AdminCardDescription>
        </AdminCardHeader>
        <AdminCardContent>
          {!upcomingPerformances?.length ? (
            <p className="text-[hsl(var(--admin-text-muted))] text-center py-4">
              No confirmed performances yet. Accept offers to see them here.
            </p>
          ) : (
            <div className="space-y-3">
              {upcomingPerformances.map(perf => (
                <div 
                  key={perf.id} 
                  className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))] bg-[hsl(var(--admin-surface))] hover:bg-[hsl(var(--admin-hover))] transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <div className="text-xs text-[hsl(var(--admin-text-muted))] uppercase">
                        {format(parseISO(perf.performance_date), 'MMM')}
                      </div>
                      <div className="text-xl font-bold text-[hsl(var(--admin-text))]">
                        {format(parseISO(perf.performance_date), 'd')}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium text-[hsl(var(--admin-text))]">{perf.artist_name}</div>
                      <div className="text-sm text-[hsl(var(--admin-text-muted))]">
                        {perf.set_time && <span>{perf.set_time}</span>}
                        {perf.stage && <span> • {perf.stage}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {perf.offer_amount && (
                      <div className="font-medium text-[hsl(var(--admin-text))]">${perf.offer_amount.toLocaleString()}</div>
                    )}
                    <AdminBadge intent="success">
                      Confirmed
                    </AdminBadge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCardContent>
      </AdminCard>
    </div>
  );
};

export default ArtistDashboardOverview;
