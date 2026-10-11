'use client';

import { useState } from 'react';
import { ChoiceChips, ChoiceList, FormField, Switch, TextInput } from '@/components/ui';
import {
  FOCUS_AREAS,
  type FoodAnswers,
  type HealthAnswers,
  type IntentAnswers,
  type MindAnswers,
  type MinimumAnswers,
  type OnboardingProfile,
  type ScheduleAnswers,
  type TrainingAnswers,
} from '@/domain';
import { StepShell } from './step-shell';

export interface StepProps {
  readonly profile: OnboardingProfile;
  readonly onSave: (answers: unknown) => void | Promise<void>;
  readonly onSkip: () => void | Promise<void>;
}

const WEEKDAYS = [
  { value: '1', label: 'Mon' },
  { value: '2', label: 'Tue' },
  { value: '3', label: 'Wed' },
  { value: '4', label: 'Thu' },
  { value: '5', label: 'Fri' },
  { value: '6', label: 'Sat' },
  { value: '0', label: 'Sun' },
] as const;

function toDays(values: readonly string[]): number[] {
  return values.map(Number).sort();
}

function fromDays(days: readonly number[]): string[] {
  return days.map(String);
}

// ---------------------------------------------------------------------------

export function IntentStep({ profile, onSave, onSkip }: StepProps) {
  const [focuses, setFocuses] = useState<IntentAnswers['focuses']>(profile.intent.focuses);
  const [goals, setGoals] = useState<string[]>([...profile.intent.goals, '', '', ''].slice(0, 3));

  return (
    <StepShell
      step="intent"
      title="What do you want this to help with?"
      onContinue={() => onSave({ focuses, goals: goals.map((g) => g.trim()).filter(Boolean) })}
      onSkip={onSkip}
    >
      <ChoiceChips
        legend="Pick as many as apply"
        choices={FOCUS_AREAS.map((area) => ({
          value: area,
          label: area.charAt(0).toUpperCase() + area.slice(1),
        }))}
        selected={focuses}
        onChange={(next) => setFocuses(next as IntentAnswers['focuses'])}
      />

      <div className="space-y-3">
        <p className="text-body-sm font-medium text-ink">
          Up to three things you actually want out of this
        </p>
        <p className="text-body-sm text-ink-muted">
          Three at most, on purpose. A list of twelve goals is a list of none.
        </p>
        {goals.map((goal, index) => (
          <FormField key={index} label={`Goal ${index + 1}`}>
            {({ id }) => (
              <TextInput
                id={id}
                value={goal}
                placeholder={index === 0 ? 'Stop starting over' : 'Optional'}
                onChange={(event) =>
                  setGoals((current) =>
                    current.map((value, position) =>
                      position === index ? event.target.value : value,
                    ),
                  )
                }
              />
            )}
          </FormField>
        ))}
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------

export function ScheduleStep({ profile, onSave, onSkip }: StepProps) {
  const [days, setDays] = useState(fromDays(profile.schedule.availableWeekdays));
  const [style, setStyle] = useState<ScheduleAnswers['planningStyle']>(
    profile.schedule.planningStyle,
  );
  const [constraint, setConstraint] = useState<ScheduleAnswers['weekdayConstraint']>(
    profile.schedule.weekdayConstraint,
  );
  const [wake, setWake] = useState(profile.schedule.wakeTime ?? '');
  const [sleep, setSleep] = useState(profile.schedule.sleepTime ?? '');

  return (
    <StepShell
      step="schedule"
      title="When are you actually free?"
      onContinue={() =>
        onSave({
          availableWeekdays: toDays(days),
          planningStyle: style,
          weekdayConstraint: constraint,
          ...(wake ? { wakeTime: wake } : {}),
          ...(sleep ? { sleepTime: sleep } : {}),
        })
      }
      onSkip={onSkip}
    >
      <ChoiceChips
        legend="Days you are generally available"
        choices={WEEKDAYS}
        selected={days}
        onChange={setDays}
      />

      <ChoiceList
        legend="What takes up most of your week?"
        choices={[
          { value: 'none', label: 'Nothing fixed' },
          { value: 'work', label: 'Work' },
          { value: 'school', label: 'School or study' },
          { value: 'shift', label: 'Shift work', hint: 'Days vary week to week.' },
          { value: 'caring', label: 'Caring for someone' },
        ]}
        value={constraint}
        onChange={(next) => setConstraint(next as ScheduleAnswers['weekdayConstraint'])}
      />

      <ChoiceList
        legend="How much structure do you want?"
        choices={[
          { value: 'light', label: 'Light', hint: 'A few things a day, loosely ordered.' },
          { value: 'structured', label: 'Structured', hint: 'Blocks, with times on them.' },
        ]}
        value={style}
        onChange={(next) => setStyle(next as ScheduleAnswers['planningStyle'])}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Usual wake time" hint="Optional. ARETE imposes no wake time, ever.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="time"
              value={wake}
              onChange={(event) => setWake(event.target.value)}
            />
          )}
        </FormField>
        <FormField label="Usual sleep time" hint="Optional.">
          {({ id, describedBy }) => (
            <TextInput
              id={id}
              aria-describedby={describedBy}
              type="time"
              value={sleep}
              onChange={(event) => setSleep(event.target.value)}
            />
          )}
        </FormField>
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------

export function TrainingStep({ profile, onSave, onSkip }: StepProps) {
  const [experience, setExperience] = useState<TrainingAnswers['experience']>(
    profile.training.experience,
  );
  const [recent, setRecent] = useState<TrainingAnswers['recentActivity']>(
    profile.training.recentActivity,
  );
  const [equipment, setEquipment] = useState<string[]>([...profile.training.equipment]);
  const [minutes, setMinutes] = useState(String(profile.training.sessionMinutes));
  const [preferred, setPreferred] = useState(fromDays(profile.training.preferredWeekdays));

  return (
    <StepShell
      step="training"
      title="Where are you starting from?"
      onContinue={() =>
        onSave({
          experience,
          recentActivity: recent,
          equipment: equipment.length > 0 ? equipment : ['none'],
          sessionMinutes: Number(minutes) || 30,
          preferredWeekdays: toDays(preferred),
        })
      }
      onSkip={onSkip}
    >
      <ChoiceList
        legend="How much training have you done?"
        choices={[
          { value: 'new', label: 'New to it' },
          { value: 'returning', label: 'Coming back after a break' },
          { value: 'consistent', label: 'Fairly consistent' },
          { value: 'experienced', label: 'Experienced' },
        ]}
        value={experience}
        onChange={(next) => setExperience(next as TrainingAnswers['experience'])}
      />

      <ChoiceList
        legend="And in the last month?"
        choices={[
          { value: 'none', label: 'Nothing much' },
          { value: 'light', label: 'A bit of walking or similar' },
          { value: 'moderate', label: 'Training some weeks' },
          { value: 'high', label: 'Training most weeks' },
        ]}
        value={recent}
        onChange={(next) => setRecent(next as TrainingAnswers['recentActivity'])}
      />

      <ChoiceChips
        legend="What do you have access to?"
        choices={[
          { value: 'none', label: 'Nothing — bodyweight' },
          { value: 'bands', label: 'Bands' },
          { value: 'dumbbells', label: 'Dumbbells' },
          { value: 'barbell', label: 'Barbell' },
          { value: 'machines', label: 'Machines' },
          { value: 'pull_up_bar', label: 'Pull-up bar' },
          { value: 'pool', label: 'Pool' },
        ]}
        selected={equipment}
        onChange={setEquipment}
      />

      <ChoiceChips
        legend="Days you would prefer to train"
        choices={WEEKDAYS}
        selected={preferred}
        onChange={setPreferred}
      />

      <FormField
        label="How long is a realistic session?"
        hint="In minutes. Twenty is a real session."
      >
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            type="number"
            min={5}
            max={180}
            value={minutes}
            onChange={(event) => setMinutes(event.target.value)}
          />
        )}
      </FormField>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------

export function HealthStep({ profile, onSave, onSkip }: StepProps) {
  const [pregnancy, setPregnancy] = useState<HealthAnswers['pregnancyStatus']>(
    profile.health.pregnancyStatus,
  );
  const [cardio, setCardio] = useState(profile.health.cardiovascularOrFaintingHistory);
  const [heat, setHeat] = useState(profile.health.heatSensitivity);
  const [cold, setCold] = useState(profile.health.coldSensitivity);
  const [clearance, setClearance] = useState(profile.health.medicalClearanceNeeded);
  const [injuryRegion, setInjuryRegion] = useState<string[]>(
    profile.health.injuries.map((injury) => injury.region),
  );
  const [severity, setSeverity] = useState<'mild' | 'moderate' | 'severe'>(
    profile.health.injuries[0]?.severity ?? 'mild',
  );

  return (
    <StepShell
      step="health"
      title="Anything ARETE should not suggest?"
      onContinue={() =>
        onSave({
          pregnancyStatus: pregnancy,
          cardiovascularOrFaintingHistory: cardio,
          heatSensitivity: heat,
          coldSensitivity: cold,
          medicalClearanceNeeded: clearance,
          injuries: injuryRegion.map((region) => ({ region, severity })),
        })
      }
      onSkip={onSkip}
    >
      <p className="rounded-md border border-line bg-sunken p-3 text-body-sm text-ink-muted">
        None of this is a diagnosis and none of it is shared. It is used for one thing: so the app
        declines to put something unwise in your week, and tells you why.
      </p>

      <ChoiceList
        legend="Are you pregnant or postpartum?"
        choices={[
          { value: 'not_applicable', label: 'No' },
          { value: 'pregnant', label: 'Pregnant' },
          { value: 'postpartum', label: 'Postpartum' },
          {
            value: 'prefer_not_to_say',
            label: 'Prefer not to say',
            hint: 'Fine. Heat and cold work will sit behind a safety notice instead.',
          },
        ]}
        value={pregnancy}
        onChange={(next) => setPregnancy(next as HealthAnswers['pregnancyStatus'])}
      />

      <div className="space-y-2">
        <Switch
          label="I have a heart condition, or I have fainted before"
          hint="Cold immersion and sauna are where this matters most."
          checked={cardio}
          onChange={setCardio}
        />
        <Switch label="I do not tolerate heat well" checked={heat} onChange={setHeat} />
        <Switch label="I do not tolerate cold well" checked={cold} onChange={setCold} />
        <Switch
          label="I am waiting on medical clearance to train"
          hint="The first week stays light until you say it is confirmed."
          checked={clearance}
          onChange={setClearance}
        />
      </div>

      <ChoiceChips
        legend="Anywhere that is not right at the moment?"
        choices={[
          { value: 'hamstrings', label: 'Hamstrings' },
          { value: 'hips', label: 'Hips' },
          { value: 'spine', label: 'Back' },
          { value: 'shoulders', label: 'Shoulders' },
          { value: 'knees', label: 'Knees' },
          { value: 'ankles', label: 'Ankles' },
          { value: 'wrists', label: 'Wrists' },
          { value: 'neck', label: 'Neck' },
        ]}
        selected={injuryRegion}
        onChange={setInjuryRegion}
      />

      {injuryRegion.length > 0 ? (
        <ChoiceList
          legend="How bad is it?"
          choices={[
            { value: 'mild', label: 'Mild', hint: 'Niggles, but I can work around it.' },
            { value: 'moderate', label: 'Moderate', hint: 'I need the easier version.' },
            { value: 'severe', label: 'Severe', hint: 'Nothing should load it at all.' },
          ]}
          value={severity}
          onChange={(next) => setSeverity(next as 'mild' | 'moderate' | 'severe')}
        />
      ) : null}
    </StepShell>
  );
}

// ---------------------------------------------------------------------------

export function FoodStep({ profile, onSave, onSkip }: StepProps) {
  const [goal, setGoal] = useState<FoodAnswers['loggingGoal']>(profile.food.loggingGoal);
  const [hide, setHide] = useState(profile.food.hideCalorieNumbers);
  const [units, setUnits] = useState<FoodAnswers['unitSystem']>(profile.food.unitSystem);
  const [allergies, setAllergies] = useState(profile.food.allergies.join(', '));

  return (
    <StepShell
      step="food"
      title="What do you want from food logging?"
      onContinue={() =>
        onSave({
          loggingGoal: goal,
          hideCalorieNumbers: hide,
          unitSystem: units,
          allergies: allergies
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
        })
      }
      onSkip={onSkip}
    >
      <ChoiceList
        legend="How much do you want to track?"
        choices={[
          { value: 'none', label: 'Nothing', hint: 'No food items will appear in your days.' },
          { value: 'awareness', label: 'Just awareness', hint: 'Notice what you ate. No totals.' },
          { value: 'protein', label: 'Protein only' },
          { value: 'full_macros', label: 'Calories and macros' },
        ]}
        value={goal}
        onChange={(next) => setGoal(next as FoodAnswers['loggingGoal'])}
      />

      <Switch
        label="Do not show me calorie numbers"
        hint="Honoured everywhere, including in the plan. You can change it later."
        checked={hide}
        onChange={setHide}
      />

      <ChoiceList
        legend="Units"
        choices={[
          { value: 'metric', label: 'Metric', hint: 'kg, cm, km' },
          { value: 'us', label: 'US customary', hint: 'lb, in, mi' },
        ]}
        value={units}
        onChange={(next) => setUnits(next as FoodAnswers['unitSystem'])}
      />

      <FormField label="Allergies" hint="Comma separated. Optional.">
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            value={allergies}
            placeholder="peanuts, shellfish"
            onChange={(event) => setAllergies(event.target.value)}
          />
        )}
      </FormField>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------

export function MindStep({
  profile,
  onSave,
  onSkip,
  packs,
}: StepProps & { readonly packs: readonly { slug: string; title: string }[] }) {
  const [meditation, setMeditation] = useState<MindAnswers['meditationExperience']>(
    profile.mind.meditationExperience,
  );
  const [chosen, setChosen] = useState<string[]>([...profile.mind.chosenPackSlugs]);

  return (
    <StepShell
      step="mind"
      title="How much sitting practice do you have?"
      onContinue={() =>
        onSave({
          meditationExperience: meditation,
          breathworkExperience: meditation,
          chosenPackSlugs: chosen,
        })
      }
      onSkip={onSkip}
    >
      <ChoiceList
        legend="Meditation and breathwork"
        choices={[
          { value: 'new', label: 'New to it', hint: 'Five minutes is where this starts.' },
          { value: 'some', label: 'Some experience' },
          { value: 'regular', label: 'A regular practice' },
        ]}
        value={meditation}
        onChange={(next) => setMeditation(next as MindAnswers['meditationExperience'])}
      />

      <div>
        <ChoiceChips
          legend="Packs you would like available"
          choices={packs.map((pack) => ({ value: pack.slug, label: pack.title }))}
          selected={chosen}
          onChange={setChosen}
        />
        <p className="mt-2 text-body-sm text-ink-muted">
          Nothing here is ever added for you. These are listed in one place, in one order, and only
          what you tick is offered.
        </p>
      </div>
    </StepShell>
  );
}

// ---------------------------------------------------------------------------

export function AgeStep({ profile, onSave, onSkip }: StepProps) {
  const [year, setYear] = useState(profile.age.birthYear ? String(profile.age.birthYear) : '');
  const [guardian, setGuardian] = useState(profile.age.guardianConfirmed);
  const parsed = Number(year);
  const looksMinor =
    Number.isFinite(parsed) && parsed > 1900 && new Date().getFullYear() - parsed < 18;

  return (
    <StepShell
      step="age"
      title="What year were you born?"
      onContinue={() =>
        onSave({
          ...(year ? { birthYear: Number(year) } : {}),
          guardianConfirmed: guardian,
        })
      }
      onSkip={onSkip}
    >
      <FormField
        label="Year of birth"
        hint="The year only. ARETE never needs a full date of birth."
      >
        {({ id, describedBy }) => (
          <TextInput
            id={id}
            aria-describedby={describedBy}
            type="number"
            min={1900}
            max={2100}
            value={year}
            placeholder="1994"
            onChange={(event) => setYear(event.target.value)}
          />
        )}
      </FormField>

      {looksMinor ? (
        <div className="space-y-3 rounded-md border border-line bg-sunken p-3">
          <p className="text-body-sm text-ink-muted">
            ARETE will not generate calorie targets or fasting for anyone under 18. Everything else
            works normally.
          </p>
          <Switch
            label="A parent, guardian or clinician has agreed my targets"
            hint="Only tick this if it is true. It is the only thing that unlocks calorie targets."
            checked={guardian}
            onChange={setGuardian}
          />
        </div>
      ) : null}
    </StepShell>
  );
}

// ---------------------------------------------------------------------------

export function MinimumStep({ profile, onSave, onSkip }: StepProps) {
  const [size, setSize] = useState<MinimumAnswers['minimumDaySize']>(
    profile.minimum.minimumDaySize,
  );

  return (
    <StepShell
      step="minimum"
      title="What does a real day look like at its smallest?"
      continueLabel="See my first week"
      onContinue={() => onSave({ minimumDaySize: size })}
      onSkip={onSkip}
    >
      <p className="text-body text-ink-muted">
        This is the one that matters. On the day everything goes wrong, how many things still have
        to happen for it to count? Most people should answer one.
      </p>

      <ChoiceList
        legend="Minimum day"
        choices={[
          { value: '1', label: 'One thing', hint: 'The honest answer for most weeks.' },
          { value: '2', label: 'Two things' },
          { value: '3', label: 'Three things', hint: 'Only if you really mean it.' },
        ]}
        value={String(size)}
        onChange={(next) => setSize(Number(next) as MinimumAnswers['minimumDaySize'])}
      />
    </StepShell>
  );
}
