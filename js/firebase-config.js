/* ============================================
   Firebase connection for online rooms.
   Paste the `firebaseConfig` object from the Firebase console here
   (Project settings → General → Your apps → Web app). These values are
   meant to be public; the database rules protect the data.
   Leave it as null and the game still works on one device.
   ============================================ */
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCGgSxWylQyf24o9Z-RuAvMOkVpwe_9Xko',
  authDomain: 'mackabee-dreidel.firebaseapp.com',
  databaseURL: 'https://mackabee-dreidel-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'mackabee-dreidel',
  storageBucket: 'mackabee-dreidel.firebasestorage.app',
  messagingSenderId: '403678310192',
  appId: '1:403678310192:web:03056cbb036aba916ea2f5',
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
