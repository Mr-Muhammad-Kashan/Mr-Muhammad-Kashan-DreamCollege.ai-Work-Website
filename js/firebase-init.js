// Initialize Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCbKadCLbWmqPkVTV9xdY36rFPnNKz5_Sw",
  authDomain: "dreamcollegeai-cb34a.firebaseapp.com",
  projectId: "dreamcollegeai-cb34a",
  storageBucket: "dreamcollegeai-cb34a.firebasestorage.app",
  messagingSenderId: "310628872953",
  appId: "1:310628872953:web:333e16e8838db8f88fe828",
  measurementId: "G-B2K8LJ7E0F"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
