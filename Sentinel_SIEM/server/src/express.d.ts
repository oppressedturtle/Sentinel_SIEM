import type { AgentAuthContext, AuthContext } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      agent?: AgentAuthContext;
    }
  }
}

export {};
