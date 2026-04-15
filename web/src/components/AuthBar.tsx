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
        // #region agent log
        fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
          body: JSON.stringify({
            sessionId: "e32d68",
            runId: "pre-fix",
            hypothesisId: "H4",
            location: "web/src/components/AuthBar.tsx:onAuthStateChanged",
            message: "Auth state changed",
            data: { hasUser: Boolean(u), providerCount: u?.providerData?.length ?? 0 },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setUser(u);
        setReady(true);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // #region agent log
      fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
        body: JSON.stringify({
          sessionId: "e32d68",
          runId: "pre-fix",
          hypothesisId: "H1",
          location: "web/src/components/AuthBar.tsx:useEffect",
          message: "getFirebaseAuth threw",
          data: { message: msg.slice(0, 200) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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
              // #region agent log
              fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
                body: JSON.stringify({
                  sessionId: "e32d68",
                  runId: "pre-fix",
                  hypothesisId: "H4",
                  location: "web/src/components/AuthBar.tsx:signOut",
                  message: "Sign out failed",
                  data: { message: msg.slice(0, 200) },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              // #endregion
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
              // #region agent log
              fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
                body: JSON.stringify({
                  sessionId: "e32d68",
                  runId: "pre-fix",
                  hypothesisId: "H2",
                  location: "web/src/components/AuthBar.tsx:signInWithPopup",
                  message: "Starting Google sign-in",
                  data: { origin: typeof window !== "undefined" ? window.location.origin : null },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              // #endregion
              const auth = getFirebaseAuth();
              const provider = new GoogleAuthProvider();
              await signInWithPopup(auth, provider);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              const anyErr = e as any;
              // #region agent log
              fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
                body: JSON.stringify({
                  sessionId: "e32d68",
                  runId: "pre-fix",
                  hypothesisId: "H3",
                  location: "web/src/components/AuthBar.tsx:signInWithPopup",
                  message: "Google sign-in failed",
                  data: {
                    code: typeof anyErr?.code === "string" ? anyErr.code : null,
                    message: msg.slice(0, 200),
                  },
                  timestamp: Date.now(),
                }),
              }).catch(() => {});
              // #endregion
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

