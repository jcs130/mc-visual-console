import path from 'node:path';
import {installItemAppearanceAssets} from './item-appearance-assets.mjs';
const[source,root]=process.argv.slice(2);
if(!source||!root||!path.isAbsolute(source)||!path.isAbsolute(root))throw Error('Usage: node install-item-appearances.mjs <absolute generated web pack> <absolute prepared 1.20.6 or 1.21.1 viewer assets>');
console.log(JSON.stringify(await installItemAppearanceAssets(source,root)));
