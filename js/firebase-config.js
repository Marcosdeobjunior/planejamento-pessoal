window.SOTER_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCapASgaI_s3fYlSfjJO2VkiDl8prIYSPU",
  authDomain: "sol-de-soter.firebaseapp.com",
  projectId: "sol-de-soter",
  storageBucket: "sol-de-soter.firebasestorage.app",
  messagingSenderId: "78856932062",
  appId: "1:78856932062:web:4c4244b8e96974afb9104f",
  appName: "soter-app",
  userCollection: "users",
  auth: {
    enabled: true,
    emailPassword: true,
    google: false,
    allowGuest: false
  }
  // Sincronização por módulos (schema 2). Desligada por padrão. Para ligar para todos,
  // descomente a linha abaixo (lembre de colocar a vírgula depois de "auth: {...}").
  // Para testar num navegador só: localStorage.setItem("soter_sync_schema", "2").
  // Ver FIREBASE_SETUP.md.
  // sync: { schema: 2 }
};
