const path = require('path');

/** Unified Node CLI: mnemo mcp | mcp-http | note (used by bin/mnemo.js wrapper for GUI on Linux). */
module.exports = {
  entry: './src/main/cli.ts',
  target: 'node',
  mode: 'production',
  output: {
    filename: 'mnemo-cli.js',
    path: path.join(__dirname, 'dist'),
  },
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
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
  externals: {
    'better-sqlite3': 'commonjs better-sqlite3',
    '@libsql/client': 'commonjs @libsql/client',
    '@modelcontextprotocol/sdk/server/mcp.js': 'commonjs @modelcontextprotocol/sdk/server/mcp.js',
    '@modelcontextprotocol/sdk/server/stdio.js': 'commonjs @modelcontextprotocol/sdk/server/stdio.js',
    'zod': 'commonjs zod',
  },
};
