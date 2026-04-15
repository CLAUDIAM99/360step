import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

function parseServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
  } catch {
    return null;
  }
}

export function getAdminAuth() {
  if (!getApps().length) {
    const sa = parseServiceAccount();
    if (!sa) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON non configurata");
    }
    initializeApp({
      credential: cert({
        projectId: sa.project_id,
        clientEmail: sa.client_email,
        privateKey: sa.private_key,
      }),
    });
  }
  return getAuth();
}

export async function verifyFirebaseIdToken(req: Request): Promise<{
  uid: string;
  email?: string;
}> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/.exec(auth);
  if (!m) throw new Error("Missing Authorization Bearer token");
  const token = m[1]!;
  const decoded = await getAdminAuth().verifyIdToken(token);
  return { uid: decoded.uid, email: decoded.email };
}

