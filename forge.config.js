const path = require('path');
const fs = require('fs');
const os = require('os');

function copyIntoResources(appDir, files) {
  const res = path.join(appDir, 'resources');
  for (const f of files) {
    const base = path.basename(f);
    fs.copyFileSync(f, path.join(res, base));
  }
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true });
}

/**
 * Minimal node_modules beside mnemo-cli.js so ELECTRON_RUN_AS_NODE + NODE_PATH works
 * (better-sqlite3 must match Electron's ABI; other deps are copied from a temp npm install).
 */
function installCliNodeModulesForPackage(appDir) {
  const { execSync } = require('child_process');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  const electronPkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'node_modules', 'electron', 'package.json'), 'utf8'),
  );
  const electronVer = electronPkg.version;

  execSync(`npx --yes @electron/rebuild -f -w better-sqlite3 --version ${electronVer}`, {
    cwd: __dirname,
    stdio: 'inherit',
  });

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mnemo-cli-nm-'));
  try {
    const mini = {
      name: 'mnemo-cli-nm',
      private: true,
      dependencies: {
        'better-sqlite3': pkg.dependencies['better-sqlite3'],
        express: pkg.dependencies.express,
        '@libsql/client': pkg.dependencies['@libsql/client'],
        '@modelcontextprotocol/sdk': pkg.dependencies['@modelcontextprotocol/sdk'],
        zod: pkg.dependencies.zod,
        uuid: pkg.dependencies.uuid,
      },
    };
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify(mini, null, 2));
    execSync('npm install --omit=dev', { cwd: tmp, stdio: 'inherit' });

    const nmTarget = path.join(appDir, 'resources', 'node_modules');
    const fromTmp = path.join(tmp, 'node_modules');
    fs.rmSync(nmTarget, { recursive: true, force: true });
    copyDir(fromTmp, nmTarget);
    const rebuiltNode = path.join(
      __dirname,
      'node_modules',
      'better-sqlite3',
      'build',
      'Release',
      'better_sqlite3.node',
    );
    const targetNode = path.join(nmTarget, 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    fs.mkdirSync(path.dirname(targetNode), { recursive: true });
    fs.copyFileSync(rebuiltNode, targetNode);
    const nmBin = path.join(nmTarget, '.bin');
    fs.rmSync(nmBin, { recursive: true, force: true });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  hooks: {
    prePackage: async () => {
      const { execSync } = require('child_process');
      execSync('npx webpack-cli --config webpack.cli.config.js', {
        stdio: 'inherit',
        cwd: __dirname,
      });
      execSync('npm run build:mcp-http', { stdio: 'inherit', cwd: __dirname });
    },
    postPackage: async (_config, result) => {
      if (result.platform !== 'linux') return;
      for (const appDir of result.outputPaths) {
        copyIntoResources(appDir, [
          path.join(__dirname, 'dist', 'mnemo-cli.js'),
          path.join(__dirname, 'dist', 'mnemo-mcp-http.js'),
          path.join(__dirname, 'scripts', 'mnemo-launcher.sh'),
        ]);
        installCliNodeModulesForPackage(appDir);
      }
    },
  },
  packagerConfig: {
    asar: true,
    name: 'Mnemo',
    icon: path.join(__dirname, 'src', 'assets', 'icon'),
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
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        iconUrl: 'file://' + path.join(__dirname, 'src', 'assets', 'icon.ico').replace(/\\/g, '/'),
        setupIcon: path.join(__dirname, 'src', 'assets', 'icon.ico'),
      },
    },
    {
      name: '@electron-forge/maker-deb',
      platforms: ['linux'],
      config: {
        options: {
          name: 'mnemo',
          productName: 'Mnemo',
          genericName: 'Note-taking',
          maintainer: 'Ferrowood Group, LLC',
          homepage: 'https://www.ferrowoodgroup.com',
          section: 'utils',
          categories: ['Office', 'Utility'],
          description: 'AI-native memory layer — local notes with MCP',
          mimeType: ['text/markdown', 'text/plain'],
          icon: {
            '256x256': path.join(__dirname, 'src', 'assets', 'icon-256.png'),
          },
          bin: 'resources/mnemo-launcher.sh',
        },
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
