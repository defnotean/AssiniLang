import type { User } from "@assini/db";
import { getJson } from "../lib/apiClient";

export async function fetchCurrentUser(): Promise<User> {
  return getJson<User>("/users/me", "reviewer");
}
