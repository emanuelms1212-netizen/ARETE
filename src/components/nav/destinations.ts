/**
 * The five primary destinations. Settings deliberately lives behind the avatar
 * in the header rather than becoming a sixth tab (PRODUCT_SPEC §4).
 */
export interface Destination {
  readonly href: string;
  readonly label: string;
  readonly question: string;
}

export const destinations: readonly Destination[] = [
  { href: '/today', label: 'Today', question: 'What am I doing right now?' },
  { href: '/plan', label: 'Plan', question: 'What are my goals, tasks and habits?' },
  { href: '/train', label: 'Train', question: 'Workout, flexibility and the body log.' },
  { href: '/mind', label: 'Mind', question: 'Meditation, breathwork, practice and journal.' },
  { href: '/progress', label: 'Progress', question: 'What patterns are actually there?' },
];
