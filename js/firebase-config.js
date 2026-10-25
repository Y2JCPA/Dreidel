/* ============================================
   Firebase connection for online rooms.
   Paste the `firebaseConfig` object from the Firebase console here
   (Project settings → General → Your apps → Web app). These values are
   meant to be public; the database rules protect the data.
   Leave it as null and the game still works on one device.
   ============================================ */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAkAROwGNjGVEcVtQp1LKvXM2V3E2ZFH-U',
  authDomain: 'mackabee-dreidel-us.firebaseapp.com',
  databaseURL: 'https://mackabee-dreidel-us-default-rtdb.firebaseio.com',
  projectId: 'mackabee-dreidel-us',
  storageBucket: 'mackabee-dreidel-us.firebasestorage.app',
  messagingSenderId: '813865137711',
  appId: '1:813865137711:web:fa5ebbd9eaf0dfe17878da',
};
/* Example:
const FIREBASE_CONFIG = {
  apiKey: '…',
  authDomain: 'mackabee-dreidel.firebaseapp.com',
  databaseURL: 'https://mackabee-dreidel-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'mackabee-dreidel',
  storageBucket: 'mackabee-dreidel.firebasestorage.app',
  messagingSenderId: '…',
  appId: '…',
};
*/
