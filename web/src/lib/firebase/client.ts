import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function assertFirebaseClientConfig() {
  const missing: string[] = [];
  if (!firebaseConfig.apiKey) missing.push("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!firebaseConfig.authDomain) missing.push("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  if (!firebaseConfig.projectId) missing.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  if (!firebaseConfig.appId) missing.push("NEXT_PUBLIC_FIREBASE_APP_ID");
  if (missing.length) {
    // #region agent log
    fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
      body: JSON.stringify({
        sessionId: "e32d68",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "web/src/lib/firebase/client.ts:assertFirebaseClientConfig",
        message: "Firebase client config missing",
        data: { missing },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    throw new Error(`Firebase client config missing: ${missing.join(", ")}`);
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (!getApps().length) {
    // #region agent log
    fetch("http://127.0.0.1:7577/ingest/e4ffde1a-52c1-4510-a1f5-e151e4db8f3e", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "e32d68" },
      body: JSON.stringify({
        sessionId: "e32d68",
        runId: "pre-fix",
        hypothesisId: "H1",
        location: "web/src/lib/firebase/client.ts:getFirebaseApp",
        message: "Initializing Firebase client (presence only)",
        data: {
          hasApiKey: Boolean(firebaseConfig.apiKey),
          apiKeyLen: firebaseConfig.apiKey ? String(firebaseConfig.apiKey).length : 0,
          hasAuthDomain: Boolean(firebaseConfig.authDomain),
          authDomainSuffix: firebaseConfig.authDomain ? String(firebaseConfig.authDomain).slice(-20) : null,
          hasProjectId: Boolean(firebaseConfig.projectId),
          projectIdLen: firebaseConfig.projectId ? String(firebaseConfig.projectId).length : 0,
          hasAppId: Boolean(firebaseConfig.appId),
          appIdLen: firebaseConfig.appId ? String(firebaseConfig.appId).length : 0,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    assertFirebaseClientConfig();
    initializeApp(firebaseConfig);
  }
  return getApps()[0]!;
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseApp());
}

