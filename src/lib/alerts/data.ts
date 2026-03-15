import rawAlerts from '../../../data/generated/alerts-112.json';
import rawSummary from '../../../data/generated/alerts-112-summary.json';
import {
  processedAlertSchema,
  alertsSummarySchema,
  type ProcessedAlert,
  type AlertsSummary
} from './schema';

export const alerts: ProcessedAlert[] = rawAlerts.map((alert) => processedAlertSchema.parse(alert));
export const alertsSummary: AlertsSummary = alertsSummarySchema.parse(rawSummary);
