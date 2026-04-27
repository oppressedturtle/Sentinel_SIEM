export type AuthUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: string[];
  permissions: string[];
};

export type AuthContext = {
  user: AuthUser;
  authMethod: "session" | "apiKey";
  sessionId?: string;
  apiKeyId?: string;
  apiKeyScopes?: string[];
};

export type EventFilters = {
  q?: string;
  from?: string;
  to?: string;
  host?: string;
  userName?: string;
  sourceIp?: string;
  destinationIp?: string;
  eventType?: string;
  severity?: string;
  category?: string;
};

export type NormalizedEventInput = {
  timestamp: Date;
  host?: string | null;
  userName?: string | null;
  sourceIp?: string | null;
  destinationIp?: string | null;
  eventType: string;
  category?: string | null;
  severity: string;
  message: string;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  searchText: string;
};

