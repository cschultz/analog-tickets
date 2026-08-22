import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, CheckCircle, XCircle, ArrowLeft, Users, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { formatTicketType } from "@/lib/utils";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// GuestListCheckIn removed — comp tickets use standard check-in flow

interface Registration {
  id: string;
  name: string;
  email: string;
  ticket_type: string;
  checked_in: boolean;
  checked_in_at: string | null;
  created_at: string;
}

const CheckIn = () => {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate('/auth');
      toast.error('Access denied. Admin privileges required.');
    }
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchRegistrations();
      
      // Set up real-time subscription
      const channel = supabase
        .channel('checkin-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'registrations'
          },
          () => {
            fetchRegistrations();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, isAdmin]);

  useEffect(() => {
    filterRegistrations();
  }, [registrations, searchTerm]);

  const fetchRegistrations = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('registrations')
      .select('id, name, email, ticket_type, checked_in, checked_in_at, created_at')
      .eq('payment_status', 'paid')
      .order('name', { ascending: true });

    if (error) {
      toast.error('Failed to load registrations');
      console.error('Error fetching registrations:', error);
    } else {
      setRegistrations(data || []);
    }
    setIsLoading(false);
  };

  const filterRegistrations = () => {
    if (!searchTerm) {
      setFilteredRegistrations(registrations);
      return;
    }

    const filtered = registrations.filter(reg => 
      reg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      reg.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredRegistrations(filtered);
  };

  const handleCheckIn = async (registration: Registration) => {
    setProcessingIds(prev => new Set(prev).add(registration.id));

    try {
      const { error } = await supabase
        .from('registrations')
        .update({ 
          checked_in: !registration.checked_in,
          checked_in_at: !registration.checked_in ? new Date().toISOString() : null,
          checked_in_by: !registration.checked_in ? user?.id : null
        })
        .eq('id', registration.id);

      if (error) throw error;

      toast.success(
        registration.checked_in 
          ? `${registration.name} checked out` 
          : `${registration.name} checked in!`
      );
      
      fetchRegistrations();
    } catch (error) {
      console.error('Error updating check-in:', error);
      toast.error('Failed to update check-in status');
    } finally {
      setProcessingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(registration.id);
        return newSet;
      });
    }
  };

  const handleQRScan = async (result: string) => {
    setShowScanner(false);
    
    // Validate UUID format (8-4-4-4-12 hex digits)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(result)) {
      toast.error('Invalid ticket QR code format');
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('registrations')
        .select('*')
        .eq('id', result)
        .eq('payment_status', 'paid')
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast.error('Invalid ticket QR code');
        return;
      }

      if (data.checked_in) {
        toast.error(`${data.name} is already checked in`);
        return;
      }

      await handleCheckIn(data as Registration);
    } catch (error) {
      console.error('Error processing QR scan:', error);
      toast.error('Failed to process QR code');
    }
  };

  const stats = {
    total: registrations.length,
    checkedIn: registrations.filter(r => r.checked_in).length,
    remaining: registrations.filter(r => !r.checked_in).length,
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F3EEE6' }}>
        <p style={{ color: '#322821' }}>Loading...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: '#F3EEE6' }}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Button
            onClick={() => navigate('/admin')}
            variant="outline"
            style={{ borderColor: '#D1C2AE', color: '#322821' }}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>

          <h1 className="text-3xl font-semibold mb-2 text-[hsl(var(--admin-text))]">
            Event Check-In
          </h1>
          <p style={{ color: '#7B6E61' }}>
            {stats.checkedIn} of {stats.total} attendees checked in
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card style={{ background: 'rgba(255, 255, 255, 0.6)', borderColor: '#D1C2AE' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium" style={{ color: '#322821' }}>Total Attendees</CardTitle>
              <Users className="h-4 w-4" style={{ color: '#C7A97A' }} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: '#A37552' }}>
                {stats.total}
              </div>
            </CardContent>
          </Card>

          <Card style={{ background: 'rgba(255, 255, 255, 0.6)', borderColor: '#D1C2AE' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium" style={{ color: '#322821' }}>Checked In</CardTitle>
              <CheckCircle className="h-4 w-4" style={{ color: '#4ade80' }} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: '#4ade80' }}>
                {stats.checkedIn}
              </div>
              <p className="text-xs" style={{ color: '#7B6E61' }}>
                {stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0}% complete
              </p>
            </CardContent>
          </Card>

          <Card style={{ background: 'rgba(255, 255, 255, 0.6)', borderColor: '#D1C2AE' }}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium" style={{ color: '#322821' }}>Remaining</CardTitle>
              <XCircle className="h-4 w-4" style={{ color: '#7B6E61' }} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: '#7B6E61' }}>
                {stats.remaining}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for Ticket Registrations and Guest Lists */}
        <Tabs defaultValue="tickets" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto mb-6 grid-cols-2" style={{ background: 'rgba(255, 255, 255, 0.6)' }}>
            <TabsTrigger value="tickets" style={{ color: '#322821' }}>Ticket Registrations</TabsTrigger>
            <TabsTrigger value="guests" style={{ color: '#322821' }}>Guest Lists</TabsTrigger>
          </TabsList>

          <TabsContent value="tickets">
            {/* Search and Scanner */}
            <div className="backdrop-blur-md border-2 p-6 mb-6" style={{
              background: 'rgba(255, 255, 255, 0.6)',
              borderColor: '#D1C2AE',
            }}>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#7B6E61' }} />
                  <Input
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-12 text-lg py-6"
                    style={{ fontSize: '18px' }}
                  />
                </div>
                
                <Button
                  onClick={() => setShowScanner(true)}
                  size="lg"
                  className="w-full"
                  style={{
                    background: '#C7A97A',
                    color: '#F3EEE6',
                  }}
                >
                  <QrCode className="w-5 h-5 mr-2" />
                  Scan QR Code
                </Button>
              </div>
            </div>

            {/* QR Scanner Dialog */}
            <Dialog open={showScanner} onOpenChange={setShowScanner}>
              <DialogContent className="max-w-md" style={{ background: '#F3EEE6' }}>
                <DialogHeader>
                  <DialogTitle style={{ color: '#322821' }}>Scan Ticket QR Code</DialogTitle>
                </DialogHeader>
                <div className="relative">
                  <Scanner
                    onScan={(result) => {
                      if (result && result[0]?.rawValue) {
                        handleQRScan(result[0].rawValue);
                      }
                    }}
                    styles={{
                      container: { width: '100%' }
                    }}
                  />
                  <Button
                    onClick={() => setShowScanner(false)}
                    size="icon"
                    variant="outline"
                    className="absolute top-2 right-2"
                    style={{
                      background: 'rgba(255, 255, 255, 0.9)',
                      borderColor: '#D1C2AE'
                    }}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Attendee List */}
            <div className="space-y-3">
              {filteredRegistrations.map((reg) => (
                <div 
                  key={reg.id}
                  className="backdrop-blur-md border-2 p-6 transition-all hover:shadow-lg"
                  style={{
                    background: reg.checked_in ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255, 255, 255, 0.6)',
                    borderColor: reg.checked_in ? '#4ade80' : '#D1C2AE',
                  }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold" style={{ color: '#322821' }}>
                          {reg.name}
                        </h3>
                        {reg.checked_in && (
                          <Badge style={{ background: '#4ade80', color: 'white' }}>
                            Checked In
                          </Badge>
                        )}
                      </div>
                      <p style={{ color: '#7B6E61' }}>{reg.email}</p>
                      <p className="text-sm mt-1" style={{ color: '#7B6E61' }}>
                        {formatTicketType(reg.ticket_type)}
                      </p>
                      {reg.checked_in_at && (
                        <p className="text-xs mt-1" style={{ color: '#7B6E61' }}>
                          Checked in at {new Date(reg.checked_in_at).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles" })}
                        </p>
                      )}
                    </div>
                    <Button
                      onClick={() => handleCheckIn(reg)}
                      disabled={processingIds.has(reg.id)}
                      size="lg"
                      style={{
                        background: reg.checked_in ? '#7B6E61' : '#C7A97A',
                        color: '#F3EEE6',
                      }}
                    >
                      {processingIds.has(reg.id) ? (
                        'Processing...'
                      ) : reg.checked_in ? (
                        <>
                          <XCircle className="w-5 h-5 mr-2" />
                          Undo
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-5 h-5 mr-2" />
                          Check In
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}

              {filteredRegistrations.length === 0 && (
                <div className="text-center py-12 backdrop-blur-md border-2" style={{ 
                  background: 'rgba(255, 255, 255, 0.6)',
                  borderColor: '#D1C2AE',
                  color: '#7B6E61' 
                }}>
                  {searchTerm ? 'No attendees found matching your search' : 'No paid registrations yet'}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="guests">
            <div className="text-center py-8 text-muted-foreground">
              Guest list check-in is now handled through standard ticket check-in. Comp tickets appear in the registrations list above.
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CheckIn;
