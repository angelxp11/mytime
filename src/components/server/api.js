// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBbih0S_cVzH1vP4M7LRIiu2eCS-grlh_c",
  authDomain: "mytime-10bed.firebaseapp.com",
  projectId: "mytime-10bed",
  storageBucket: "mytime-10bed.firebasestorage.app",
  messagingSenderId: "31063015739",
  appId: "1:31063015739:web:ce435ec9b59bc5e6a4f71e",
  measurementId: "G-QRCSD4GKGK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider };