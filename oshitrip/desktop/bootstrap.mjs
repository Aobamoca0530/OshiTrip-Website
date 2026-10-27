// Wait until the launcher has attached us to its Windows Job Object.
// Closing the launcher's stdin also stops the service.
import readline from 'node:readline';
const lines = readline.createInterface({ input: process.stdin });
lines.once('line', async (line) => {
  if (line !== 'start') process.exit(1);
  try { await import('./app/server.js'); }
  catch (error) { console.error(error); process.exit(1); }
});
lines.on('close', () => process.exit(0));
