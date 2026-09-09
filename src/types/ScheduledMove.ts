export type ScheduledMoveFrequency = "monthly" | "weekly" | "daily";

export type ScheduledMoveRevision = {
  effectiveFrom: string;
  source: string;
  destination: string;
  amount: number;
  name: string;
  frequency: ScheduledMoveFrequency;
  executionDay: number;
  endDate?: string;
};

export type ScheduledMove = {
  id: string;
  startDate: string;
  isActive: boolean;
  activePeriods: Array<{ start: string; end?: string }>;
  revisions: ScheduledMoveRevision[];
  skippedDates: string[];
  createdAt: string;
  updatedAt: string;
};
