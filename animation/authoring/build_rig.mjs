import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createCanvas,loadImage} from '@napi-rs/canvas';
import {IMAGE,JOINTS,INDEX,PARTS,LOOP,poseAt,BASE_POSE,BASE_SCALES,BASE_OFFSETS,HEAD_SCALE,headOpacity,jointMatrices,transformPoint} from './layered-definition.js';
const directory=fileURLToPath(new URL('../',import.meta.url));
const assetRoot=fileURLToPath(new URL('./assets/',import.meta.url));
await fs.mkdir(directory+'/previews',{recursive:true});
const textureFiles={master:assetRoot+'/approved-master.png',body:assetRoot+'/body-reference.png',torso:assetRoot+'/torso.png'};
const sources={};
for(const [name,file] of Object.entries(textureFiles)) {
 const image=await loadImage(file),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
 const data=ctx.getImageData(0,0,image.width,image.height).data;
 sources[name]={file,image,data,sample:(x,y)=>{const i=(Math.max(0,Math.min(image.height-1,Math.round(y)))*image.width+Math.max(0,Math.min(image.width-1,Math.round(x))))*4;return data.slice(i,i+4);},width:image.width,height:image.height,alpha:(x,y)=>data[(Math.max(0,Math.min(image.height-1,Math.round(y)))*image.width+Math.max(0,Math.min(image.width-1,Math.round(x))))*4+3]};
}
const UNIT=.001;
const rootScene={name:'Kuni_Man',children:[1],extras:{description:'Photographic layered 2D puppet',loopSeconds:LOOP,sourceFace:'Unchanged approved master',pose:'Open palm on chest, V fingers near mouth'}};
const nodes=[rootScene];
for(const joint of JOINTS) {
 const parent=joint.parent?JOINTS[INDEX[joint.parent]]:null,offset=BASE_OFFSETS[joint.name]||[0,0];
 nodes.push({name:joint.name,translation:[(joint.point[0]-(parent?.point[0]??IMAGE.width/2)+offset[0])*UNIT,((parent?.point[1]??IMAGE.height/2)-joint.point[1]-offset[1])*UNIT,0],rotation:[0,0,0,1],extras:{part:'joint'}});
}
for(let i=0;i<JOINTS.length;i++) if(JOINTS[i].parent) (nodes[INDEX[JOINTS[i].parent]+1].children??=[]).push(i+1);
const json={asset:{version:'2.0',generator:'Kuni Man layered photo rig'},extensionsUsed:['KHR_materials_unlit'],scene:0,scenes:[{name:'Kuni_Man',nodes:[0]}],nodes,meshes:[],skins:[],animations:[],materials:[],images:[],textures:[],samplers:[{magFilter:9729,minFilter:9729,wrapS:33071,wrapT:33071}],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
const chunks=[];let byteLength=0;
function view(bytes,target) {
 const padding=(4-byteLength%4)%4;if(padding){chunks.push(Buffer.alloc(padding));byteLength+=padding;}
 const index=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.byteLength,...(target?{target}:{})});chunks.push(Buffer.from(bytes.buffer??bytes,bytes.byteOffset??0,bytes.byteLength));byteLength+=bytes.byteLength;return index;
}
function accessor(values,size,type='FLOAT',target,bounds=false) {
 const componentType=type==='FLOAT'?5126:type==='UNSIGNED_SHORT'?5123:5125;
 const array=type==='FLOAT'?new Float32Array(values):type==='UNSIGNED_SHORT'?new Uint16Array(values):new Uint32Array(values);
 const desc={bufferView:view(array,target),componentType,count:values.length/size,type:({1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4',16:'MAT4'})[size]};
 if(bounds){desc.min=Array(size).fill(Infinity);desc.max=Array(size).fill(-Infinity);for(let i=0;i<values.length;i++) {let j=i%size;desc.min[j]=Math.min(desc.min[j],values[i]);desc.max[j]=Math.max(desc.max[j],values[i]);}}
 json.accessors.push(desc);return json.accessors.length-1;
}
for(const [name,file] of Object.entries(textureFiles)) {
 const buffer=await fs.readFile(file),index=json.images.length;
 json.images.push({name,bufferView:view(buffer),mimeType:'image/png'});json.textures.push({sampler:0,source:index});
 json.materials.push({name:name+'_photo',pbrMetallicRoughness:{baseColorTexture:{index},metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_unlit:{}},alphaMode:'MASK',alphaCutoff:.035,doubleSided:true});
}
const inverses=[];
for(const joint of JOINTS) inverses.push(1,0,0,0,0,1,0,0,0,0,1,0,-(joint.point[0]-IMAGE.width/2)*UNIT,-(IMAGE.height/2-joint.point[1])*UNIT,0,1);
json.skins.push({name:'Kuni_Rig',inverseBindMatrices:accessor(inverses,16),skeleton:1,joints:JOINTS.map((_,i)=>i+1)});
const headMaterial=json.materials.length;json.materials.push({...json.materials[0],name:'Head_with_neck_blend',alphaMode:'BLEND'});
const geometryData=[],renderParts=[];
for(const part of PARTS) {
 const source=sources[part.texture],positions=[],uvs=[],joints=[],weights=[],indices=[],pixels=[],colors=[],vertexMap=new Map();
 const [x0,y0,x1,y1]=part.bounds,step=part.step;
 function add(x,y) {
  const key=x+':'+y;if(vertexMap.has(key))return vertexMap.get(key);
  const index=positions.length/3;vertexMap.set(key,index);const [px,py]=part.position(x,y);
  positions.push((px-IMAGE.width/2)*UNIT,(IMAGE.height/2-py)*UNIT,part.z);uvs.push(x/source.width,y/source.height);pixels.push([x,y]);colors.push(1,1,1,part.opacity?.(x,y)??1);
  const w=part.weights(x,y,source.sample);let sum=w.reduce((s,[,v])=>s+v,0);
  for(let k=0;k<4;k++){joints.push(w[k]?.[0]??0);weights.push((w[k]?.[1]??0)/sum);}
  return index;
 }
 const test=(a,b,c)=>{
  const x=(a[0]+b[0]+c[0])/3,y=(a[1]+b[1]+c[1])/3;
  if(!part.inside(x,y,source.sample))return;
  if(Math.max(source.alpha(x,y),...([a,b,c].map(([x,y])=>part.inside(x,y,source.sample)?source.alpha(x,y):0)))<20)return;
  indices.push(add(...a),add(...c),add(...b));
 };
 for(let y=y0;y<y1;y+=step)for(let x=x0;x<x1;x+=step){const xx=Math.min(x+step,x1),yy=Math.min(y+step,y1);test([x,y],[xx,y],[x,yy]);test([xx,y],[xx,yy],[x,yy]);}
 if(!indices.length)continue;
 const primitive={attributes:{POSITION:accessor(positions,3,'FLOAT',34962,true),TEXCOORD_0:accessor(uvs,2,'FLOAT',34962),COLOR_0:accessor(colors,4,'FLOAT',34962),JOINTS_0:accessor(joints,4,'UNSIGNED_SHORT',34962),WEIGHTS_0:accessor(weights,4,'FLOAT',34962)},indices:accessor(indices,1,'UNSIGNED_INT',34963),material:part.texture==='master'?headMaterial:part.texture==='body'?1:2};
 json.meshes.push({name:part.name,primitives:[primitive]});nodes.push({name:part.name,mesh:json.meshes.length-1,skin:0,extras:{layer:part.name}});rootScene.children.push(nodes.length-1);
 renderParts.push({part,positions,weights,joints,indices,pixels,colors});
 geometryData.push({name:part.name,vertices:positions.length/3,triangles:indices.length/3});
}
const ballPositions=[],ballColors=[],ballIndices=[];
const rings=12,slices=24,radius=.026;
for(let r=0;r<=rings;r++)for(let c=0;c<=slices;c++){
 const theta=r*Math.PI/rings,phi=c*2*Math.PI/slices,nx=Math.sin(theta)*Math.cos(phi),ny=Math.cos(theta),nz=Math.sin(theta)*Math.sin(phi);
 ballPositions.push(nx*radius,ny*radius,nz*radius);
 const shade=.2+.8*Math.max(0,nx*(-.35)+ny*.5+nz*.78);
 ballColors.push(shade*.62,shade*.74,shade);
}
for(let r=0;r<rings;r++)for(let c=0;c<slices;c++){const a=r*(slices+1)+c,b=a+slices+1;ballIndices.push(a,b,a+1,a+1,b,b+1);}
const ballMaterial=json.materials.length;json.materials.push({name:'Ball',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:1},extensions:{KHR_materials_unlit:{}},doubleSided:true});
const ballMesh=json.meshes.length;json.meshes.push({name:'Ball',primitives:[{attributes:{POSITION:accessor(ballPositions,3,'FLOAT',34962,true),COLOR_0:accessor(ballColors,3,'FLOAT',34962)},indices:accessor(ballIndices,1,'UNSIGNED_SHORT',34963),material:ballMaterial}]});
const ballNode=nodes.length;nodes.push({name:'Ball',mesh:ballMesh,translation:[-.282,.041,.12],extras:{interactiveTarget:'ball'}});rootScene.children.push(ballNode);
const times=[];for(let frame=0;frame<=LOOP*2;frame++)times.push(frame/2);
const input=accessor(times,1,'FLOAT',undefined,true),animation={name:'Kuni_Idle',samplers:[],channels:[],extras:{description:'Breathing and delayed small shoulder / elbow / wrist movement',loop:true}};
function channel(node,path,values,size){const sampler=animation.samplers.length;animation.samplers.push({input,output:accessor(values,size),interpolation:'LINEAR'});animation.channels.push({sampler,target:{node,path}});}
for(let i=0;i<JOINTS.length;i++) {
 const name=JOINTS[i].name;if(name.endsWith('.end'))continue;
 const values=[];for(const time of times){const angle=(poseAt(time)[name]||0)*Math.PI/180;values.push(0,0,Math.sin(angle/2),Math.cos(angle/2));}
 channel(i+1,'rotation',values,4);
}
for(const [name,scale] of Object.entries(BASE_SCALES))channel(INDEX[name]+1,'scale',times.flatMap(()=>scale),3);
for(const name of Object.keys(BASE_OFFSETS))channel(INDEX[name]+1,'translation',times.flatMap(()=>nodes[INDEX[name]+1].translation),3);
const rootValues=[],breathValues=[];
for(const t of times) {const phase=t*Math.PI*2/LOOP;rootValues.push(0,(IMAGE.height/2-JOINTS[0].point[1])*UNIT+Math.sin(phase)*.0006,0);breathValues.push(1,1+Math.sin(phase*2)*.0018,1);}
channel(1,'translation',rootValues,3);channel(INDEX.chest+1,'scale',breathValues,3);const ballValues=[];for(const t of times){const p=t*Math.PI*2/LOOP;ballValues.push(-.282+Math.sin(p)*.003,.041+Math.sin(p*2)*.005,.12);}channel(ballNode,'translation',ballValues,3);json.animations.push(animation);
// Default node transforms also show the intended pose before playback.
for(let i=0;i<JOINTS.length;i++){const angle=(poseAt(0)[JOINTS[i].name]||0)*Math.PI/180;nodes[i+1].rotation=[0,0,Math.sin(angle/2),Math.cos(angle/2)];if(BASE_SCALES[JOINTS[i].name])nodes[i+1].scale=BASE_SCALES[JOINTS[i].name];}
json.buffers[0].byteLength=byteLength;
const jsonText=Buffer.from(JSON.stringify(json)),jsonPad=Buffer.alloc((4-jsonText.length%4)%4,32),jsonChunk=Buffer.concat([jsonText,jsonPad]);
const binChunk=Buffer.concat([...chunks,Buffer.alloc((4-byteLength%4)%4)]);
const header=Buffer.alloc(12);header.writeUInt32LE(0x46546C67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(12+8+jsonChunk.length+8+binChunk.length,8);
const jhead=Buffer.alloc(8);jhead.writeUInt32LE(jsonChunk.length,0);jhead.writeUInt32LE(0x4E4F534A,4);const bhead=Buffer.alloc(8);bhead.writeUInt32LE(binChunk.length,0);bhead.writeUInt32LE(0x004E4942,4);
await fs.writeFile(directory+'/kuniman.glb',Buffer.concat([header,jhead,jsonChunk,bhead,binChunk]));

await fs.writeFile(directory+'/authoring/rig-manifest.json',JSON.stringify({joints:JOINTS,basePose:BASE_POSE,baseScales:BASE_SCALES,baseOffsets:BASE_OFFSETS,loopSeconds:LOOP,layers:geometryData},null,2));
// Bake the same skinned triangles as a static fallback. This renders the rig; source PNGs stay unchanged.
async function renderPreview(time,file,drawBall=true) {
 const matrices=jointMatrices(poseAt(time));
 const canvas=createCanvas(760,1000),ctx=canvas.getContext('2d');
 const scale=1.06,screen=p=>[(p[0]-887)*scale+380,p[1]*scale+28];
 for(const {part,positions,weights,joints,indices,pixels,colors} of [...renderParts].sort((a,b)=>a.part.z-b.part.z)) {
  const source=sources[part.texture],deformed=[];
  for(let i=0;i<positions.length/3;i++) {
   const original=[positions[i*3]/UNIT+IMAGE.width/2,IMAGE.height/2-positions[i*3+1]/UNIT];let x=0,y=0;
   for(let k=0;k<4;k++) {const w=weights[i*4+k];if(!w)continue;const p=transformPoint(original,joints[i*4+k],matrices);x+=p[0]*w;y+=p[1]*w;}
   deformed.push(screen([x,y]));
  }
  for(let i=0;i<indices.length;i+=3) {
   const ids=indices.slice(i,i+3),p=ids.map(j=>pixels[j]),q=ids.map(j=>deformed[j]);
   const det=(p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[2][0]-p[0][0])*(p[1][1]-p[0][1]);if(Math.abs(det)<1e-10)continue;
   const a=((q[1][0]-q[0][0])*(p[2][1]-p[0][1])-(q[2][0]-q[0][0])*(p[1][1]-p[0][1]))/det;
   const c=((p[1][0]-p[0][0])*(q[2][0]-q[0][0])-(p[2][0]-p[0][0])*(q[1][0]-q[0][0]))/det;
   const b=((q[1][1]-q[0][1])*(p[2][1]-p[0][1])-(q[2][1]-q[0][1])*(p[1][1]-p[0][1]))/det;
   const d=((p[1][0]-p[0][0])*(q[2][1]-q[0][1])-(p[2][0]-p[0][0])*(q[1][1]-q[0][1]))/det;
   const e=q[0][0]-a*p[0][0]-c*p[0][1],f=q[0][1]-b*p[0][0]-d*p[0][1];
   const center=[q.reduce((s,p)=>s+p[0],0)/3,q.reduce((s,p)=>s+p[1],0)/3];
   ctx.save();ctx.globalAlpha=ids.reduce((s,j)=>s+colors[j*4+3],0)/3;
   ctx.beginPath();q.forEach(([x,y],j)=>ctx[j?'lineTo':'moveTo'](center[0]+(x-center[0])*1.018,center[1]+(y-center[1])*1.018));ctx.closePath();ctx.clip();ctx.setTransform(a,b,c,d,e,f);ctx.drawImage(source.image,0,0);ctx.restore();
  }
 }
 if(drawBall){const phase=time*Math.PI*2/LOOP,x=82+Math.sin(phase)*3,y=455+Math.sin(phase*2)*5,r=27,g=ctx.createRadialGradient(x-9,y-11,2,x,y,r);g.addColorStop(0,'#ecf3ff');g.addColorStop(.35,'#b9d0ff');g.addColorStop(1,'#344371');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
 await fs.writeFile(file,await canvas.encode('png'));
}
await renderPreview(0,directory+'/previews/skinned-0.png');

await renderPreview(3,directory+'/previews/skinned-3.png');
const neutral=createCanvas(760,1000),n=neutral.getContext('2d'),minY=315*(1-HEAD_SCALE),scale=(1000-56)/(IMAGE.height-minY),offsetY=28-minY*scale;
n.translate(380,offsetY);n.scale(scale,scale);n.translate(-887,0);
const bodyPart=PARTS.find(p=>p.name==='Torso'),bodySource=sources.body;
const bp=bodyPart.position(0,0),bq=bodyPart.position(bodySource.width,bodySource.height);
const under=PARTS[0],up=under.position(0,0),uq=under.position(sources.torso.width,sources.torso.height);n.save();n.beginPath();n.rect(687,322,400,553);n.clip();n.drawImage(sources.torso.image,up[0],up[1],uq[0]-up[0],uq[1]-up[1]);n.restore();
n.save();n.beginPath();n.rect(0,332,1774,555);n.clip();n.drawImage(bodySource.image,bp[0],bp[1],bq[0]-bp[0],bq[1]-bp[1]);n.restore();
const headLayer=createCanvas(IMAGE.width,IMAGE.height),h=headLayer.getContext('2d');
h.beginPath();h.rect(715,0,343,333);h.rect(821,333,140,25);h.clip();h.drawImage(sources.master.image,0,0);
const headMask=createCanvas(343,358),maskContext=headMask.getContext('2d'),maskPixels=maskContext.createImageData(343,358);
for(let y=0;y<358;y++)for(let x=0;x<343;x++)maskPixels.data[(y*343+x)*4+3]=Math.round(headOpacity(x+715,y)*255);
maskContext.putImageData(maskPixels,0,0);h.globalCompositeOperation='destination-in';h.drawImage(headMask,715,0);
n.save();n.translate(887+(BASE_OFFSETS.head?.[0]||0),315+(BASE_OFFSETS.head?.[1]||0));n.scale(HEAD_SCALE,HEAD_SCALE);n.translate(-887,-315);n.drawImage(headLayer,0,0);n.restore();
// Narrow hand polygons cut only the fingers/palm from the pose reference; generated eyes never render.
n.save();n.beginPath();for(let y=390;y<685;y+=2)for(let x=460;x<705;x+=2)if(PARTS.find(p=>p.name==='V_hand_and_fingers').inside(x+1,y+1,bodySource.sample)){const p=bodyPart.position(x,y);n.rect(p[0],p[1],2*(518/766)+.12,2*(518/766)+.12);}n.clip();n.drawImage(bodySource.image,bp[0],bp[1],bq[0]-bp[0],bq[1]-bp[1]);n.restore();
n.resetTransform();const bx=380-282*scale,by=offsetY+402.5*scale,previewBallRadius=26*scale;const grad=n.createRadialGradient(bx-previewBallRadius*.35,by-previewBallRadius*.45,2,bx,by,previewBallRadius);grad.addColorStop(0,'#ecf3ff');grad.addColorStop(.35,'#b9d0ff');grad.addColorStop(1,'#344371');n.fillStyle=grad;n.beginPath();n.arc(bx,by,previewBallRadius,0,Math.PI*2);n.fill();
await fs.writeFile(directory+'/posed-preview.png',await neutral.encode('png'));

console.log(JSON.stringify({bytes:header.readUInt32LE(8),joints:JOINTS.length,animation:animation.name,duration:LOOP,layers:geometryData},null,2));
