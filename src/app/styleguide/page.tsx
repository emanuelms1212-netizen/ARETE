import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { StyleguideClient } from './styleguide-client';

export const metadata: Metadata = { title: 'Styleguide' };

/**
 * The design system, rendered.
 *
 * Excluded from production builds: it is a working surface for whoever is
 * changing the system, not a page any user should be able to reach. The guard
 * is a 404 rather than a redirect so the route simply does not exist there.
 */
export default function StyleguidePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <StyleguideClient />;
}
