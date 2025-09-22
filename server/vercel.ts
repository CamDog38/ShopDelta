import { createRequestHandler } from '@vercel/remix';

// Vercel will bundle the Remix build; import the server build output
// Remix Vite outputs at build/server/index.js by default (see package.json start script)
// We rely on that same path at runtime.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// eslint-disable-next-line @typescript-eslint/no-var-requires
const build = require('../build/server/index.js');

export default createRequestHandler(build, process.env.NODE_ENV as any);
