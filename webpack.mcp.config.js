const path = require('path');

/**
 * Builds the standalone MCP stdio server (mnemo-mcp.js) into dist/.
 * Run with: npm run build:mcp
 * Then point Claude Desktop / Cursor at: dist/mnemo-mcp.js
 */
module.exports = {
  entry: './src/main/mcp/stdio.ts',
  target: 'node',
  mode: 'production',
  output: {
    filename: 'mnemo-mcp.js',
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
    '@modelcontextprotocol/sdk/server/mcp.js': 'commonjs @modelcontextprotocol/sdk/server/mcp.js',
    '@modelcontextprotocol/sdk/server/stdio.js': 'commonjs @modelcontextprotocol/sdk/server/stdio.js',
    'zod': 'commonjs zod',
  },
};
