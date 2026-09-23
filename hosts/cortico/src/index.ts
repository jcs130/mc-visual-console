/** 包入口：默认导出 `WorldDefinition`，加载器按 `cortico.kind === 'world'` 认它。 */
import { MCVISUAL } from './definition.ts';

export default MCVISUAL;
export { MCVISUAL };
export type { McvisualConfigSection } from './config.ts';
