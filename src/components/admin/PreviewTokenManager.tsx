import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { 
  AdminButton, 
  AdminInput, 
  AdminCard, 
  AdminCardContent, 
  AdminCardDescription, 
  AdminCardHeader, 
  AdminCardTitle 
} from '@/components/admin';
import { toast } from 'sonner';
import { Copy, Trash2, Plus, RefreshCw } from 'lucide-react';
import { format, addDays } from 'date-fns';

interface PreviewToken {
  id: string;
  token: string;
  name: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
}

const PreviewTokenManager = () => {
  const [tokens, setTokens] = useState<PreviewToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTokenName, setNewTokenName] = useState('Preview Link');

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('preview_access_tokens')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load preview tokens');
      console.error(error);
    } else {
      setTokens(data || []);
    }
    setLoading(false);
  };

  const generateToken = () => {
    const array = new Uint8Array(24);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  };

  const createToken = async () => {
    setCreating(true);
    const token = generateToken();
    const expiresAt = addDays(new Date(), 7);

    const { error } = await supabase
      .from('preview_access_tokens')
      .insert({
        token,
        name: newTokenName || 'Preview Link',
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      toast.error('Failed to create preview token');
      console.error(error);
    } else {
      toast.success('Preview token created');
      setNewTokenName('Preview Link');
      fetchTokens();
    }
    setCreating(false);
  };

  const deleteToken = async (id: string) => {
    const { error } = await supabase
      .from('preview_access_tokens')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete token');
      console.error(error);
    } else {
      toast.success('Token deleted');
      fetchTokens();
    }
  };

  const copyLink = (token: string) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/may/access?token=${token}`;
    navigator.clipboard.writeText(link);
    toast.success('Preview link copied to clipboard');
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <AdminCard>
      <AdminCardHeader>
        <AdminCardTitle className="flex items-center gap-2">
          Preview Access Tokens
          <AdminButton variant="adminGhost" size="icon" onClick={fetchTokens}>
            <RefreshCw className="h-4 w-4" />
          </AdminButton>
        </AdminCardTitle>
        <AdminCardDescription>
          Create shareable preview links for /may/ pages. Links expire after 7 days.
        </AdminCardDescription>
      </AdminCardHeader>
      <AdminCardContent>
        <div className="flex gap-2 mb-6">
          <AdminInput
            placeholder="Token name (optional)"
            value={newTokenName}
            onChange={(e) => setNewTokenName(e.target.value)}
            className="max-w-xs"
          />
          <AdminButton variant="admin" onClick={createToken} disabled={creating}>
            <Plus className="h-4 w-4 mr-2" />
            Create Token
          </AdminButton>
        </div>

        {loading ? (
          <div className="text-[hsl(var(--admin-text-muted))]">Loading...</div>
        ) : tokens.length === 0 ? (
          <div className="text-[hsl(var(--admin-text-muted))]">No preview tokens created yet.</div>
        ) : (
          <div className="space-y-3">
            {tokens.map((token) => (
              <div
                key={token.id}
                className={`flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--admin-border))] ${
                  isExpired(token.expires_at) ? 'bg-[hsl(var(--admin-hover))] opacity-60' : 'bg-[hsl(var(--admin-surface))]'
                }`}
              >
                <div className="flex-1">
                  <div className="font-medium text-[hsl(var(--admin-text))]">{token.name}</div>
                  <div className="text-sm text-[hsl(var(--admin-text-muted))]">
                    {isExpired(token.expires_at) ? (
                      <span className="text-[hsl(var(--admin-danger))]">Expired</span>
                    ) : (
                      <>Expires: {format(new Date(token.expires_at), 'MMM d, yyyy h:mm a')}</>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <AdminButton
                    variant="adminOutline"
                    size="sm"
                    onClick={() => copyLink(token.token)}
                    disabled={isExpired(token.expires_at)}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy Link
                  </AdminButton>
                  <AdminButton
                    variant="adminDestructive"
                    size="sm"
                    onClick={() => deleteToken(token.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCardContent>
    </AdminCard>
  );
};

export default PreviewTokenManager;
