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
 * Optional Windows Authenticode signing. CI writes `certificate.pfx` and sets
 * `WINDOWS_CERTIFICATE_FILE`; see `docs/CODE_SIGNING.md`.
 * @returns {null | { certificateFile: string, certificatePassword: string, hashes: string[], timestampServer: string }}
 */
function getWindowsCodeSigningOptions() {
  const certPath = process.env.WINDOWS_CERTIFICATE_FILE;
  if (!certPath || !fs.existsSync(certPath)) return null;
  return {
    certificateFile: certPath,
    certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD ?? '',
    hashes: ['sha256'],
    timestampServer:
      process.env.WINDOWS_TIMESTAMP_SERVER || 'http://timestamp.digicert.com',
  };
}

/**
 * Azure Trusted Signing (SignTool + Dlib + metadata.json). Ignored if a PFX is configured.
 * Set AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID in the environment (SignTool reads them).
 * @returns {null | { signToolPath?: string, signWithParams: string, timestampServer: string, hashes: string[] }}
 */
function getTrustedSigningWindowsSign() {
  if (process.platform !== 'win32') return null;
  const dlib = process.env.AZURE_CODE_SIGNING_DLIB?.trim();
  const metadata = process.env.AZURE_METADATA_JSON?.trim();
  if (!dlib || !metadata) return null;
  if (!fs.existsSync(dlib) || !fs.existsSync(metadata)) return null;
  const signToolPath =
    process.env.WINDOWS_SIGNTOOL_PATH?.trim() ||
    process.env.SIGNTOOL_PATH?.trim() ||
    undefined;
  return {
    ...(signToolPath ? { signToolPath } : {}),
    signWithParams: `/v /debug /dlib ${dlib} /dmdf ${metadata}`,
    timestampServer:
      process.env.WINDOWS_TRUSTED_TIMESTAMP_SERVER?.trim() ||
      'http://timestamp.acs.microsoft.com',
    hashes: ['sha256'],
  };
}

const pfxSign = getWindowsCodeSigningOptions();
const trustedSign = pfxSign ? null : getTrustedSigningWindowsSign();

/** @type {null | Record<string, unknown>} */
let packagerWindowsSign = null;
/** @type {Record<string, unknown>} */
let squirrelSigning = {};

if (pfxSign) {
  packagerWindowsSign = {
    certificateFile: pfxSign.certificateFile,
    certificatePassword: pfxSign.certificatePassword,
    hashes: pfxSign.hashes,
    timestampServer: pfxSign.timestampServer,
  };
  squirrelSigning = {
    certificateFile: pfxSign.certificateFile,
    certificatePassword: pfxSign.certificatePassword,
  };
} else if (trustedSign) {
  packagerWindowsSign = trustedSign;
  squirrelSigning = { windowsSign: trustedSign };
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
  packagerConfig: {
    asar: {
      // Unpack every native binary regardless of package name or scope.
      // JS files stay inside the asar; only .node binaries must live on disk.
      unpack: '**/*.node',
    },
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
    ...(packagerWindowsSign
      ? {
          windowsSign: packagerWindowsSign,
        }
      : {}),
  },
  rebuildConfig: {},
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
        ...squirrelSigning,
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
      // No darwin: macOS desktop builds are not shipped (see release workflow + CHANGELOG).
      platforms: ['linux', 'win32'],
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
        // Default 3000 often conflicts (e.g. Next, Vite, other apps). Override with:
        //   MNEMO_DEV_SERVER_PORT=3000 npm start
        port: Number(process.env.MNEMO_DEV_SERVER_PORT || 13000),
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
