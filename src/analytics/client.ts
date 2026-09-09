import { analyticsEventSchemas, type AnalyticsEventName, type AnalyticsPayload } from './events';

export interface AnalyticsSink {
  readonly name: string;
  record(event: AnalyticsEventName, payload: unknown): void;
}

/**
 * The default and, for now, only sink.
 *
 * Events are typed, validated and dropped. Nothing is sent anywhere, no third
 * party is contacted, and no identifier leaves the device. A real sink is added
 * only behind an explicit user opt-in.
 */
export const noopSink: AnalyticsSink = {
  name: 'noop',
  record() {
    // Intentionally empty. See PRODUCT_SPEC §11.
  },
};

let sink: AnalyticsSink = noopSink;

/** Test seam. Production code never calls this. */
export function setAnalyticsSink(next: AnalyticsSink): void {
  sink = next;
}

export function getAnalyticsSink(): AnalyticsSink {
  return sink;
}

/**
 * Emits an event after validating its payload.
 *
 * Validation failure is a developer error, so it warns loudly in development
 * and drops the event in production. Analytics must never break a user flow.
 */
export function track<TName extends AnalyticsEventName>(
  name: TName,
  payload: AnalyticsPayload<TName>,
): void {
  const result = analyticsEventSchemas[name].safeParse(payload);

  if (!result.success) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[analytics] invalid payload for "${name}"`, result.error.issues);
    }
    return;
  }

  sink.record(name, result.data);
}
