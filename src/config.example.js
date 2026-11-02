// COPY THIS FILE to config.local.js and fill in your values.
// config.local.js is gitignored — never commit it.

const MUSE_CONFIG = {
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT",
  },
  // Long random string — must match the secret in your Firebase security rules
  secretToken: "YOUR_SECRET_TOKEN_HERE",
  // Unguessable paths — change these to your own random strings
  paths: {
    commands: "cmd_a7f3k9x2m4p8q",
    results: "res_b8g4l0y3n5r9s",
  },
};
