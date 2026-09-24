import fg from 'fast-glob';
import path from 'path';

/**
 * Normalize paths to POSIX separators.
 *
 * @param {string} filePath File path.
 * @return {string} POSIX path.
 */
function toPosix(filePath) {
  return filePath.split('\\').join('/');
}

/**
 * Build webpack entry map for Interactivity API script modules.
 *
 * @param {string} cwd Project root.
 * @return {Record<string, string>} Webpack entry map.
 */
export function getInteractivityModuleEntries(cwd = process.cwd()) {
  const entries = {};

  fg.sync('src/interactivity/*.{js,ts}', { cwd }).forEach(file => {
    const name = toPosix(
      path.relative(path.join(cwd, 'src/interactivity'), path.join(cwd, file))
    ).replace(/\.(js|ts)$/i, '');

    entries[name] = path.resolve(cwd, file);
  });

  return entries;
}
