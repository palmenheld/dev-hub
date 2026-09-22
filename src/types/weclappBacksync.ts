export type WeclappBacksyncState = "synced" | "partial" | "failed" | "disabled";

export type WeclappBacksyncResult = {
  state: WeclappBacksyncState;
  syncedAt: string;
  salesChannel?: string;
  salesChannelName?: string;
  priceSynced: boolean;
  fieldCount: number;
  warnings: string[];
  message: string;
};
