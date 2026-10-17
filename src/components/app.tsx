"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useHousehold } from "@/hooks/use-household";
import { isConfigured } from "@/lib/supabase";
import type { Profile } from "@/lib/types";
import { Centered, Spinner } from "./centered";
import { JoinScreen } from "./join-screen";
import { SignInScreen } from "./sign-in-screen";
import { TasksScreen } from "./tasks-screen";

export function App() {
  if (!isConfigured) {
    return (
      <Centered>
        <h1 className="text-[22px] text-ink">Almost there</h1>
        <p className="mt-2 max-w-sm text-[15px] text-neutral-600">
          Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then reload. See the README.
        </p>
      </Centered>
    );
  }
  return <SignedInGate />;
}

function SignedInGate() {
  const auth = useAuth();
  if (auth.session === undefined) {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }
  if (!auth.session) return <SignInScreen onSignIn={auth.signIn} error={auth.error} />;
  return <Household key={auth.session.user.id} userId={auth.session.user.id} onSignOut={auth.signOut} />;
}

function Household({ userId, onSignOut }: { userId: string; onSignOut: () => void }) {
  const household = useHousehold(userId);
  const { state } = household;

  const profiles = useMemo(() => {
    const map: Record<string, Profile> = {};
    if (state.status === "ready") for (const p of state.members) map[p.id] = p;
    return map;
  }, [state]);

  if (state.status === "loading") {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }

  if (state.status === "error") {
    return (
      <Centered>
        <p className="text-[16px] text-neutral-700">Couldn&apos;t load your household. {state.message}.</p>
        <button
          type="button"
          onClick={household.refresh}
          className="mt-4 h-11 rounded-full px-5 text-[15px] font-medium text-accent active:bg-accent/10"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={onSignOut}
          className="mt-1 h-11 rounded-full px-5 text-[15px] text-neutral-600 active:bg-neutral-100"
        >
          Sign out
        </button>
      </Centered>
    );
  }

  if (state.status === "invited") {
    return <JoinScreen invite={state.invites[0]} onAccept={household.acceptInvite} onStartOwn={household.startOwn} />;
  }

  return (
    <TasksScreen
      key={state.householdId}
      userId={userId}
      householdId={state.householdId}
      listName={state.name}
      members={state.members}
      profiles={profiles}
      pendingInvites={state.pendingInvites}
      invites={state.invites}
      onInvite={household.invite}
      onCancelInvite={household.cancelInvite}
      onAcceptInvite={household.acceptInvite}
      onOpenAccount={household.refresh}
      onUnknownMember={household.refresh}
      onSignOut={onSignOut}
    />
  );
}
