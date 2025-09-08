import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// 🔹 Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCwQLMcPqB9uNPTNQmZLO__cLa-1UfYlyk",
  authDomain: "manga-store-2d86a.firebaseapp.com",
  projectId: "manga-store-2d86a",
  storageBucket: "manga-store-2d86a.firebasestorage.app",
  messagingSenderId: "995850464585",
  appId: "1:995850464585:web:1be3eb684afea38edebe98",
  measurementId: "G-6ZJ0DYQZ2M",
};
// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
