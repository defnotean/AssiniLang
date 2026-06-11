import { useState } from "react";
import { closePrototypeSession } from "../api";

/**
 * Sidebar sign-out control for the local prototype session. Clears the
 * HttpOnly session cookie server-side, then reloads the app so all state
 * is rebuilt without the old session.
 */
export function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await closePrototypeSession();
    } catch {
      // Prototype-only flow: even if the request fails, reload to drop local state.
    }
    window.location.reload();
  };

  return (
    <button type="button" className="sign-out-button" onClick={handleSignOut} disabled={isSigningOut}>
      {isSigningOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
