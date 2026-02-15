export interface DeliveryLogEntry {
  key: string;
  userId: string;
  notificationId: string;
  reason: string;
  createdAt: string;
}

export interface StorePort {
  hasProcessedKey(key: string): Promise<boolean>;
  logDelivery(entry: DeliveryLogEntry): Promise<void>;
  logSuppression(entry: DeliveryLogEntry): Promise<void>;
  listDeliveries(): Promise<DeliveryLogEntry[]>;
  listSuppressions(): Promise<DeliveryLogEntry[]>;
}
