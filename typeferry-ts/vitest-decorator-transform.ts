import { babel } from "@rollup/plugin-babel";
import type { PluginOption } from "vite";

/** Transforms TC39 decorators consistently across Vite-backed test projects. */
export function decoratorTransform(): PluginOption {
  return babel({
    babelHelpers: "bundled",
    babelrc: false,
    configFile: false,
    extensions: [".ts", ".tsx"],
    plugins: [["@babel/plugin-proposal-decorators", { version: "2023-11" }]],
  });
}
