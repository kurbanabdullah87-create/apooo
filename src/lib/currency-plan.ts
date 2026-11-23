const PLAN_INTERVALS: Record<string, number> = {
  free: 86_400,
  basic: 3_600,
  professional: 60,
  enterprise: 60,
};

/** Return the provider's published update interval; custom overrides never alter known plans. */
export function getCurrencyPlanInterval(planName: string, customOverride?: number) {
  const normalized = planName.toLocaleLowerCase("en-US");
  const knownInterval = PLAN_INTERVALS[normalized];
  if (knownInterval !== undefined) return knownInterval;
  if (Number.isInteger(customOverride) && customOverride! >= 60) return Math.min(customOverride!, 86_400);
  return 86_400;
}
