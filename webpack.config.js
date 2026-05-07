// @ts-check
const path = require('path');

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: './src/index.ts',

  // Output goes directly into the C# plugin's Inject/ directory so that
  // `dotnet build` can embed it as a resource.
  output: {
    path: path.resolve(__dirname, 'Jellyfin.Plugin.VoiceSearch', 'Inject'),
    filename: 'voiceSearch.js',
    // No library export — the script is self-contained and runs as a side-effect.
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },

  resolve: {
    extensions: ['.ts', '.js'],
  },

  optimization: {
    minimize: false, // keep readable; use `npm run build:prod` for a minified release
  },

  mode: 'development',
  devtool: false,
};
