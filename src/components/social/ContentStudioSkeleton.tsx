/**
 * ContentStudioSkeleton - Loading skeleton for Content Studio
 * 
 * Shows placeholder grid while content loads for better perceived performance
 */

import { memo } from "react";
import { AdminCard, AdminCardContent } from "@/components/admin";

const SkeletonItem = memo(() => (
  <div className="aspect-square rounded-lg bg-[hsl(var(--admin-surface))] animate-pulse" />
));
SkeletonItem.displayName = 'SkeletonItem';

export const ContentStudioSkeleton = memo(function ContentStudioSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="h-6 w-32 bg-[hsl(var(--admin-surface))] rounded animate-pulse" />
          <div className="h-4 w-48 bg-[hsl(var(--admin-surface))] rounded animate-pulse mt-2" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-24 bg-[hsl(var(--admin-surface))] rounded animate-pulse" />
          <div className="h-8 w-36 bg-[hsl(var(--admin-surface))] rounded animate-pulse" />
          <div className="h-8 w-40 bg-[hsl(var(--admin-surface))] rounded animate-pulse" />
        </div>
      </div>

      {/* Grid skeleton */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {Array.from({ length: 15 }).map((_, i) => (
            <SkeletonItem key={i} />
          ))}
        </div>

        {/* Detail panel skeleton */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <AdminCard>
            <AdminCardContent className="py-12">
              <div className="text-center space-y-3">
                <div className="h-8 w-8 mx-auto bg-[hsl(var(--admin-surface))] rounded animate-pulse" />
                <div className="h-4 w-24 mx-auto bg-[hsl(var(--admin-surface))] rounded animate-pulse" />
                <div className="h-3 w-48 mx-auto bg-[hsl(var(--admin-surface))] rounded animate-pulse" />
              </div>
            </AdminCardContent>
          </AdminCard>
        </div>
      </div>
    </div>
  );
});
