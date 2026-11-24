import{resourceId,resourcePath}from'./stack.js';
const type=t=>t?.replace(/^minecraft:/,'');
export function itemProperty(node,c){const p=type(node.property),index=node.index??0;if(!Number.isSafeInteger(index)||index<0||index>255)throw Error('ITEM_PROPERTY_INDEX');
 if(p==='custom_model_data'){const a=c.customModelData??{};return node.__kind==='condition'?(a.flags?.[index]??false):node.__kind==='select'?(a.strings?.[index]??''):(a.floats?.[index]??0);}
 if(p==='display_context')return c.displayContext;if(p==='main_hand')return c.mainHand;
 if(p==='has_component')return Object.hasOwn(c.components??{},node.component);
 if(p==='damage'){if(!Number.isFinite(c.damage)||!(c.maxDamage>0))return 0;return node.normalize===false?c.damage:Math.min(1,c.damage/c.maxDamage);}
 if(p==='count'){if(!Number.isFinite(c.count))throw Error('ITEM_COUNT_MISSING');return node.normalize===false?c.count:c.count/(c.maxCount??64);}
 if(Object.hasOwn(c.values??{},node.property))return c.values[node.property];throw Error('ITEM_PROPERTY_UNSUPPORTED:'+node.property);}
export function selectItemModel(stack,id,context={},limits={}){let nodes=0;const max=limits.nodes??256;const visit=(n,depth=0)=>{if(!n||++nodes>max||depth>32)throw Error('ITEM_MODEL_BUDGET');const t=type(n.type);if(t==='empty')return[];if(t==='model')return[{kind:'model',model:resourceId(n.model),tints:structuredClone(n.tints??[])}];if(t==='composite'){if(!Array.isArray(n.models))throw Error('ITEM_COMPOSITE_INVALID');return n.models.flatMap(x=>visit(x,depth+1));}
 if(t==='condition'){const v=itemProperty({...n,__kind:t},context);if(typeof v!=='boolean')throw Error('ITEM_CONDITION_NOT_BOOLEAN');return visit(v?n.on_true:n.on_false,depth+1);}
 if(t==='select'){const value=itemProperty({...n,__kind:t},context);const cases=n.cases??[];if(cases.length>256)throw Error('ITEM_CASE_BUDGET');const choice=cases.find(row=>(Array.isArray(row.when)?row.when:[row.when]).includes(value));return visit(choice?.model??n.fallback,depth+1);}
 if(t==='range_dispatch'){const raw=itemProperty({...n,__kind:t},context),value=raw*(n.scale??1);if(!Number.isFinite(value))throw Error('ITEM_RANGE_NOT_FINITE');let chosen=n.fallback,last=-Infinity;for(const e of n.entries??[]){if(!Number.isFinite(e.threshold)||e.threshold<last)throw Error('ITEM_THRESHOLDS_UNSORTED');last=e.threshold;if(value>=e.threshold)chosen=e.model;}return visit(chosen,depth+1);}
 throw Error('ITEM_MODEL_RENDERER_UNSUPPORTED:'+t);};return visit(stack.json(resourcePath(id,'items')).model);}
export function resolveSelectedGeometry(stack,id,ctx){return selectItemModel(stack,id,ctx).map(n=>({...n,geometry:stack.model(n.model)}));}
