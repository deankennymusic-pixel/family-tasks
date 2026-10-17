"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type AuthState = {
  // undefined while the stored session (or an OAuth redirect) is being read.
  session: Session | null | undefined;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase();
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get("error_description") ?? params.get("error");

    client.auth.getSession().then(({ data, error }) => {
      setSession(data.session);
      if (oauthError) setError(oauthError);
      else if (error) setError(error.message);
      // Drop ?code=… or ?error=… left by the OAuth redirect.
      if (params.has("code") || oauthError) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    });

    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    const { error } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) setError(error.message);
  }, []);

  const signOut = useCallback(async () => {
    // "local" clears this device even when the network is down.
    await supabase().auth.signOut({ scope: "local" });
  }, []);

  return { session, error, signIn, signOut };
}
