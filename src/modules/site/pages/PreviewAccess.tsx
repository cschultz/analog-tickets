import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { usePreviewAccess } from '@/hooks/usePreviewAccess';

// Preview access validation page
const PreviewAccess = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { grantPreviewAccess } = usePreviewAccess();
  const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');
  const [message, setMessage] = useState('Validating access...');

  useEffect(() => {
    const validateToken = async () => {
      const token = searchParams.get('token');
      
      if (!token) {
        setStatus('error');
        setMessage('No access token provided.');
        return;
      }

      try {
        const { data, error } = await supabase.rpc('validate_preview_token', {
          p_token: token
        });

        if (error || !data) {
          setStatus('error');
          setMessage('This preview link is invalid or has expired.');
          return;
        }

        // Token is valid - grant access and redirect
        grantPreviewAccess(token);
        setStatus('success');
        setMessage('Access granted! Redirecting...');
        
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } catch {
        setStatus('error');
        setMessage('Failed to validate access. Please try again.');
      }
    };

    validateToken();
  }, [searchParams, navigate, grantPreviewAccess]);

  return (
    <div className="min-h-screen bg-stone-900 flex items-center justify-center">
      <div className="text-center p-8">
        {status === 'validating' && (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4" />
        )}
        {status === 'success' && (
          <div className="text-green-500 text-4xl mb-4">✓</div>
        )}
        {status === 'error' && (
          <div className="text-red-500 text-4xl mb-4">✕</div>
        )}
        <p className="text-stone-300 text-lg">{message}</p>
        {status === 'error' && (
          <button
            onClick={() => navigate('/auth')}
            className="mt-4 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            Go to Login
          </button>
        )}
      </div>
    </div>
  );
};

export default PreviewAccess;
