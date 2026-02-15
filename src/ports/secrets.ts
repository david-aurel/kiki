export interface SecretsPort {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
}
