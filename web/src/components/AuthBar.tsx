"use client";

import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User } from "firebase/auth";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth } from "@/lib/firebase/client";

export function AuthBar() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    try {
      const auth = getFirebaseAuth();
      return onAuthStateChanged(auth, (u) => {
        setUser(u);
        setReady(true);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrorText(msg);
      setReady(true);
      return;
    }
  }, []);

  return (
    <div className="flex items-center justify-end gap-2">
      {errorText ? <p className="max-w-[360px] text-xs text-red-600">{errorText}</p> : null}
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
              setErrorText(null);
              try {
                await signOut(getFirebaseAuth());
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                setErrorText(msg);
              }
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
            setErrorText(null);
            try {
              const auth = getFirebaseAuth();
              const provider = new GoogleAuthProvider();
              await signInWithPopup(auth, provider);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              setErrorText(msg);
            }
          }}
        >
          Accedi
        </Button>
      )}
    </div>
  );
}

