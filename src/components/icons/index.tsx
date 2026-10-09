import type { SVGProps } from 'react';

/**
 * The icon set.
 *
 * Drawn here rather than pulled from a package: the brief asks for subtle
 * geometric linework, and a dependency would bring a house style with it.
 * Every icon is a 24x24 stroked path on `currentColor`, so icons inherit text
 * colour and the contrast work in `src/design` covers them too.
 *
 * Icons are decoration. Each one is `aria-hidden`; the accessible name always
 * comes from the text beside it or the control's own label.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  readonly size?: number;
};

function Icon({ size = 22, strokeWidth = 1.5, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

/** Today: a day as a circle with the hour hand of a morning. */
export function TodayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5V12l3 1.75" />
    </Icon>
  );
}

/** Plan: three commitments, the first one chosen. */
export function PlanIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h10M4 12h13M4 17h8" />
      <circle cx="19.25" cy="7" r="1.75" />
    </Icon>
  );
}

/** Train: effort rising and settling. */
export function TrainIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 14.5h3.2l2.4-7 3.1 11 2.6-6.5 1.6 2.5H21" />
    </Icon>
  );
}

/** Mind: attention narrowing to a centre. */
export function MindIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** Progress: a week, unevenly. */
export function ProgressIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-5M12 20v-9M16 20v-4M20 20v-7" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Icon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.75v4.75" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 5.5 18.5 12 8 18.5z" />
    </Icon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 5.5v13M15 5.5v13" />
    </Icon>
  );
}

/** The ARETE mark: an open ring. Attention held, with a way out. */
export function AreteMark({ size = 28, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M12 3.2a8.8 8.8 0 1 1-4.4 1.18" />
    </svg>
  );
}
