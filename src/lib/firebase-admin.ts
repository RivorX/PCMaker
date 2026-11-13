import { getApps, initializeApp } from "firebase-admin/app";
import { getDataConnect } from "firebase-admin/data-connect";

const adminApp =
  getApps()[0] ??
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID ?? "pcmaker-b0b0a",
  });

// This client is server-only. It can execute Data Connect operations protected
// with @auth(level: NO_ACCESS), such as the credential lookup used by login.
export const adminDataConnect = getDataConnect(
  {
    serviceId: "pcmaker-service",
    location: "europe-central2",
    connector: "default",
  },
  adminApp
);
