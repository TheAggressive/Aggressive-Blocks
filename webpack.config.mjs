import { createRequire } from 'node:module';
import wpConfig from '@wordpress/scripts/config/webpack.config.js';

const require = createRequire(import.meta.url);
const wpScriptsRequire = createRequire(
  require.resolve('@wordpress/scripts/package.json')
);
const DependencyExtractionWebpackPlugin = wpScriptsRequire(
  '@wordpress/dependency-extraction-webpack-plugin'
);

const PLUGIN_MODULE_IDS = [
  '@aggressive-blocks/helpers',
  '@aggressive-blocks/scroll-lock',
];

const PLUGIN_MODULE_EXTERNALS = Object.fromEntries(
  PLUGIN_MODULE_IDS.map(id => [id, id])
);

function withPluginExternals(config) {
  if (Array.isArray(config)) {
    return config.map(withPluginExternals);
  }

  const isModuleBuild = Boolean(config.output && config.output.module);

  if (!isModuleBuild) {
    const existing = config.externals;
    const asArray = Array.isArray(existing)
      ? existing
      : existing
        ? [existing]
        : [];
    return {
      ...config,
      externals: [...asArray, PLUGIN_MODULE_EXTERNALS],
    };
  }

  const plugins = (config.plugins || []).map(plugin => {
    if (plugin.constructor?.name !== 'DependencyExtractionWebpackPlugin') {
      return plugin;
    }

    return new DependencyExtractionWebpackPlugin({
      ...(plugin.options || {}),
      requestToExternalModule(request) {
        if (PLUGIN_MODULE_IDS.includes(request)) {
          return request;
        }
      },
    });
  });

  return { ...config, plugins };
}

export default (env = {}, argv = {}) => {
  const base = typeof wpConfig === 'function' ? wpConfig(env, argv) : wpConfig;
  return withPluginExternals(base);
};
