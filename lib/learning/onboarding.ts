export const ONBOARDING_KEY = "yijing-go-onboarding-v1";
export type OnboardingStore = Pick<Storage, "getItem" | "setItem">;

export function readOnboardingDismissed(store: OnboardingStore): boolean {
  try {
    const raw = store.getItem(ONBOARDING_KEY);
    if (raw === null) return false;
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).length === 2 && "version" in value && value.version === 1 &&
      "dismissed" in value && value.dismissed === true;
  } catch {
    return false;
  }
}

export function dismissOnboarding(store: OnboardingStore): boolean {
  try {
    store.setItem(ONBOARDING_KEY, JSON.stringify({ version: 1, dismissed: true }));
    return true;
  } catch {
    return false;
  }
}
