// EssentialsX AIO - By Opiar | Plugin registry (modules register themselves so admins can manage them in one place)

/**
 * registerPlugin({
 *   id, name, module (config.modules key), icon, desc,
 *   fields(cfg) -> modal fields, apply(cfg, result) -> mutate config,
 *   actions: [{ text, icon?, run(p) }]   // extra buttons inside the plugin page
 * })
 */
export const plugins = [];
export function registerPlugin(def) {
  plugins.push(def);
}
