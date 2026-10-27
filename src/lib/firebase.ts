import { initializeApp, getApps, getApp } from "firebase/app";
import { getDataConnect } from "firebase/data-connect";

const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "pcmaker-b0b0a",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "pcmaker-b0b0a.firebaseapp.com",
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const dataConnect = getDataConnect(app, {
  service: "pcmaker-service",
  location: "europe-central2",
  connector: "default",
});
