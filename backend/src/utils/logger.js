const ts = () => new Date().toISOString();

export const logger = {
  info: (msg) => console.log(`[${ts()}] INFO  ${msg}`),
  error: (msg) => console.error(`[${ts()}] ERROR ${msg}`)
};
