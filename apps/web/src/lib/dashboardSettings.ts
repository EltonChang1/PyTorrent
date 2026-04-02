/** Guest dashboard prefs when not logged in. */

export type DashboardSettings = {
  favoriteGenres: string[];
  hiddenRowKeys: string[];
  showRecommendations: boolean;
};

const GUEST_KEY = "pyt_guest_dashboard";

export const defaultDashboardSettings = (): DashboardSettings => ({
  favoriteGenres: ["Horror", "Comedy"],
  hiddenRowKeys: [],
  showRecommendations: true,
});

export function loadGuestDashboard(): DashboardSettings {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    if (!raw) return defaultDashboardSettings();
    const j = JSON.parse(raw) as Partial<DashboardSettings>;
    return { ...defaultDashboardSettings(), ...j };
  } catch {
    return defaultDashboardSettings();
  }
}

export function saveGuestDashboard(s: DashboardSettings): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
