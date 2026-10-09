import type { ComponentType } from 'react';
import {
  MindIcon,
  PlanIcon,
  ProgressIcon,
  TodayIcon,
  TrainIcon,
  type IconProps,
} from '@/components/icons';

/**
 * The five primary destinations. Settings deliberately lives behind the avatar
 * in the header rather than becoming a sixth tab (PRODUCT_SPEC §4).
 */
export interface Destination {
  readonly href: string;
  readonly label: string;
  readonly question: string;
  readonly Icon: ComponentType<IconProps>;
}

export const destinations: readonly Destination[] = [
  {
    href: '/today',
    label: 'Today',
    question: 'What am I doing right now?',
    Icon: TodayIcon,
  },
  {
    href: '/plan',
    label: 'Plan',
    question: 'What are my goals, tasks and habits?',
    Icon: PlanIcon,
  },
  {
    href: '/train',
    label: 'Train',
    question: 'Workout, flexibility and the body log.',
    Icon: TrainIcon,
  },
  {
    href: '/mind',
    label: 'Mind',
    question: 'Meditation, breathwork, practice and journal.',
    Icon: MindIcon,
  },
  {
    href: '/progress',
    label: 'Progress',
    question: 'What patterns are actually there?',
    Icon: ProgressIcon,
  },
];

/** Everywhere the command launcher can take you. Real routes only. */
export const launcherTargets: readonly Destination[] = destinations;
