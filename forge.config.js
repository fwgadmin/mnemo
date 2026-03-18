const path = require('path');

module.exports = {
  packagerConfig: {
    asar: true,
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
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        iconUrl: 'file://' + path.join(__dirname, 'src', 'assets', 'icon.ico').replace(/\\/g, '/'),
        setupIcon: path.join(__dirname, 'src', 'assets', 'icon.ico'),
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
