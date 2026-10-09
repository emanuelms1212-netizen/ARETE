import Link from 'next/link';
import { EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <div className="w-full">
        <EmptyState
          title="That page does not exist."
          body="The link may be old, or the feature may not be built yet."
          action={
            <Link
              href="/today"
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-body font-medium text-on-accent"
            >
              Back to Today
            </Link>
          }
        />
      </div>
    </main>
  );
}
