import { JOINTS as ORIGINAL_JOINTS, FINGERS as ORIGINAL_FINGERS, smooth, clamp } from './rig-definition.js';
export const IMAGE={width:1774,height:887};
export const BODY_MAP={cx:565,cy:565,scale:518/766};
export const bodyPoint=([x,y])=>[887+(x-BODY_MAP.cx)*BODY_MAP.scale,357+(y-BODY_MAP.cy)*BODY_MAP.scale];
const armPoints={
 'left.upper':bodyPoint([251,600]),'left.forearm':bodyPoint([162,1050]),'left.hand':bodyPoint([385,852]),
 'right.upper':bodyPoint([837,598]),'right.forearm':bodyPoint([883,963]),'right.hand':bodyPoint([648,671]),
};
export const FINGERS=[
 {name:'left.thumb',hand:'left.hand',points:[[499,790],[558,746],[588,697]],radius:17},
 {name:'left.index',hand:'left.hand',points:[[500,770],[530,699],[543,650]],radius:14},
 {name:'left.middle',hand:'left.hand',points:[[472,756],[489,679],[497,620]],radius:14},
 {name:'left.ring',hand:'left.hand',points:[[441,758],[447,686],[458,622]],radius:13},
 {name:'left.little',hand:'left.hand',points:[[409,782],[395,716],[390,674]],radius:12},
 {name:'right.index',hand:'right.hand',points:[[566,523],[512,474],[488,429]],radius:15},
 {name:'right.middle',hand:'right.hand',points:[[593,516],[593,458],[597,410]],radius:15},
 {name:'right.thumb',hand:'right.hand',points:[[611,566],[623,555],[624,537]],radius:7},
 {name:'right.ring',hand:'right.hand',points:[[615,534],[629,545],[621,556]],radius:6},
 {name:'right.little',hand:'right.hand',points:[[631,550],[640,568],[630,579]],radius:6},
].map(f=>({...f,points:f.points.map(bodyPoint)}));
export const JOINTS=ORIGINAL_JOINTS.map(j=>({...j,point:[...j.point]}));
for(const f of FINGERS)if(!JOINTS.some(j=>j.name===f.name))for(let k=0;k<3;k++)JOINTS.push({name:f.name+['','.tip','.end'][k],parent:k?f.name+['','.tip'][k-1]:f.hand,point:f.points[k],limit:k===2?0:k===1?7:5});
export const INDEX=Object.fromEntries(JOINTS.map((j,i)=>[j.name,i]));
for(const [name,point] of Object.entries(armPoints))JOINTS[INDEX[name]].point=point;
for(const f of FINGERS)for(let k=0;k<3;k++)JOINTS[INDEX[f.name+(['','.tip','.end'][k])]].point=f.points[k];
export const LOOP=12;
// The neutral texture is already posed; bones start at its photographed joint positions.
export const BASE_POSE={};
export const HEAD_SCALE=1.15;
export const BASE_SCALES={head:[HEAD_SCALE,HEAD_SCALE,1]};
export const BASE_OFFSETS={head:[-12,0]};
export function poseAt(time){
 const phase=time*Math.PI*2/LOOP,pose={...BASE_POSE};
 const put=(name,a,f,d=0)=>{pose[name]=(pose[name]||0)+Math.sin(phase*f+d)*a;};
 put('root',.16,1);put('spine',.23,1,.5);put('chest',.14,2);
 put('neck',.18,1,-.2);put('head',.65,1,-.35);
 put('left.upper',.28,2,-.2);put('left.forearm',.5,2,-.5);put('left.hand',.8,2,-.8);
 put('right.upper',.35,2);put('right.forearm',.72,2,-.3);put('right.hand',1.25,2,-.65);
 for(let i=0;i<FINGERS.length;i++){put(FINGERS[i].name,.22,3,-.2-i*.3);put(FINGERS[i].name+'.tip',.32,3,-.5-i*.3);}
 put('tongue',.65,3,-.3);put('tongue.tip',.8,3,-.6);return pose;
}
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy),0,1);return {distance:Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy),t};}
function compact(entries){const total=entries.reduce((s,[,w])=>s+w,0);return entries.filter(([,w])=>w>1e-8).map(([n,w])=>[INDEX[n],w/total]);}
const point=n=>JOINTS[INDEX[n]].point;
function handWeights(p,side){
 let nearest;
 for(const f of FINGERS.filter(f=>f.hand===side+'.hand')){
  const a=segmentDistance(p,f.points[0],f.points[1]),b=segmentDistance(p,f.points[1],f.points[2]);
  const distance=Math.min(a.distance,b.distance);if(distance>f.radius||nearest&&nearest.distance<distance)continue;
  const influence=(1-smooth(f.radius*.65,f.radius,distance))*(b.distance<a.distance?1:smooth(0,.5,a.t));
  nearest={f,distance,influence,tip:smooth(0,.5,b.t)};
 }
 if(!nearest)return [[INDEX[side+'.hand'],1]];
 const {f,influence,tip}=nearest;return compact([[side+'.hand',1-influence],[f.name,influence*(1-tip)],[f.name+'.tip',influence*tip]]);
}
function torsoWeights([x,y]){const chest=1-smooth(455,760,y),spine=smooth(455,660,y)*(1-smooth(690,866,y));return compact([['chest',chest],['spine',(1-chest)*spine],['root',(1-chest)*(1-spine)]]);}
function forearmWeights(p,side){
 const t=segmentDistance(p,point(side+'.hand'),point(side+'.forearm')).t;
 const hand=1-smooth(0,.28,t);
 return compact([[side+'.hand',hand],[side+'.forearm',1-hand]]);
}
const vHandPolygon=[[468,422],[477,409],[491,415],[566,489],[581,501],[583,422],[585,397],[597,392],[606,403],[607,471],[610,502],[615,526],[630,558],[649,580],[672,606],[695,611],[688,643],[652,680],[620,648],[596,614],[568,584],[551,541],[510,483]];
function polygonContains(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const isVHand=(x,y)=>polygonContains(x,y,vHandPolygon);
const isOpenHand=(x,y)=>x>355&&x<625&&y>600&&y<888;
const isVForearm=(x,y)=>x>610&&y>=640&&y<1050&&x>610+(y-640)*.32;
const isOpenForearm=(x,y)=>y>825&&y<1150&&x<450;
const isOpenUpper=(x,y)=>x<300&&y>560&&y<990;
const isVUpper=(x,y)=>x>820&&y>560&&y<1050;
export function bodyWeights(x,y,sample){
 const p=bodyPoint([x,y]),part=category(x,y,sample);
 if(part===0)return handWeights(p,'right');
 if(part===1){
  const mix=1-smooth(787,839,y),hand=handWeights(p,'left');
  return mix===1?hand:[...hand.map(([i,w])=>[i,w*mix]),[INDEX['left.forearm'],1-mix]].filter(([,w])=>w>0);
 }
 if(part===2)return [[INDEX['right.forearm'],1]];
 if(part===3)return [[INDEX['left.forearm'],1]];
 if(part===4)return compact([['left.upper',smooth(485,650,y)],['chest',1-smooth(485,650,y)]]);
 if(part===5)return compact([['right.upper',smooth(485,650,y)],['chest',1-smooth(485,650,y)]]);
 return torsoWeights(p);
}
export function headWeights(x,y){
 const e=Math.hypot((x-887)/18,(y-269)/16),a=(1-smooth(.5,1,e))*smooth(253,260,y)*.88,t=smooth(260,276,y);
 if(a>0)return compact([['head',1-a],['tongue',a*(1-t)],['tongue.tip',a*t]]);
 return [[INDEX.head,1]];
}
export function headInside(x,y){return y<333||(x>821&&x<961);}
export function headOpacity(x,y){
 const neck=smooth(810,828,x)*(1-smooth(954,970,x));
 const hair=1-smooth(314,333,y);
 return (1-smooth(350,358,y))*(neck+(1-neck)*hair);
}
const partitions=[
 ['V_hand_and_fingers',isVHand,3,.036],['Open_hand_and_fingers',isOpenHand,3,.030],
 ['V_forearm',isVForearm,5,.021],['Open_forearm',isOpenForearm,5,.020],
 ['Open_upper_arm',isOpenUpper,6,.012],['V_upper_arm',isVUpper,6,.012],
];
export function category(x,y,sample){
 const p=sample?.(x,y)||[170,145,155,255],skin=p[0]>p[1]+5&&p[2]<p[0]+16;
 for(let i=0;i<partitions.length;i++)if(partitions[i][1](x,y)&&(i>=4||skin))return i;
 return 6;
}
export const PARTS=[
 {name:'Torso_underpainting',texture:'torso',bounds:[280,130,980,1190],step:10,z:-.010,
  position:(x,y)=>[887+(x-635)*.584,357+(y-286)*.584],
  inside:(x,y)=>{const wx=887+(x-635)*.584,wy=357+(y-286)*.584;return wy>322&&wy<875&&Math.abs(wx-887)<200;},weights:(x,y)=>torsoWeights([887+(x-635)*.584,357+(y-286)*.584])},
 {name:'Torso',texture:'body',bounds:[0,0,1093,1355],step:5,z:0,inside:(x,y,sample)=>bodyPoint([x,y])[1]>332&&category(x,y,sample)===6,position:(x,y)=>bodyPoint([x,y]),weights:(x,y)=>torsoWeights(bodyPoint([x,y]))},
 ...partitions.map(([name,test,step,z],i)=>({name,texture:'body',bounds:[0,0,1093,1355],step:5,z,inside:(x,y,sample)=>category(x,y,sample)===i,position:(x,y)=>bodyPoint([x,y]),weights:(x,y)=>{
  const p=bodyPoint([x,y]);
  if(i===0)return handWeights(p,'right');
  if(i===1)return handWeights(p,'left');
  if(i===2)return forearmWeights(p,'right');
  if(i===3)return forearmWeights(p,'left');
  return [[INDEX[i===4?'left.upper':'right.upper'],1]];
 }})),
 {name:'Head_and_hair',texture:'master',bounds:[715,0,1058,358],step:3,z:.025,inside:headInside,position:(x,y)=>[x,y],weights:headWeights,opacity:headOpacity},
];
// Shared planar transforms also drive the static preview renderer and validation.
export function jointMatrices(pose,scales=BASE_SCALES){
 const matrices=[];
 for(const joint of JOINTS){
  const a=(pose[joint.name]||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),scale=scales[joint.name]||[1,1,1];
  const parent=joint.parent?JOINTS[INDEX[joint.parent]]:null,offset=BASE_OFFSETS[joint.name]||[0,0],x=joint.point[0]-(parent?.point[0]||0)+offset[0],y=joint.point[1]-(parent?.point[1]||0)+offset[1];
  const [la,lb,lc,ld]=[c*scale[0],-s*scale[0],s*scale[1],c*scale[1]];
  if(!parent)matrices.push([la,lb,lc,ld,x,y]);
  else{const [A,B,C,D,X,Y]=matrices[INDEX[joint.parent]];matrices.push([A*la+C*lb,B*la+D*lb,A*lc+C*ld,B*lc+D*ld,A*x+C*y+X,B*x+D*y+Y]);}
 }return matrices;
}
export function transformPoint(p,index,m){const [a,b,c,d,x,y]=m[index],j=JOINTS[index],px=p[0]-j.point[0],py=p[1]-j.point[1];return [a*px+c*py+x,b*px+d*py+y];}
