import type { ScheduledMove } from "../types/ScheduledMove";
import { safeLoadJSON, safeSaveJSON } from "./storage";

const STORAGE_KEY = "scheduledMoves.v1";

export const loadScheduledMoves = (): ScheduledMove[] => {
  const saved = safeLoadJSON<unknown>(STORAGE_KEY, []);
  return Array.isArray(saved) ? saved as ScheduledMove[] : [];
};

export const saveScheduledMoves = (schedules: ScheduledMove[]) => safeSaveJSON(STORAGE_KEY, schedules);
