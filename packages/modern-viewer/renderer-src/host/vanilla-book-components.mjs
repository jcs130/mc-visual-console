import {componentSnbt} from './vanilla-component-nbt.mjs';
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const string=value=>{
  if(typeof value!=='string'||Buffer.byteLength(value)>32768)throw Error('VANILLA_BOOK_TEXT_INVALID');
  return JSON.stringify(value);
};
/** Protocol-767 Filterable book fields, preserving both original and filtered text. */
export function bookComponentSnbt(type,data){
  const written=type==='written_book_content';
  const keys=written?['rawTitle','filteredTitle','author','generation','pages','resolved']:['pages'];
  if(!record(data)||Object.keys(data).some(key=>!keys.includes(key))||!Array.isArray(data.pages)||data.pages.length>256)
    throw Error('VANILLA_BOOK_COMPONENT_INVALID');
  const pages=data.pages.map(page=>{
    if(!record(page)||Object.keys(page).some(key=>!['content','filteredContent'].includes(key)))throw Error('VANILLA_BOOK_PAGE_INVALID');
    const encode=written?componentSnbt:string;
    return '{raw:'+encode(page.content)+(page.filteredContent==null||page.filteredContent.type==='end'?'':',filtered:'+encode(page.filteredContent))+'}';
  });
  const fields=['pages:['+pages.join(',')+']'];
  if(written){
    if(!Number.isInteger(data.generation)||data.generation<0||data.generation>3||typeof data.resolved!=='boolean')throw Error('VANILLA_BOOK_COMPONENT_INVALID');
    fields.push('title:{raw:'+string(data.rawTitle)+(data.filteredTitle==null?'':',filtered:'+string(data.filteredTitle))+'}',
      'author:'+string(data.author),'generation:'+data.generation,'resolved:'+(data.resolved?'1b':'0b'));
  }
  const result='{'+fields.join(',')+'}';if(Buffer.byteLength(result)>65536)throw Error('VANILLA_NBT_LIMIT');return result;
}
