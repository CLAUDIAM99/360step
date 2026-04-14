"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function AuthBar() {
  const { data, status } = useSession();
  const user = data?.user;
  return (
    <div className="flex items-center justify-end gap-2">
      {status === "authenticated" && user ? (
        <>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {user.email ?? user.name ?? "Account"}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => signOut()}>
            Esci
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => signIn("google")}
        >
          Accedi
        </Button>
      )}
    </div>
  );
}

