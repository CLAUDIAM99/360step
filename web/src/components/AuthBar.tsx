"use client";

import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function AuthBar() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReady(true);
    });
  }, []);

  return (
    <div className="flex items-center justify-end gap-2">
      {ready && user ? (
        <>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {user.email ?? "Account"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={async () => {
              await signOut(getFirebaseAuth());
            }}
          >
            Esci
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={async () => {
            const auth = getFirebaseAuth();
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
          }}
        >
          Accedi
        </Button>
      )}
    </div>
  );
}

