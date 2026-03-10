import type { FundingProvenance } from './schema';

export const fundingProvenanceOrder: FundingProvenance[] = ['public', 'private_philanthropy', 'mixed_unclear'];

export const fundingProvenanceLabels: Record<FundingProvenance, string> = {
  public: 'Public',
  private_philanthropy: 'Private / philanthropy',
  mixed_unclear: 'Mixed / unclear'
};

export const fundingProvenanceColors: Record<FundingProvenance, string> = {
  public: '#273891',
  private_philanthropy: '#c74949',
  mixed_unclear: '#9ca4b4'
};

const euroFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0
});

const euroCompactFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1
});

const percent0Formatter = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  maximumFractionDigits: 0
});

const percent1Formatter = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  maximumFractionDigits: 1
});

export function formatEuro(value: number): string {
  return euroFormatter.format(value);
}

export function formatEuroCompact(value: number): string {
  return euroCompactFormatter.format(value);
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return fractionDigits > 0 ? percent1Formatter.format(value) : percent0Formatter.format(value);
}

export function formatProjectCount(value: number): string {
  return `${value} project${value === 1 ? '' : 's'}`;
}
