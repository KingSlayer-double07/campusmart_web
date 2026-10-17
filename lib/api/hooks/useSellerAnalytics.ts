import { useQuery } from '@tanstack/react-query';
import { analyticsApi, type AnalyticsMetric, type AnalyticsRange } from '../analytics';

const MINUTE = 60_000;
export const analyticsKey = ['analytics'] as const;
export const inventoryAlertsKey = ['analytics', 'inventory-alerts'] as const;

// The API keeps each answer for 60 seconds, so asking sooner gets the same numbers
export function useSellerStats(range: AnalyticsRange) {
  return useQuery({
    queryKey: [...analyticsKey, 'stats', range],
    queryFn: () => analyticsApi.stats(range),
    staleTime: MINUTE,
  });
}

export function useSellerTimeseries(range: AnalyticsRange, metric: AnalyticsMetric) {
  return useQuery({
    queryKey: [...analyticsKey, 'timeseries', range, metric],
    queryFn: () => analyticsApi.timeseries(range, metric),
    staleTime: MINUTE,
  });
}

export function useTopListings(range: AnalyticsRange, limit = 5) {
  return useQuery({
    queryKey: [...analyticsKey, 'top-listings', range, limit],
    queryFn: () => analyticsApi.topListings(range, limit),
    staleTime: MINUTE,
  });
}

// Always fresh on the API, so a restock shows when the seller comes back
export function useInventoryAlerts() {
  return useQuery({ queryKey: inventoryAlertsKey, queryFn: () => analyticsApi.inventoryAlerts() });
}
