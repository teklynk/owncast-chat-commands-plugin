# Owncast Commands

An Owncast plugin scaffolded with `create-owncast-plugin`. The slug is `owncast-chat-commands`, and everything below uses it as the build artifact filename and the URL prefix Owncast routes through your plugin.

## Develop

```sh
npm install          # one-time, fetches the prebuilt test/serve host binaries
npm run build        # bundle src/plugin.js into owncast-chat-commands.js
npm test             # build, then run scenarios from __tests__/
npm run serve        # build, then host the plugin on http://localhost:8080
npm run package      # build, then bundle into owncast-chat-commands.ocpkg for distribution
```

Plugins ship as source and run on the JavaScript engine the Owncast host embeds,
so there's no wasm compile step and no toolchain to install. `npm install` only
fetches the host binaries `test`/`serve` use, and caches them after the first run.

## Ship

`npm run package` produces `owncast-chat-commands.ocpkg`. Install it through the Owncast admin: open **Plugins**, click **Upload plugin**, and pick the file. Toggle **Enabled** to load it.

### Change the chat bot name

The bot name is fixed in `plugin.manifest.json` when the package is built. To use a different name, download the `.ocpkg` release asset, extract it, and edit the `bot.displayName` value in `plugin.manifest.json`. Keep the manifest valid JSON and leave the plugin files together.

On Linux or macOS, from the directory containing the downloaded package:

```sh
mkdir custom-plugin
unzip owncast-chat-commands.ocpkg -d custom-plugin
# Edit custom-plugin/plugin.manifest.json and change bot.displayName.
(cd custom-plugin && zip -r ../owncast-chat-commands-custom.ocpkg .)
```

The archive's contents must be at its root, not inside an extra `custom-plugin/` folder. Upload `owncast-chat-commands-custom.ocpkg` through **Plugins** in the Owncast admin. The plugin's bot identity is supplied by Owncast from the manifest; it is not an in-plugin setting.

## Files

- `src/plugin.js`, your handler code. Edit this
- `plugin.manifest.json`, the manifest: display name, slug, version, permissions, and optional `bot.displayName` for the chat identity
- `__tests__/plugin.test.js`, a sample scenario test. Add more
- `icon.png` (optional), drop a square PNG here and it bundles into the `.ocpkg` automatically. The admin uses it in the plugin list and sidebar, no permission required. Plugins without one fall back to a generic puzzle-piece glyph.
- `INSTRUCTIONS.md` (optional), edit this and it bundles into the `.ocpkg` automatically. The admin renders it as markdown in an **Instructions** tab on the plugin's details page, no permission required.

## Learn more

The full author guide covers every event handler, host API, permission, and testing pattern:

**[→ Owncast Plugin Author Guide](https://github.com/owncast/plugin-sdk/blob/main/docs/PLUGIN_AUTHOR_GUIDE.md)**

TypeScript declarations in `@owncast/plugin-sdk` give editor autocomplete on every API.
