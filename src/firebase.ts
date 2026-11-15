/**
 * Firebase Client Initialization & Error Handling for Workspace ITS
 */
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, initializeAuth, inMemoryPersistence, browserPopupRedirectResolver } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Primary Firebase configuration for Workspace ITS Firestore database & main user session
const primaryFirestoreConfig = {
  projectId: 'workspace-its-10786',
  appId: '1:455460787207:web:6993eabd770791a55606a2',
  apiKey: 'AIzaSyAEJ1jKTIP4Jh0NsrO48rOFzGlCMNsgeII',
  authDomain: 'workspace-its-10786.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-workspaceits-3bed4683-d225-4e08-9dfa-deedfa0b0a7d',
  storageBucket: 'workspace-its-10786.firebasestorage.app',
  messagingSenderId: '455460787207',
  measurementId: 'G-PYD8940MLR'
};

const app = initializeApp(primaryFirestoreConfig);

// Secondary isolated Firebase App exclusively for Google Calendar & Drive OAuth token acquisition.
// Uses primaryFirestoreConfig (workspace-its-10786) where the app's domains are already authorized in Firebase Auth,
// while running in an isolated in-memory session so selecting a personal @gmail.com account never alters the main session!
const calendarOAuthApp =
  getApps().find(a => a.name === 'CalendarOAuthClient') ||
  initializeApp(primaryFirestoreConfig, 'CalendarOAuthClient');

export const calendarAuth = (() => {
  try {
    return initializeAuth(calendarOAuthApp, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } catch {
    return getAuth(calendarOAuthApp);
  }
})();

// Connect to ai-studio-workspaceits-3bed4683-d225-4e08-9dfa-deedfa0b0a7d database
export const db = getFirestore(app, primaryFirestoreConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Validate connection on boot as mandated by skill
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network connection.");
    }
  }
}
testConnection();
