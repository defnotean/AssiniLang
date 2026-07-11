import type { User } from "@assini/api-contract";
import { getJson } from "../lib/apiClient";

export async function fetchCurrentUser(): Promise<User> {
  return getJson<User>("/users/me", "reviewer");
}
