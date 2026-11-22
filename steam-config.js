// Address of the shared Checkpoint Steam server (Cloudflare Worker in integrations/steam).
// Set once by the app owner after deployment, e.g. 'https://checkpoint-steam.<subdomain>.workers.dev'.
// Users never enter it. While empty, Steam sign-in is unavailable and JSON import still works.
const checkpointSteamServer = '';
