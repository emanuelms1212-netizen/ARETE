/**
 * The parts of an account a person can delete on their own, without
 * deleting the account.
 *
 * Each feature names exactly what goes and what stays, so the button says
 * what it does. Settings and plans stay unless they *are* the data (a
 * health answer is the data; a food goal is a setting). The account-wide
 * delete is separate and takes everything.
 */
export const DATA_FEATURES = [
  'journal',
  'food',
  'body',
  'training',
  'flexibility',
  'mind',
  'focus',
  'programmes',
  'health',
  'notifications',
] as const;
export type DataFeature = (typeof DATA_FEATURES)[number];

export interface DataFeatureInfo {
  readonly label: string;
  readonly removes: string;
  readonly keeps: string;
  /** Sensitive in the sense of PRIVACY.md: never sent to analytics. */
  readonly sensitive: boolean;
}

export const DATA_FEATURE_INFO: Record<DataFeature, DataFeatureInfo> = {
  journal: {
    label: 'Journal',
    removes:
      'Every morning page (intention, what is and is not in your control, virtue, obstacle), evening review and weekly review.',
    keeps: 'Your days, commitments and minimum-day switches.',
    sensitive: true,
  },
  food: {
    label: 'Food log',
    removes: 'Every meal entry, your own foods and recipes, water and the oil list.',
    keeps: 'Your food settings and any targets you entered.',
    sensitive: true,
  },
  body: {
    label: 'Body weight',
    removes: 'Every weigh-in.',
    keeps: 'Everything else.',
    sensitive: true,
  },
  training: {
    label: 'Workouts',
    removes: 'Every workout and logged set, including pain scores.',
    keeps: 'Your training setup, so the plan still works.',
    sensitive: true,
  },
  flexibility: {
    label: 'Flexibility',
    removes: 'Your flexibility programme, its sessions and check-ins.',
    keeps: 'Everything else.',
    sensitive: false,
  },
  mind: {
    label: 'Meditation and breathing',
    removes: 'Every meditation, breathwork and cognitive drill session.',
    keeps: 'The packs you chose.',
    sensitive: false,
  },
  focus: {
    label: 'Focus timer',
    removes: 'Every focus session, including one that is running.',
    keeps: 'Your tasks and days.',
    sensitive: false,
  },
  programmes: {
    label: 'Programmes',
    removes: 'Every 60-Day Reset (days, breaks, check-ins) and every contrast therapy session.',
    keeps: 'Safety notices you acknowledged.',
    sensitive: false,
  },
  health: {
    label: 'Health answers',
    removes:
      'Your onboarding health answers (pregnancy, heart history, heat and cold, injuries) and your contrast screening.',
    keeps:
      'Nothing is assumed in their place: modules that need these answers ask again before they start.',
    sensitive: true,
  },
  notifications: {
    label: 'Reminder history',
    removes:
      'What you did with each reminder (done, snoozed, dismissed), and any automatic mutes it caused.',
    keeps: 'Your notification settings.',
    sensitive: false,
  },
};

/** Actions recorded in the audit trail. Never content: only what happened, and when. */
export const AUDIT_ACTIONS = [
  'export',
  'delete_feature',
  'health_answers_changed',
  'contrast_screening_saved',
  'safety_acknowledged',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  export: 'Data exported',
  delete_feature: 'Data deleted',
  health_answers_changed: 'Health answers changed',
  contrast_screening_saved: 'Contrast screening saved',
  safety_acknowledged: 'Safety notice acknowledged',
};

export interface AuditEvent {
  readonly action: AuditAction;
  /** A short machine word — a feature or topic name. Never free text. */
  readonly detail: string | null;
  readonly at: string;
}

export const AUDIT_DETAIL_PATTERN = /^[a-z0-9_:-]{1,64}$/;
