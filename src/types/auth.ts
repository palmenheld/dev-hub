export type HubRole = "admin" | "editor";

export type HubUser = {
  id: string;
  username: string;
  displayName: string;
  role: HubRole;
  active: boolean;
  mustChangePassword: boolean;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  passwordSalt: string;
  passwordHash: string;
};

export type PublicHubUser = Omit<HubUser, "passwordSalt" | "passwordHash">;

export type HubSessionPayload = {
  sub: string;
  username: string;
  displayName: string;
  role: HubRole;
  sessionVersion: number;
  mustChangePassword: boolean;
  exp: number;
};
