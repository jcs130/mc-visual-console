// Original 1.21.1 ModelPart definitions. Audited class/texture hashes and source
// methods: docs/native-hostile-source-audit.md. Coordinates are Y-down pixels.
const F=Math.fround,PI=F(Math.PI)
const cube=(uv,origin,size,dilation=0,mirror=false)=>({uv,origin,size,dilation,mirror})
const part=(name,pivot,cubes=[],rotation=[0,0,0],parent)=>({name,pivot,cubes,rotation,...(parent?{parent}:{})})
const humanoid=d=>[
  part('head',[0,0,0],[cube([0,0],[-4,-8,-4],[8,8,8],d)]),part('hat',[0,0,0],[cube([32,0],[-4,-8,-4],[8,8,8],d+.5)]),
  part('body',[0,0,0],[cube([16,16],[-4,0,-2],[8,12,4],d)]),
  part('right_arm',[-5,2,0],[cube([40,16],[-3,-2,-2],[4,12,4],d)]),part('left_arm',[5,2,0],[cube([40,16],[-1,-2,-2],[4,12,4],d,true)]),
  part('right_leg',[-1.9,12,0],[cube([0,16],[-2,0,-2],[4,12,4],d)]),part('left_leg',[1.9,12,0],[cube([0,16],[-2,0,-2],[4,12,4],d,true)])]
const replace=(parts,value)=>{const index=parts.findIndex(p=>p.name===value.name);if(index<0)parts.push(value);else parts[index]=value}
export function nativeHostileModelDefinition(name,layer='base') {
  const leaf=name.split(':')[1],d=layer==='charged'?2:layer==='outer'?(leaf==='bogged'?.2:.25):0
  if(['zombie','husk','drowned','skeleton','stray','wither_skeleton','bogged','zombie_villager'].includes(leaf)) {
    const parts=humanoid(d)
    if(['skeleton','stray','wither_skeleton','bogged'].includes(leaf)&&layer==='base'){
      for(const [n,x,y,uv]of [['right_arm',-5,2,[40,16]],['left_arm',5,2,[40,16]],['right_leg',-2,12,[0,16]],['left_leg',2,12,[0,16]]]){
        replace(parts,part(n,[x,y,0],[cube(uv,[-1,n.endsWith('arm')?-2:0,-1],[2,12,2],0,n.startsWith('left'))]))
      }
      if(leaf==='bogged'){
        parts.push(part('mushrooms',[0,0,0],[],[0,0,0],'head'))
        for(const [n,uv,o,p,r]of [
          ['red_mushroom_1',[50,16],[-3,-3,0],[3,-8,3],[0,.7853982,0]],['red_mushroom_2',[50,16],[-3,-3,0],[3,-8,3],[0,2.3561945,0]],
          ['brown_mushroom_1',[50,22],[-3,-3,0],[-3,-8,-3],[0,.7853982,0]],['brown_mushroom_2',[50,22],[-3,-3,0],[-3,-8,-3],[0,2.3561945,0]],
          ['brown_mushroom_3',[50,28],[-3,-4,0],[-2,-1,4],[-1.5707964,0,.7853982]],['brown_mushroom_4',[50,28],[-3,-4,0],[-2,-1,4],[-1.5707964,0,2.3561945]]
        ])parts.push(part(n,p,[cube(uv,o,[6,4,0])],r,'mushrooms'))
      }
    }
    if(leaf==='drowned'){
      replace(parts,part('left_arm',[5,2,0],[cube([32,48],[-1,-2,-2],[4,12,4],d)]))
      replace(parts,part('left_leg',[1.9,12,0],[cube([16,48],[-2,0,-2],[4,12,4],d)]))
    }
    if(leaf==='zombie_villager'){
      replace(parts,part('head',[0,0,0],[cube([0,0],[-4,-10,-4],[8,10,8]),cube([24,0],[-1,-3,-6],[2,4,2])]))
      replace(parts,part('hat',[0,0,0],[cube([32,0],[-4,-10,-4],[8,10,8],.5)]))
      parts.push(part('hat_rim',[0,0,0],[cube([30,47],[-8,-8,-6],[16,16,1])],[-PI/2,0,0],'hat'))
      replace(parts,part('body',[0,0,0],[cube([16,20],[-4,0,-3],[8,12,6]),cube([0,38],[-4,0,-3],[8,20,6],.05)]))
      for(const [n,x]of [['right_arm',-5],['left_arm',5]])replace(parts,part(n,[x,2,0],[cube([44,22],[x<0?-3:-1,-2,-2],[4,12,4],0,x>0)]))
      for(const [n,x]of [['right_leg',-2],['left_leg',2]])replace(parts,part(n,[x,12,0],[cube([0,22],[-2,0,-2],[4,12,4],0,x>0)]))
    }
    return {parts}
  }
  if(leaf==='creeper')return {parts:[
    part('head',[0,6,0],[cube([0,0],[-4,-8,-4],[8,8,8],d)]),part('body',[0,6,0],[cube([16,16],[-4,0,-2],[8,12,4],d)]),
    ...[['right_hind_leg',-2,4],['left_hind_leg',2,4],['right_front_leg',-2,-4],['left_front_leg',2,-4]].map(([n,x,z])=>part(n,[x,18,z],[cube([0,16],[-2,0,-2],[4,6,4],d)]))]}
  if(['spider','cave_spider'].includes(leaf))return {parts:[
    part('head',[0,15,-3],[cube([32,4],[-4,-4,-8],[8,8,8])]),part('body0',[0,15,0],[cube([0,0],[-3,-3,-3],[6,6,6])]),part('body1',[0,15,9],[cube([0,12],[-5,-4,-6],[10,8,12])]),
    ...['hind','middle_hind','middle_front','front'].flatMap((label,i)=>['right','left'].map(side=>part(`${side}_${label}_leg`,[side==='right'?-4:4,15,2-i],[cube([18,0],[side==='right'?-15:-1,-1,-1],[16,2,2],0,side==='left')])))]}
  if(leaf==='enderman')return {parts:[
    part('head',[0,-13,0],[cube([0,0],[-4,-8,-4],[8,8,8])]),part('hat',[0,-13,0],[cube([0,16],[-4,-8,-4],[8,8,8],-.5)]),part('body',[0,-14,0],[cube([32,16],[-4,0,-2],[8,12,4])]),
    ...[['right_arm',-5,-12,-2],['left_arm',5,-12,-2],['right_leg',-2,-5,0],['left_leg',2,-5,0]].map(([n,x,y,oy])=>part(n,[x,y,0],[cube([56,0],[-1,oy,-1],[2,30,2],0,n.startsWith('left'))]))]}
  if(leaf==='iron_golem')return {parts:[
    part('head',[0,-7,-2],[cube([0,0],[-4,-12,-5.5],[8,10,8]),cube([24,0],[-1,-5,-7.5],[2,4,2])]),
    part('body',[0,-7,0],[cube([0,40],[-9,-2,-6],[18,12,11]),cube([0,70],[-4.5,10,-3],[9,5,6],.5)]),
    part('right_arm',[0,-7,0],[cube([60,21],[-13,-2.5,-3],[4,30,6])]),part('left_arm',[0,-7,0],[cube([60,58],[9,-2.5,-3],[4,30,6])]),
    part('right_leg',[-4,11,0],[cube([37,0],[-3.5,-3,-3],[6,16,5])]),part('left_leg',[5,11,0],[cube([60,0],[-3.5,-3,-3],[6,16,5],0,true)])]}
  if(leaf==='witch')return {parts:[
    part('head',[0,0,0],[cube([0,0],[-4,-10,-4],[8,10,8])]),part('nose',[0,-2,0],[cube([24,0],[-1,-1,-6],[2,4,2])],[0,0,0],'head'),
    part('mole',[0,-2,0],[cube([0,0],[0,3,-6.75],[1,1,1],-.25)],[0,0,0],'nose'),
    part('hat',[-5,-10.03125,-5],[cube([0,64],[0,0,0],[10,2,10])],[0,0,0],'head'),
    part('hat_rim',[0,0,0],[cube([30,47],[-8,-8,-6],[16,16,1])],[-1.5707964,0,0],'hat'),
    part('hat2',[1.75,-4,2],[cube([0,76],[0,0,0],[7,4,7])],[-.05235988,0,.02617994],'hat'),
    part('hat3',[1.75,-4,2],[cube([0,87],[0,0,0],[4,4,4])],[-.10471976,0,.05235988],'hat2'),
    part('hat4',[1.75,-2,2],[cube([0,95],[0,0,0],[1,2,1],.25)],[-.20943952,0,.10471976],'hat3'),
    part('body',[0,0,0],[cube([16,20],[-4,0,-3],[8,12,6])]),part('jacket',[0,0,0],[cube([0,38],[-4,0,-3],[8,20,6],.5)],[0,0,0],'body'),
    part('arms',[0,3,-1],[cube([44,22],[-8,-2,-2],[4,8,4]),cube([44,22],[4,-2,-2],[4,8,4],0,true),cube([40,38],[-4,2,-2],[8,4,4])],[-.75,0,0]),
    part('right_leg',[-2,12,0],[cube([0,22],[-2,0,-2],[4,12,4])]),part('left_leg',[2,12,0],[cube([0,22],[-2,0,-2],[4,12,4],0,true)])]}
  throw Error('NATIVE_HOSTILE_MODEL_UNSUPPORTED')
}

export const NATIVE_HOSTILE_TEXTURES=Object.freeze({
  zombie:['zombie/zombie',64,64,1],husk:['zombie/husk',64,64,1.0625],drowned:['zombie/drowned',64,64,1],zombie_villager:['zombie_villager/zombie_villager',64,64,1],
  skeleton:['skeleton/skeleton',64,32,1],stray:['skeleton/stray',64,32,1],wither_skeleton:['skeleton/wither_skeleton',64,32,1.2],bogged:['skeleton/bogged',64,32,1],
  creeper:['creeper/creeper',64,32,1],spider:['spider/spider',64,32,1],cave_spider:['spider/cave_spider',64,32,.7],enderman:['enderman/enderman',64,32,1],
  witch:['witch',64,128,.9375],iron_golem:['iron_golem/iron_golem',128,128,1]})
