const path = require('path');
const fs = require('fs');

module.exports = {
  packagerConfig: {
    asar: {
      // Unpack every native binary regardless of package name or scope.
      // JS files stay inside the asar; only .node binaries must live on disk.
      unpack: '**/*.node',
    },
    name: 'Mnemo',
    // Platform-specific icon: .ico (Windows), .icns (macOS), .png (Linux)
    icon: path.join(__dirname, 'src', 'assets', 'icon'),
    // macOS: registers CFBundleDocumentTypes so Finder shows "Open with Mnemo" for these extensions
    fileAssociations: [
      {
        ext: 'md',
        name: 'Markdown Document',
        description: 'Open with Mnemo',
        role: 'Editor',
      },
      {
        ext: 'txt',
        name: 'Text File',
        description: 'Open with Mnemo',
        role: 'Editor',
      },
    ],
  },
  rebuildConfig: {},
  hooks: {
    // The webpack plugin only packages .webpack/ output — node_modules for
    // webpack externals never make it in.  Recursively copy each external
    // package and its full transitive dependency tree from the already-rebuilt
    // source node_modules so native binaries are the correct Electron ABI.
    packageAfterCopy: async (_forgeConfig, buildPath) => {
      const srcNm  = path.join(__dirname, 'node_modules');
      const destNm = path.join(buildPath, 'node_modules');

      // Root packages that are listed as webpack externals
      const roots = [
        'better-sqlite3',
        '@libsql/client',
        '@modelcontextprotocol/sdk',
        'zod',
      ];

      const visited = new Set();

      function copyDep(name) {
        if (visited.has(name)) return;
        visited.add(name);

        const src = path.join(srcNm, name);
        if (!fs.existsSync(src)) return;

        const dest = path.join(destNm, name);
        // For scoped packages (@scope/pkg), ensure the @scope dir exists
        const parentDir = path.dirname(dest);
        if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
        if (!fs.existsSync(dest)) fs.cpSync(src, dest, { recursive: true });

        const pkgJsonPath = path.join(src, 'package.json');
        if (!fs.existsSync(pkgJsonPath)) return;
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
        for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
          copyDep(dep);
        }
      }

      for (const root of roots) {
        copyDep(root);
      }
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Mnemo',
        authors: 'Ferrowood Group, LLC',
        description: 'AI-native memory layer — notes, embeddings, and MCP for intelligence systems',
        exe: 'Mnemo.exe',
        setupExe: 'MnemoSetup.exe',
        iconUrl: 'file://' + path.join(__dirname, 'src', 'assets', 'icon.ico').replace(/\\/g, '/'),
        setupIcon: path.join(__dirname, 'src', 'assets', 'icon.ico'),
        // noMsi creates only the Squirrel setup .exe; set to false if you also
        // want an .msi side-by-side (requires WiX toolset on the build machine).
        noMsi: true,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/renderer/index.html',
              js: './src/renderer/index.tsx',
              name: 'main_window',
              preload: {
                js: './src/preload/index.ts',
              },
            },
          ],
        },
      },
    },
  ],
};
