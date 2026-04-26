import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAvvea8h7o1S5ol-FWEo9HSR95edlsIQgQ",
    authDomain: "huerta-urbana-ccb50.firebaseapp.com",
    projectId: "huerta-urbana-ccb50",
    storageBucket: "huerta-urbana-ccb50.firebasestorage.app",
    messagingSenderId: "451307881409",
    appId: "1:451307881409:web:f5ebcf19c2d354a8efe540"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
