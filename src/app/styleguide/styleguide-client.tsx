'use client';

import { useState } from 'react';
import {
  AlertIcon,
  AreteMark,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  MindIcon,
  PauseIcon,
  PlanIcon,
  PlayIcon,
  PlusIcon,
  ProgressIcon,
  SearchIcon,
  TodayIcon,
  TrainIcon,
} from '@/components/icons';
import {
  BreathingRing,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  FocusTimer,
  FormField,
  ListRow,
  Metric,
  PageHeader,
  SafetyNotice,
  Section,
  SegmentedControl,
  Skeleton,
  SkeletonText,
  StatusDot,
  TextArea,
  TextInput,
  TimerRing,
  ToastProvider,
  useToast,
} from '@/components/ui';
import { AA, contrastRatio } from '@/design/contrast';
import { contrastPairs, palettes, typeScale, type ThemeName } from '@/design/tokens';

const ICONS = {
  TodayIcon,
  PlanIcon,
  TrainIcon,
  MindIcon,
  ProgressIcon,
  SearchIcon,
  CloseIcon,
  CheckIcon,
  ChevronRightIcon,
  AlertIcon,
  PlusIcon,
  PlayIcon,
  PauseIcon,
  AreteMark,
} as const;

function Swatches({ theme }: { theme: ThemeName }) {
  const palette = palettes[theme];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {Object.entries(palette).map(([name, value]) => (
        <div key={name} className="rounded-md border border-line p-2">
          <div
            className="h-10 w-full rounded-sm border border-line"
            style={{ background: value }}
          />
          <p className="mt-1.5 text-body-sm text-ink">{name}</p>
          <p className="font-mono text-label text-ink-muted">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ContrastTable({ theme }: { theme: ThemeName }) {
  const palette = palettes[theme];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-body-sm">
        <thead>
          <tr className="border-b border-line text-label text-ink-muted uppercase">
            <th className="py-2 pr-3 font-semibold">Pair</th>
            <th className="py-2 pr-3 font-semibold">Where</th>
            <th className="py-2 pr-3 font-semibold">Ratio</th>
            <th className="py-2 font-semibold">Needs</th>
          </tr>
        </thead>
        <tbody>
          {contrastPairs.map((pair) => {
            const ratio = contrastRatio(palette[pair.foreground], palette[pair.background]);
            const required = AA[pair.threshold];
            return (
              <tr key={`${pair.foreground}-${pair.background}`} className="border-b border-line">
                <td className="py-2 pr-3 font-mono text-label text-ink">
                  {pair.foreground} / {pair.background}
                </td>
                <td className="py-2 pr-3 text-ink-muted">{pair.where}</td>
                <td className="py-2 pr-3 tabular-nums text-ink">{ratio.toFixed(2)}:1</td>
                <td className="py-2 tabular-nums text-ink-muted">
                  {required}:1 {ratio >= required ? '✓' : '✗'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ToastDemo() {
  const { show } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="quiet" onClick={() => show('Day committed.')}>
        Neutral
      </Button>
      <Button variant="quiet" onClick={() => show('Session recorded.', 'success')}>
        Success
      </Button>
      <Button variant="quiet" onClick={() => show('Offline — saving is paused.', 'warn')}>
        Warning
      </Button>
    </div>
  );
}

export function StyleguideClient() {
  const [segment, setSegment] = useState<'day' | 'week' | 'month'>('week');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  return (
    <ToastProvider>
      <main className="px-safe mx-auto max-w-3xl py-10">
        <PageHeader
          eyebrow="Stage 3"
          title="Design system"
          lede="Every primitive, in every state. Not shipped to production — this route 404s there."
        />

        <div className="space-y-5">
          <Section
            title="Direction"
            hint="Quiet Stoic modernism: ink and charcoal, warm parchment, restrained bronze, stone grey, one calm success colour."
          >
            <p className="text-body text-ink-muted">
              Restraint is the brief. One accent, low chroma, generous space. No gradients, no
              glassmorphism, no gold, no marble. Shadow says “this floats above the page” and
              nothing else. Motion is short and purposeful, and every animation stops under{' '}
              <code className="font-mono text-body-sm">prefers-reduced-motion</code>.
            </p>
          </Section>

          <Section title="Palette — light">
            <Swatches theme="light" />
          </Section>
          <Section title="Palette — dark">
            <Swatches theme="dark" />
          </Section>

          <Section
            title="Measured contrast — light"
            hint="Computed from the tokens, not asserted. The same numbers are a unit test."
          >
            <ContrastTable theme="light" />
          </Section>
          <Section title="Measured contrast — dark">
            <ContrastTable theme="dark" />
          </Section>

          <Section title="Type scale" hint="Display is Fraunces; everything else is Inter.">
            <div className="space-y-3">
              {Object.entries(typeScale).map(([name, step]) => (
                <div key={name} className="border-b border-line pb-3 last:border-b-0">
                  <p className="font-mono text-label text-ink-muted">
                    {name} · {step.size} / {step.lineHeight} · {step.family}
                  </p>
                  <p
                    className={step.family === 'display' ? 'font-display font-semibold' : ''}
                    style={{ fontSize: step.size, lineHeight: step.lineHeight }}
                  >
                    Attend to what is in your control.
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Buttons" hint="Every variant, size and state. All keep a 44px hit area.">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button>Commit to today</Button>
                <Button variant="quiet">Not today</Button>
                <Button variant="ghost">Skip</Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm">Small</Button>
                <Button size="sm" variant="quiet" icon={<PlusIcon size={16} />}>
                  With icon
                </Button>
                <Button loading>Saving</Button>
                <Button disabled>Disabled</Button>
                <Button variant="quiet" disabled>
                  Disabled quiet
                </Button>
              </div>
            </div>
          </Section>

          <Section title="Metrics">
            <div className="flex flex-wrap gap-8">
              <Metric label="Minimum" value="2/2" note="Met." tone="success" />
              <Metric label="Focus" value={75} unit="min" note="Across 3 sessions" />
              <Metric label="Skipped" value={1} note="Left out of the ratio" tone="muted" />
            </div>
          </Section>

          <Section title="List rows" hint="A row is interactive only when it has somewhere to go.">
            <ul>
              <ListRow
                leading={<StatusDot tone="done" />}
                title="Sit for ten minutes"
                trailing="Done"
              />
              <ListRow leading={<StatusDot tone="open" />} title="Read ten pages" trailing="Open" />
              <ListRow
                leading={<StatusDot tone="skipped" />}
                title="Lower body"
                detail="Slept badly"
                muted
                trailing="Skipped"
              />
              <ListRow title="A row that navigates" detail="Has an href" href="/today" />
            </ul>
          </Section>

          <Section title="States">
            <div className="space-y-3">
              <EmptyState
                title="Nothing planned yet."
                body="Pick one thing."
                action={<Button size="sm">Add one</Button>}
              />
              <ErrorState
                title="This screen could not load."
                body="Nothing you recorded has been lost."
                action={<Button size="sm">Try again</Button>}
              />
              <Card className="p-4">
                <SkeletonText lines={3} />
                <Skeleton className="mt-3 h-10 w-full" />
              </Card>
            </div>
          </Section>

          <Section title="Safety notice" hint="The one surface every risky module must use.">
            <SafetyNotice
              title="Before any cold or heat exposure"
              action={
                <Button size="sm" variant="quiet">
                  Read the full notice
                </Button>
              }
            >
              <p>
                Heat and cold immersion carry real risk — fainting, cold shock, and interactions
                with heart conditions, pregnancy, blood-pressure medication and alcohol. This is a
                self-management tool, not medical advice.
              </p>
              <p>Never do cold immersion alone. Start below the numbers in the source material.</p>
            </SafetyNotice>
          </Section>

          <Section title="Form fields">
            <div className="space-y-4">
              <FormField label="Wake time" hint="No default is imposed. Change it whenever.">
                {({ id, describedBy }) => (
                  <TextInput
                    id={id}
                    aria-describedby={describedBy}
                    type="time"
                    defaultValue="07:00"
                  />
                )}
              </FormField>
              <FormField label="Water target" error="Enter a number between 0.5 and 6.">
                {({ id, describedBy }) => (
                  <TextInput id={id} aria-describedby={describedBy} invalid defaultValue="40" />
                )}
              </FormField>
              <FormField label="What actually happened?" hint="Two or three lines is plenty.">
                {({ id, describedBy }) => (
                  <TextArea id={id} aria-describedby={describedBy} placeholder="Today I…" />
                )}
              </FormField>
            </div>
          </Section>

          <Section title="Segmented control" hint="Real radio inputs, so arrow keys work.">
            <SegmentedControl
              legend="Range"
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
              value={segment}
              onChange={setSegment}
            />
            <p className="mt-2 text-body-sm text-ink-muted">Selected: {segment}</p>
          </Section>

          <Section
            title="Sheet, dialog and confirmation"
            hint="One component: a bottom sheet on phones, a centred dialog from sm up."
          >
            <div className="flex flex-wrap gap-2">
              <Button variant="quiet" onClick={() => setSheetOpen(true)}>
                Open sheet
              </Button>
              <Button variant="quiet" onClick={() => setConfirmOpen(true)}>
                Open confirmation
              </Button>
            </div>
            {confirmed ? (
              <p className="mt-2 text-body-sm text-ink-muted">Last answer: {confirmed}</p>
            ) : null}

            <Dialog
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              title="Mark the day"
              description="Travel and low-readiness days shrink the day rather than failing it."
              footer={<Button onClick={() => setSheetOpen(false)}>Close</Button>}
            >
              <ul>
                <ListRow title="Travel day" detail="Minimum only; the program holds" />
                <ListRow title="Not today" detail="Injury, illness, poor sleep, no time" />
              </ul>
            </Dialog>

            <ConfirmDialog
              open={confirmOpen}
              title="Delete everything?"
              description="This removes every goal, session, log and journal entry. It cannot be undone."
              confirmLabel="Delete everything"
              onConfirm={() => {
                setConfirmed('confirmed');
                setConfirmOpen(false);
              }}
              onCancel={() => {
                setConfirmed('cancelled');
                setConfirmOpen(false);
              }}
            />
          </Section>

          <Section title="Toasts" hint="Report what happened. Never the only way to do something.">
            <ToastDemo />
          </Section>

          <Section
            title="Timer ring"
            hint="Geometry only. The number inside is the accessible content."
          >
            <div className="flex flex-wrap items-center gap-6">
              {[0, 0.35, 0.75, 1].map((value) => (
                <TimerRing key={value} progress={value} size={96}>
                  <span className="text-body font-semibold tabular-nums text-ink">
                    {Math.round(value * 100)}%
                  </span>
                </TimerRing>
              ))}
            </div>
          </Section>

          <Section
            title="Focus timer"
            hint="Wall-clock driven, so backgrounding the tab cannot drift it."
          >
            <div className="py-2">
              <FocusTimer totalSeconds={60} />
            </div>
          </Section>

          <Section
            title="Breathing pacer"
            hint="Four in, two held, six out. With reduced motion the ring rests and the cue keeps the pacing."
          >
            <div className="py-4">
              <BreathingRing />
            </div>
          </Section>

          <Section title="Icons" hint="Drawn here, not imported. 24px grid, stroked, currentColor.">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {Object.entries(ICONS).map(([name, Component]) => (
                <div
                  key={name}
                  className="flex flex-col items-center gap-1.5 rounded-md border border-line p-3 text-ink"
                >
                  <Component size={22} />
                  <span className="text-label text-ink-muted">{name.replace('Icon', '')}</span>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </main>
    </ToastProvider>
  );
}
