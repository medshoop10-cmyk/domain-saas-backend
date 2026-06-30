export interface PlanFeatures {
  name: string;
  price: number;
  searchesPerDay: number;
  alertsEnabled: boolean;
  maxAlerts: number;
  trendingAccess: boolean;
  csvExport: boolean;
  apiAccess: boolean;
  earlyAccess: boolean;
  prioritySupport: boolean;
}

export const PLANS: Record<string, PlanFeatures> = {
  FREE: {
    name: "Free",
    price: 0,
    searchesPerDay: 20,
    alertsEnabled: false,
    maxAlerts: 0,
    trendingAccess: false,
    csvExport: false,
    apiAccess: false,
    earlyAccess: false,
    prioritySupport: false,
  },
  PRO: {
    name: "Pro",
    price: 1900,
    searchesPerDay: 1000,
    alertsEnabled: true,
    maxAlerts: 50,
    trendingAccess: true,
    csvExport: true,
    apiAccess: false,
    earlyAccess: false,
    prioritySupport: true,
  },
  ELITE: {
    name: "Elite",
    price: 4900,
    searchesPerDay: -1,
    alertsEnabled: true,
    maxAlerts: 200,
    trendingAccess: true,
    csvExport: true,
    apiAccess: true,
    earlyAccess: true,
    prioritySupport: true,
  },
};

export function getPlan(planName: string): PlanFeatures {
  return PLANS[planName] || PLANS.FREE;
}

export function canSearch(planName: string, currentDailyCount: number): boolean {
  const plan = getPlan(planName);
  if (plan.searchesPerDay === -1) return true;
  return currentDailyCount < plan.searchesPerDay;
}

export function canCreateAlert(planName: string, currentAlertCount: number): boolean {
  const plan = getPlan(planName);
  if (!plan.alertsEnabled) return false;
  return currentAlertCount < plan.maxAlerts;
}

export function getLimit(planName: string): { searchesPerDay: number; maxAlerts: number } {
  const plan = getPlan(planName);
  return {
    searchesPerDay: plan.searchesPerDay,
    maxAlerts: plan.maxAlerts,
  };
}
