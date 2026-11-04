// Firebase project for cloud sync (saving progress to your Google account).
// From Firebase console → Project settings → General → Your apps → Web app (see DEPLOY.md).
// These values are not secrets: access is protected by Google sign-in and the rules in firestore.rules.
// Set it to null to run without cloud sync — progress then stays in this browser only.
export const firebaseConfig = {
  apiKey: 'AIzaSyA8cjyzgOoPzALU7GxcrTsiXHV7WSbmqX4',
  authDomain: 'mule-practice-lab.firebaseapp.com',
  projectId: 'mule-practice-lab',
  storageBucket: 'mule-practice-lab.firebasestorage.app',
  messagingSenderId: '782905846179',
  appId: '1:782905846179:web:e449bd70315866b0261216',
}

// `npm run dev:emulator` uses the local Firebase emulators instead (for testing sync without touching real data).
export const useEmulator = import.meta.env.VITE_FIREBASE_EMULATOR === '1'

// The emulators need a "demo-" project id; these values never reach a real Firebase project.
export const EMULATOR_CONFIG = {
  apiKey: 'demo-key',
  authDomain: 'demo-mule-practice-lab.firebaseapp.com',
  projectId: 'demo-mule-practice-lab',
  appId: 'demo-app',
}
