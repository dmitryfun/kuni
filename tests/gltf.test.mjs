import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Vector3, PropertyBinding } from 'three';
const bytes=await fs.readFile(new URL('../public/rig/kuniman.glb',import.meta.url));
const jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
const binary=bytes.subarray(28+jsonLength);
const read=index=>{const a=json.accessors[index],v=json.bufferViews[a.bufferView];const size={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],offset=v.byteOffset+(a.byteOffset||0),length=a.count*size;const array=a.componentType===5126?Float32Array:a.componentType===5123?Uint16Array:Uint32Array;return new array(binary.buffer,binary.byteOffset+offset,length);};
globalThis.self=globalThis;
// CPU parser shim supplies dimensions only. Native PNG decoding is checked separately.
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());assert.equal(b.subarray(0,8).toString('hex'),'89504e470d0a1a0a');return {width:b.readUInt32BE(16),height:b.readUInt32BE(20),close(){}};};
globalThis.ProgressEvent=class{constructor(type,fields){this.type=type;Object.assign(this,fields);}};
const load=()=>new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');

test('GLB contains complete nonempty geometry, normalized skin weights and in-range indices',()=>{
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
 for(const mesh of json.meshes)for(const p of mesh.primitives){const pos=read(p.attributes.POSITION),indices=read(p.indices);assert.ok(pos.length>0&&indices.length>0);assert.ok([...pos].every(Number.isFinite));assert.ok([...indices].every(i=>i<pos.length/3));if(p.attributes.WEIGHTS_0!==undefined){const w=read(p.attributes.WEIGHTS_0),j=read(p.attributes.JOINTS_0);for(let i=0;i<w.length;i+=4){assert.ok(Math.abs(w[i]+w[i+1]+w[i+2]+w[i+3]-1)<1e-6);assert.ok([...w.subarray(i,i+4)].every(x=>x>=0&&x<=1));assert.ok([...j.subarray(i,i+4)].every(x=>x<45));}}}
});
test('approved face texture is embedded byte-for-byte, and generated body meshes do not cover the eyes',()=>{
 const image=json.images.find(i=>i.name==='master'),v=json.bufferViews[image.bufferView];const hash=createHash('sha256').update(binary.subarray(v.byteOffset,v.byteOffset+v.byteLength)).digest('hex');assert.equal(hash,'3b9e1f616499783c17c7ca71fba26b5220f321f6c227e6e1935c1524b2a28f34');
 for(const mesh of json.meshes.filter(m=>m.name!=='Head_and_hair'&&m.name!=='Ball')){const pos=read(mesh.primitives[0].attributes.POSITION);for(let i=0;i<pos.length;i+=3){const y=443.5-pos[i+1]*1000;assert.ok(y>220,'body should stay below the approved eyes');}}
});
test('idle loop closes every animation track exactly and preserves quaternion normalization',()=>{
 const anim=json.animations[0];assert.equal(anim.name,'Kuni_Idle');
 for(const channel of anim.channels){const sampler=anim.samplers[channel.sampler],a=json.accessors[sampler.output],values=read(sampler.output),size={VEC3:3,VEC4:4}[a.type],times=read(sampler.input);assert.equal(times[0],0);assert.equal(times.at(-1),12);for(let k=0;k<size;k++)assert.ok(Math.abs(values[k]-values[values.length-size+k])<1e-6);if(channel.target.path==='rotation')for(let i=0;i<values.length;i+=4)assert.ok(Math.abs(Math.hypot(...values.subarray(i,i+4))-1)<1e-6);}
});
test('Three.js loads all meshes and moves them without NaN values throughout the clip',async()=>{
 const gltf=await load(),mixer=new AnimationMixer(gltf.scene),bones=[];gltf.scene.traverse(o=>{if(o.isBone)bones.push(o)});assert.equal(bones.length,45);assert.ok(gltf.scene.getObjectByName('Ball'));mixer.clipAction(gltf.animations[0]).play();
 for(const time of [0,1.5,3,6,9,11.9,12]){mixer.setTime(time);gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(!o.isSkinnedMesh)return;o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i+=67){const p=o.applyBoneTransform(i,new Vector3().fromBufferAttribute(o.geometry.attributes.position,i));assert.ok([p.x,p.y,p.z].every(Number.isFinite));}});}
});
test('head and tongue are independent of the V hand, so later interaction can target separate bones',async()=>{
 const gltf=await load(),model=gltf.scene,head=model.getObjectByName('head'),hand=model.getObjectByName('V_hand_and_fingers');model.updateMatrixWorld(true);hand.skeleton.update();const p=new Vector3().fromBufferAttribute(hand.geometry.attributes.position,25),before=hand.applyBoneTransform(25,p.clone());head.rotation.z+=.1;model.updateMatrixWorld(true);hand.skeleton.update();assert.ok(hand.applyBoneTransform(25,p.clone()).distanceTo(before)<1e-8);assert.ok(model.getObjectByName(PropertyBinding.sanitizeNodeName('tongue.tip')));assert.ok(model.getObjectByName(PropertyBinding.sanitizeNodeName('left.index')));
});
