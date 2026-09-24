/**
 * Compiles src/interactivity/*.ts → build/interactivity/*.js as ES modules.
 */

import path from 'path';
import wpConfig from '@wordpress/scripts/config/webpack.config.js';
import { getInteractivityModuleEntries } from './bin/lib/build-manifest.mjs';

export default (env = {}, argv = {}) => {
  const base = typeof wpConfig === 'function' ? wpConfig(env, argv) : wpConfig;
  const template = Array.isArray(base) ? base[0] : base;

  return {
    ...template,
    name: 'modules',
    entry: getInteractivityModuleEntries(),
    output: {
      path: path.resolve(process.cwd(), 'build/interactivity'),
      filename: '[name].js',
      chunkFilename: '[name].js',
      publicPath: '',
      clean: true,
      module: true,
      library: { type: 'module' },
      environment: {
        module: true,
        dynamicImport: true,
      },
    },
    experiments: {
      ...(template.experiments || {}),
      outputModule: true,
    },
    externalsType: 'module',
    externals: {
      '@wordpress/interactivity': '@wordpress/interactivity',
      '@aggressive-blocks/helpers': '@aggressive-blocks/helpers',
      '@aggressive-blocks/scroll-lock': '@aggressive-blocks/scroll-lock',
    },
    optimization: {
      splitChunks: false,
      runtimeChunk: false,
      concatenateModules: true,
      chunkIds: 'named',
      moduleIds: 'named',
    },
    plugins: (template.plugins || []).filter(
      p =>
        p.constructor.name === 'MiniCssExtractPlugin' ||
        p.constructor.name === 'DependencyExtractionWebpackPlugin'
    ),
    stats: 'minimal',
  };
};
