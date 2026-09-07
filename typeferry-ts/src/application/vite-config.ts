import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { InlineConfig, PluginOption } from "vite";

import type { ApplicationTarget, ResolvedApplicationConfig } from "./config";
import { createTypeFerryDevProxy } from "./proxy";

export function createViteConfig(
  config: ResolvedApplicationConfig,
  command: "develop" | "build",
  target: ApplicationTarget = "web",
): InlineConfig {
  const plugins: PluginOption[] = [react(), tailwindcss()];
  if (command === "develop") {
    plugins.unshift(
      createTypeFerryDevProxy(
        config.development.serverPort,
        config.development.proxyRoutes,
      ),
    );
  }

  const viteConfig: InlineConfig = {
    configFile: false,
    root: path.join(config.root, config.paths.client),
    plugins,
    server: {
      allowedHosts: true,
      host: "0.0.0.0",
      port: config.development.clientPort,
      hmr: { overlay: true },
      watch: {
        ignored: ["**/*.spec.ts", "**/*.spec.tsx"],
      },
    },
    resolve: {
      preserveSymlinks: true,
      alias: {
        react: path.join(config.root, "node_modules", "react"),
        "react-dom": path.join(config.root, "node_modules", "react-dom"),
        "@": config.root,
      },
    },
    build: {
      outDir: path.relative(
        path.join(config.root, config.paths.client),
        path.join(config.root, config.paths.output, "client"),
      ),
      emptyOutDir: true,
      manifest: true,
      target: config.build.target,
      sourcemap: config.build.sourceMaps,
      rollupOptions: {
        input: path.join(config.root, config.paths.client, "index.html"),
      },
    },
  };

  if (target === 'ios') {
    const ios = config.client.targets.ios;
    if (!ios) throw new Error('No iOS application target configured');
    viteConfig.build = { ...viteConfig.build, outDir: '../dist/ios-web' };
    viteConfig.define = { __TYPEFERRY_RUNTIME__: JSON.stringify({ target, backendOrigin: ios.backend.origin }) };
  }
  const extended = config.extensions.vite?.(viteConfig, { command, target }) ?? viteConfig;
  if (target === 'ios' && extended.define?.__TYPEFERRY_RUNTIME__ !== viteConfig.define?.__TYPEFERRY_RUNTIME__) {
    throw new Error('iOS public runtime metadata must be preserved by Vite extensions')
  }
  if (target === 'ios' && extended.build?.outDir !== '../dist/ios-web') {
    throw new Error('iOS output must remain isolated in dist/ios-web');
  }
  return extended;
}
