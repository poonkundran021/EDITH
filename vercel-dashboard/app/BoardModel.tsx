"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
type Props = { quaternion: number[] | null; demo: boolean; zero: number; view: number };
export default function BoardModel(props: Props) {
 const host=useRef<HTMLDivElement>(null),state=useRef(props);const [error,setError]=useState(false);
 useEffect(()=>{state.current=props;},[props]);
 useEffect(()=>{const el=host.current;if(!el)return;let renderer:THREE.WebGLRenderer;
 try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{setError(true);return;}
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));el.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.1,100);camera.position.set(7,8,9);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=7;controls.maxDistance=19;
 scene.add(new THREE.HemisphereLight(0xe4efff,0x1f2631,3));const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(4,7,3);scene.add(key);const rim=new THREE.DirectionalLight(0x5affc8,2);rim.position.set(-4,2,-3);scene.add(rim);
 const grid=new THREE.GridHelper(22,44,0x29483b,0x162c26);grid.position.y=-2;scene.add(grid);const board=new THREE.Group();scene.add(board);
 const mat=(color:number,metalness=0,roughness=.6)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
 const brown=mat(0x975526),black=mat(0x151d21),blue=mat(0x1767a2),silver=mat(0xa1adb1,.8,.3),gold=mat(0xd5b97a,.65),green=mat(0x257e49),white=mat(0xe8e9cf),purple=mat(0x855db5);
 function box(w:number,h:number,d:number,x:number,y:number,z:number,m:THREE.Material){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);board.add(o);return o;}
 function cylinder(r:number,h:number,x:number,y:number,z:number,m:THREE.Material){const o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,32),m);o.position.set(x,y,z);board.add(o);return o;}
 box(5,.12,4.5,0,0,0,brown);
 const pads=new THREE.InstancedMesh(new THREE.TorusGeometry(.032,.008,5,8),gold,483),transform=new THREE.Object3D();let n=0;
 for(let x=0;x<23;x++)for(let z=0;z<21;z++){transform.position.set(-2.3+x*.2,.067,-2+z*.2);transform.rotation.x=-Math.PI/2;transform.updateMatrix();pads.setMatrixAt(n++,transform.matrix);}board.add(pads);
 box(2.85,.17,1.5,-.1,.24,0,black);box(1.15,.2,1.12,-.45,.43,0,silver);box(.35,.18,.38,1.38,.39,0,silver);box(.65,.035,1.18,-1.08,.345,0,black);
 for(let i=0;i<5;i++)box(.045,.02,.9,-1.33+i*.1,.38,0,gold);
 for(let i=0;i<15;i++)for(const z of [-.78,.78])box(.045,.24,.055,-1.4+i*.19,.22,z,gold);
 box(.32,.1,.38,.6,.39,.1,black);box(2.65,.1,.9,-.25,.35,-1.5,black);box(.4,.3,.42,-.65,.56,-1.5,silver);box(.6,.2,.38,.25,.5,-1.5,black);cylinder(.16,.38,.8,.59,-1.5,gold);
 box(.7,.1,1.2,-2.25,.22,0,blue);box(.27,.06,.27,-2.25,.3,0,black);box(.65,.1,.65,1.92,.32,.1,purple);box(.23,.1,.22,1.92,.43,.1,silver);
 box(1.13,.1,1.1,1.95,.42,-1.65,blue);cylinder(.42,.18,1.95,.57,-1.65,silver);cylinder(.34,.51,1.95,.91,-1.65,silver);
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.345,.345,.5,24,8,true),new THREE.MeshBasicMaterial({color:0x455657,wireframe:true}));mesh.position.set(1.95,.91,-1.65);board.add(mesh);
 box(.7,.95,.12,1.96,.7,1.7,blue);box(.65,.85,.3,1.96,.82,1.86,white);
 for(let x=0;x<3;x++)for(let y=0;y<5;y++)box(.1,.06,.02,1.77+x*.19,.53+y*.14,2.02,black);
 box(3,.13,.94,-.45,.24,1.6,black);cylinder(.33,.3,-.4,.46,1.6,black);cylinder(.19,.42,-1.35,.51,1.6,silver);cylinder(.19,.42,.55,.51,1.6,silver);box(.35,.25,.3,.1,.43,1.9,blue);
 for(const x of [-1.45,.75])box(.4,.33,.6,x,.44,1.6,green);
 for(const x of [-.7,.7]){box(1.1,.75,3.9,x,-.52,0,black);const b=cylinder(.43,3.55,x,-.55,0,x<0?silver:purple);b.rotation.x=Math.PI/2;}
 box(.6,.55,.7,2.42,-.32,1.6,black);box(.11,.35,.45,2.75,-.3,1.6,mat(0xbf3f34));
 const ledMat=new THREE.MeshStandardMaterial({color:0x54fa9f,emissive:0x32e97e,emissiveIntensity:1});cylinder(.105,.32,-2.08,.26,-1.87,ledMat);
 for(const x of [-2,2])for(const z of [-1.9,1.9])cylinder(.07,.55,x,-.15,z,gold);
 let frame=0,lastZero=0,lastView=0;const reference=new THREE.Quaternion(),target=new THREE.Quaternion(),desired=new THREE.Quaternion();
 // Right-handed IMU XYZ to model X,-Z,Y; sensor board normal becomes model +Y.
 const basis=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),invBasis=basis.clone().invert();
 const observer=new ResizeObserver(()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();});observer.observe(el);
 const animate=()=>{const s=state.current;
 if(s.quaternion){const [w,x,y,z]=s.quaternion;target.set(x,y,z,w).normalize();target.premultiply(basis).multiply(invBasis);}
 if(lastZero!==s.zero){reference.copy(target).invert();lastZero=s.zero;}
 if(lastView!==s.view){camera.position.set(7,8,9);controls.target.set(0,0,0);lastView=s.view;}
 board.quaternion.slerp(desired.copy(reference).multiply(target),.2);ledMat.emissiveIntensity=1;controls.update();renderer.render(scene,camera);frame=requestAnimationFrame(animate);};frame=requestAnimationFrame(animate);
 return()=>{cancelAnimationFrame(frame);observer.disconnect();controls.dispose();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});grid.geometry.dispose();(grid.material as THREE.Material).dispose();renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div className="board-canvas" ref={host} role="img" aria-label="Interactive 3D replica of the EDITH sensor board">{error&&<div className="webgl-error">3D requires WebGL. Sensor readings remain available.</div>}</div>;
}
