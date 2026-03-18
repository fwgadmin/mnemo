const path = require('path');

/**
 * Builds the HTTP/SSE MCP server (mnemo-mcp-http.js) into dist/.
 * Run with: npm run build:mcp-http
 * Then deploy to a Node.js host (Railway, Render, Fly.io, etc.)
 * and set TURSO_URL, TURSO_AUTH_TOKEN, MCP_API_KEY env vars.
 */
module.exports = {
  entry: './src/main/mcp/http.ts',
  target: 'node',
  mode: 'production',
  output: {
    filename: 'mnemo-mcp-http.js',
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
    ],
  },
  resolve: {
    extensions: ['.js', '.ts', '.json'],
  },
  externals: {
    'express': 'commonjs express',
    '@libsql/client': 'commonjs @libsql/client',
    '@modelcontextprotocol/sdk/server/mcp.js': 'commonjs @modelcontextprotocol/sdk/server/mcp.js',
    '@modelcontextprotocol/sdk/server/sse.js': 'commonjs @modelcontextprotocol/sdk/server/sse.js',
    'zod': 'commonjs zod',
  },
};
