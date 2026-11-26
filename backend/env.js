const dotenv = require("dotenv");

/**
 * Loads backend/.env for local development.
 *
 * In development the file WINS over the computer's own environment variables. That matters on machines that have a
 * stray system variable with the same name (a Windows install once left MONGO_DB pointing at a folder), which would
 * otherwise silently beat the value you wrote in .env.
 *
 * In production (NODE_ENV=production, e.g. on Render) real environment variables always win and no file is expected.
 *
 * @param {{ env?: object, log?: Function, file?: string }} [options] env and file are for tests
 */
function loadDotEnv({ env = process.env, log = console.log, file } = {}) {
  const override = env.NODE_ENV !== "production";
  const before = { ...env };
  const result = dotenv.config({ override, quiet: true, processEnv: env, ...(file ? { path: file } : {}) });
  const parsed = result.parsed || {};
  const overridden = override ? Object.keys(parsed).filter((key) => before[key] !== undefined && before[key] !== parsed[key]) : [];
  if (overridden.length) {
    log(`Note: backend/.env replaced the system environment value of ${overridden.join(", ")}.`);
  }
  return { loaded: !result.error, overridden };
}

module.exports = { loadDotEnv };
