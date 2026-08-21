import { Loader2 } from 'lucide-react';

interface PageLoaderProps {
  message?: string;
}

export function PageLoader({ message = 'Loading...' }: PageLoaderProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--admin-accent))] mx-auto mb-4" />
        <p className="text-[hsl(var(--admin-text-muted))] text-sm">{message}</p>
      </div>
    </div>
  );
}

export function AdminPageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--admin-accent))] mx-auto mb-4" />
        <p className="text-[hsl(var(--admin-text-muted))] text-sm">Loading admin panel...</p>
      </div>
    </div>
  );
}
