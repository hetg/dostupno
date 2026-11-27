/**
 * The extension's privacy gate, shared as-is so client and server can't drift.
 * extension/src/privacy.js is a classic script that attaches Dostupno.privacy to the
 * global object; wrangler (esbuild) bundles this side-effect import into the Worker.
 */
import '../../extension/src/privacy.js';

export const privacy = globalThis.Dostupno.privacy;
