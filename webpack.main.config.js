const path = require('path');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = {
  entry: './src/main/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true },
        },
      },
      {
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
  plugins: [new ForkTsCheckerWebpackPlugin()],
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
  externals: {
    'better-sqlite3': 'commonjs better-sqlite3',
    '@modelcontextprotocol/sdk/server/mcp.js': 'commonjs @modelcontextprotocol/sdk/server/mcp.js',
    '@modelcontextprotocol/sdk/server/stdio.js': 'commonjs @modelcontextprotocol/sdk/server/stdio.js',
    'zod': 'commonjs zod',
  },
};
