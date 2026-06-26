import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB-vrZsmpowtw7Pwl-5Y1stRA0IvfPqjLI',
  authDomain: 'collect-it-real.firebaseapp.com',
  projectId: 'collect-it-real',
  storageBucket: 'collect-it-real.firebasestorage.app',
  messagingSenderId: '602731346919',
  appId: '1:602731346919:web:d253a223227fe4f3da1b42',
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export default app;
