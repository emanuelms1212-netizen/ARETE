import { Card, Skeleton, SkeletonText } from '@/components/ui';

export default function AppLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-40" />
      <Card>
        <SkeletonText lines={3} />
      </Card>
      <Card>
        <SkeletonText lines={4} />
      </Card>
    </div>
  );
}
