'use client';

import { useState, useTransition } from 'react';
import { Button, ChoiceChips, ChoiceList, FormField, TextInput, useToast } from '@/components/ui';
import { EXERCISES } from '@/content/train/exercises';
import {
  ACTIVITIES,
  BODY_REGIONS,
  EQUIPMENT,
  EXPERIENCE_LEVELS,
  GOAL_LABEL,
  TRAINING_GOALS,
  WEEKDAY_SHORT,
  mondayFirst,
  trainingSetupSchema,
  type BodyRegion,
  type Injury,
  type TrainingSetup,
} from '@/domain';

/**
 * The Train setup: everything the plan engine reads, on one screen.
 *
 * It opens filled in from onboarding, so the shortest path is "look, then
 * save". Validation runs here for immediate feedback and again on the server,
 * which is the one that counts.
 */
export interface SetupFormProps {
  readonly initial: TrainingSetup;
  readonly firstTime: boolean;
  readonly onSave: (setup: TrainingSetup) => Promise<{ ok: true } | { ok: false; message: string }>;
  readonly onCancel?: () => void;
}

const GOAL_HINT: Record<(typeof TRAINING_GOALS)[number], string> = {
  general: 'Strength, a little conditioning, and feeling capable.',
  strength: 'Getting stronger at the main lifts, with heavier sets and longer rests.',
  running: 'Runs that build gradually, with strength work to keep you running.',
  tennis: 'Strength and court footwork, scheduled around your matches.',
};

const EXPERIENCE_LABEL: Record<
  (typeof EXPERIENCE_LEVELS)[number],
  { label: string; hint: string }
> = {
  new: { label: 'New to this', hint: 'The first weeks are deliberately easy.' },
  returning: { label: 'Coming back', hint: 'You have trained before, not lately.' },
  consistent: { label: 'Training regularly', hint: 'Most weeks for the last few months.' },
  experienced: { label: 'Experienced', hint: 'Years of structured training.' },
};

const EQUIPMENT_LABEL: Record<(typeof EQUIPMENT)[number], string> = {
  none: 'Just the floor',
  bands: 'Bands',
  dumbbells: 'Dumbbells',
  barbell: 'Barbell and rack',
  machines: 'Gym machines',
  pull_up_bar: 'Pull-up bar',
  pool: 'Pool',
};

const ACTIVITY_LABEL: Record<(typeof ACTIVITIES)[number], string> = {
  running: 'Running',
  tennis: 'Tennis',
  walking: 'Walking',
};

const REGION_LABEL: Record<BodyRegion, string> = {
  hamstrings: 'Hamstrings',
  hips: 'Hips',
  spine: 'Back',
  shoulders: 'Shoulders',
  knees: 'Knees',
  ankles: 'Ankles',
  wrists: 'Wrists',
  neck: 'Neck',
};

const WEEK = mondayFirst([0, 1, 2, 3, 4, 5, 6]);
const dayChoices = WEEK.map((day) => ({ value: String(day), label: WEEKDAY_SHORT[day]! }));

export function SetupForm({ initial, firstTime, onSave, onCancel }: SetupFormProps) {
  const [goal, setGoal] = useState(initial.goal);
  const [experience, setExperience] = useState(initial.experience);
  const [equipment, setEquipment] = useState<string[]>([...initial.equipment]);
  const [days, setDays] = useState<string[]>(initial.trainingWeekdays.map(String));
  const [minutes, setMinutes] = useState(String(initial.sessionMinutes));
  const [activities, setActivities] = useState<string[]>([...initial.activities]);
  const [tennisDays, setTennisDays] = useState<string[]>(initial.tennisWeekdays.map(String));
  const [pain, setPain] = useState<Partial<Record<BodyRegion, Injury['severity']>>>(
    Object.fromEntries(initial.painFlags.map((flag) => [flag.region, flag.severity])),
  );
  const [avoid, setAvoid] = useState<string[]>([...initial.avoidExercises]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { show } = useToast();

  const playsTennis = goal === 'tennis' || activities.includes('tennis');

  function candidate(): unknown {
    return {
      goal,
      experience,
      equipment: equipment.length === 0 ? ['none'] : equipment,
      trainingWeekdays: days.map(Number),
      sessionMinutes: Number(minutes),
      activities:
        goal === 'tennis' && !activities.includes('tennis')
          ? [...activities, 'tennis']
          : activities,
      tennisWeekdays: playsTennis ? tennisDays.map(Number) : [],
      painFlags: Object.entries(pain).map(([region, severity]) => ({ region, severity })),
      avoidExercises: avoid,
    };
  }

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = trainingSetupSchema.safeParse(candidate());
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message ?? 'Some answers need another look.');
          return;
        }
        setError(null);
        start(async () => {
          try {
            const result = await onSave(parsed.data);
            if (result.ok) show(firstTime ? 'Your plan is ready.' : 'Plan updated.', 'success');
            else setError(result.message);
          } catch {
            show('Could not save. Nothing was changed.', 'warn');
          }
        });
      }}
    >
      <ChoiceList
        legend="What is training for?"
        value={goal}
        onChange={setGoal}
        choices={TRAINING_GOALS.map((value) => ({
          value,
          label: GOAL_LABEL[value],
          hint: GOAL_HINT[value],
        }))}
      />

      <ChoiceList
        legend="Where are you starting from?"
        value={experience}
        onChange={setExperience}
        choices={EXPERIENCE_LEVELS.map((value) => ({ value, ...EXPERIENCE_LABEL[value] }))}
      />

      <ChoiceChips
        legend="Which days can you train? (two to six)"
        choices={dayChoices}
        selected={days}
        onChange={setDays}
      />

      <FormField label="Minutes per session" hint="Warm-up and cool-down included. 10 to 120.">
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            type="number"
            inputMode="numeric"
            min={10}
            max={120}
            step={5}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        )}
      </FormField>

      <ChoiceChips
        legend="What do you have?"
        choices={EQUIPMENT.map((value) => ({ value, label: EQUIPMENT_LABEL[value] }))}
        selected={equipment}
        onChange={setEquipment}
      />

      <ChoiceChips
        legend="Anything else you do?"
        choices={ACTIVITIES.map((value) => ({ value, label: ACTIVITY_LABEL[value] }))}
        selected={activities}
        onChange={setActivities}
      />

      {playsTennis ? (
        <ChoiceChips
          legend="Which days do you play tennis?"
          choices={dayChoices}
          selected={tennisDays}
          onChange={setTennisDays}
        />
      ) : null}

      <fieldset>
        <legend className="mb-1 text-body-sm font-medium text-ink">Anything sore right now?</legend>
        <p className="mb-2 text-body-sm text-ink-muted">
          Mild or moderate gets the easiest version of anything that loads it. Severe keeps it out
          of the plan entirely. This is not a diagnosis; if something is getting worse, see someone
          who can examine it.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {BODY_REGIONS.map((region) => (
            <label
              key={region}
              className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-line-strong bg-surface px-3"
            >
              <span className="text-body text-ink">{REGION_LABEL[region]}</span>
              <select
                className="min-h-10 rounded-md border border-line-strong bg-surface px-2 text-body-sm text-ink"
                value={pain[region] ?? ''}
                onChange={(event) => {
                  const value = event.target.value as Injury['severity'] | '';
                  setPain((current) => {
                    const next = { ...current };
                    if (value === '') delete next[region];
                    else next[region] = value;
                    return next;
                  });
                }}
              >
                <option value="">Fine</option>
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <details className="rounded-md border border-line p-3">
        <summary className="min-h-11 cursor-pointer text-body-sm font-medium text-ink">
          Exercises to leave out{avoid.length > 0 ? ` (${avoid.length})` : ''}
        </summary>
        <div className="mt-3">
          <ChoiceChips
            legend="Never give me these"
            hideLegend
            choices={EXERCISES.map((exercise) => ({ value: exercise.slug, label: exercise.name }))}
            selected={avoid}
            onChange={setAvoid}
          />
        </div>
      </details>

      {error ? (
        <p role="alert" className="text-body-sm text-warn">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={pending}>
          {firstTime ? 'Make my plan' : 'Save and update the plan'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
