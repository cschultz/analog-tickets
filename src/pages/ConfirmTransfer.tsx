import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ConfirmTransfer() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [ticketDetails, setTicketDetails] = useState<{ name: string; type: string } | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    confirmTransfer();
  }, [token]);

  const confirmTransfer = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('confirm-transfer', {
        body: { token }
      });

      if (error) throw error;

      if (data.error) {
        setStatus('error');
        setMessage(data.error);
      } else {
        setStatus('success');
        setMessage(data.message);
        setTicketDetails({
          name: data.newHolderName,
          type: data.ticketType?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
        });
      }
    } catch (err: any) {
      setStatus('error');
      setMessage(err.message || 'Failed to confirm transfer. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#faf9f6] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a1a1a] p-6 text-center">
          <h1 className="text-white text-2xl tracking-widest font-semibold uppercase">ANALOG</h1>
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="w-12 h-12 mx-auto text-gray-400 animate-spin mb-4" />
              <h2 className="text-xl font-semibold text-[#1a1a1a] mb-2">Confirming Transfer...</h2>
              <p className="text-gray-600">Please wait while we complete your ticket transfer.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-[#1a1a1a] mb-2">Transfer Complete!</h2>
              <p className="text-gray-600 mb-4">{message}</p>
              {ticketDetails && (
                <div className="bg-[#f5f5f0] rounded-lg p-4 mb-6 text-left">
                  <p className="text-sm text-gray-600 mb-1">
                    <span className="font-medium">Name:</span> {ticketDetails.name}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Ticket:</span> {ticketDetails.type}
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-500 mb-6">
                Any upgraded access and included perks attached to this ticket are now in your wallet too.
              </p>
              <Button asChild className="bg-[#1a1a1a] hover:bg-[#333] text-white">
                <Link to="/my-tickets">Open My Tickets</Link>
              </Button>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
                <XCircle className="w-10 h-10 text-red-600" />
              </div>
              <h2 className="text-xl font-semibold text-[#1a1a1a] mb-2">Transfer Failed</h2>
              <p className="text-gray-600 mb-6">{message}</p>
              <div className="space-y-3">
                <Button asChild className="w-full bg-[#1a1a1a] hover:bg-[#333] text-white">
                  <Link to="/my-tickets">Go to My Tickets</Link>
                </Button>
                <p className="text-sm text-gray-500">
                  Need help? Contact{' '}
                  <a href="mailto:hello@example.org" className="text-[#1a1a1a] underline">
                    hello@example.org
                  </a>
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#f5f5f0] p-4 text-center">
          <p className="text-xs text-gray-500">
            Cosmico 2026 · May 14–16 · Example Meadow
          </p>
        </div>
      </div>
    </div>
  );
}
