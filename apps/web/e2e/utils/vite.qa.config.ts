/**
 * Vite dev server for the QA runs (`playwright.qa.config.ts`): the app's own config with HMR off,
 * so edits other agents make while a run is in progress never reload the page under test. Each
 * new page load still gets the current modules (the module graph is invalidated on change).
 */
import { mergeConfig, type ConfigEnv, type UserConfig } from 'vite';

import base from '../../vite.config';

export default (env: ConfigEnv): UserConfig => {
  const resolved = typeof base === 'function' ? base(env) : base;
  return mergeConfig(resolved, { server: { hmr: false } });
};
