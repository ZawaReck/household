const DATA_EPOCH_KEY = "dataEpoch";
const REPLACE_PENDING_KEY = "dataEpochReplacePending";

export const getOrCreateDataEpoch = () => {
  const current = localStorage.getItem(DATA_EPOCH_KEY);
  if (current) return current;
  const created = crypto.randomUUID();
  localStorage.setItem(DATA_EPOCH_KEY, created);
  return created;
};

export const adoptDataEpoch = (epoch: string) => {
  localStorage.setItem(DATA_EPOCH_KEY, epoch);
  localStorage.removeItem(REPLACE_PENDING_KEY);
};

export const rotateDataEpoch = () => {
  const epoch = crypto.randomUUID();
  localStorage.setItem(DATA_EPOCH_KEY, epoch);
  localStorage.setItem(REPLACE_PENDING_KEY, "true");
  return epoch;
};

export const isEpochReplacementPending = () =>
  localStorage.getItem(REPLACE_PENDING_KEY) === "true";

export const clearEpochReplacementPending = () =>
  localStorage.removeItem(REPLACE_PENDING_KEY);
