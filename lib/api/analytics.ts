import { toParams } from './admin';
import { fetchApi } from './client';
import type { components } from './schema';

// Generated from the API's OpenAPI document (D5)
type Schemas = components['schemas'];
export type AnalyticsRange = Schemas['AnalyticsRange'];
export type AnalyticsMetric = Schemas['AnalyticsMetric'];
export type SellerStats = Schemas['SellerStatsDto'];
export type TimeseriesPoint = Schemas['TimeseriesPointDto'];
export type TopListing = Schemas['TopListingDto'];
export type InventoryAlerts = Schemas['InventoryAlertsDto'];
export type InventoryAlert = Schemas['InventoryAlertDto'];

// Guide 7.1: the seller's own numbers
export const analyticsApi = {
  stats: (range: AnalyticsRange) => fetchApi<SellerStats>('/sellers/me/stats', { params: toParams({ range }) }),
  timeseries: (range: AnalyticsRange, metric: AnalyticsMetric) =>
    fetchApi<TimeseriesPoint[]>('/sellers/me/analytics/timeseries', { params: toParams({ range, metric }) }),
  topListings: (range: AnalyticsRange, limit = 5) =>
    fetchApi<TopListing[]>('/sellers/me/analytics/top-listings', { params: toParams({ range, limit }) }),
  inventoryAlerts: () => fetchApi<InventoryAlerts>('/sellers/me/inventory/alerts'),
};
