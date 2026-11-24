import { zipSync, strToU8 } from '../vendor/fflate/fflate.mjs';

// Opt-in local QA only (?qa=1). Uses the actual production page, loader,
// Puppet, Stage, input interpretation, IK and story state machine.
export function installQA(app) {
  const { stage, show, STATE } = app;
  window.SHADOWPLAY_QA_PAUSED = true;
  const panel = document.createElement('div');
  panel.id = 'artwork-qa';
  panel.style.cssText = 'position:fixed;bottom:8px;left:10px;right:10px;z-index:99999;background:#fff;color:#222;padding:10px;font:14px sans-serif;box-shadow:0 1px 8px #0008';
  panel.innerHTML = `<b>六出戏美术验收 · 模拟输入</b> <button id="qa-neck">颈部专项验收</button> <button id="qa-run">运行完整验收</button> <button id="qa-export" disabled>下载运行证据 ZIP</button> <button id="qa-rest">静止</button> <button id="qa-pose">屈肘抬手</button> <button id="qa-skin">切换模式</button> <span id="qa-status">就绪 · 未连接真实摄像头</span><pre id="qa-log" style="max-height:100px;overflow:auto;margin:5px 0 0;white-space:pre-wrap"></pre>`;
  document.body.append(panel);
  document.getElementById('tutorial')?.classList.add('is-hidden');
  const status = document.getElementById('qa-status');
  const logEl = document.getElementById('qa-log');
  const files = {};
  const results = [];
  const modes = ['silhouette', 'carved', 'painted'];
  const record = (name, ok, detail = {}) => {
    results.push({ name, pass: !!ok, ...detail });
    logEl.textContent += `${ok ? 'PASS' : 'FAIL'} ${name}\n`;
    if (!ok) throw new Error(name + ': ' + JSON.stringify(detail));
  };
  const yieldFrame = () => new Promise(requestAnimationFrame);
  const poseSnapshot = () => JSON.stringify({scene:show.sceneIndex,beat:show.beatIndex,state:show.state,puppets:stage.puppets.map(p=>({x:p.x,facing:p.facing,time:p.time,theta:p.rig.parts.map(x=>x.theta),targets:p.armTargets,held:[...p.heldPose]}))});
  const png = canvas => new Promise(resolve => canvas.toBlob(async blob=>resolve(new Uint8Array(await blob.arrayBuffer())), 'image/png'));
  async function capture(name, only = null) {
    const vis = stage.puppets.map(p=>p.group.visible);
    if (only != null) stage.puppets.forEach((p,i)=>p.group.visible=i===only);
    const sceneryVisible=stage.sceneryLayer.visible;
    const tight=only!=null && !!stage.puppets[only]?.rig.manifest.sceneRole;
    if(tight)stage.sceneryLayer.visible=false;
    stage.render();
    const source = stage.canvas;
    let crop=null;
    if(tight){
      const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const x=c.getContext('2d');x.drawImage(source,0,0);const a=x.getImageData(0,0,c.width,c.height).data;
      let x0=c.width,y0=c.height,x1=0,y1=0;
      for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++)if(a[(y*c.width+i)*4+3]>32){x0=Math.min(x0,i);y0=Math.min(y0,y);x1=Math.max(x1,i);y1=Math.max(y1,y);}
      x0=Math.max(0,x0-18);y0=Math.max(0,y0-18);x1=Math.min(c.width,x1+18);y1=Math.min(c.height,y1+18);crop=[x0,y0,x1-x0,y1-y0];
    }
    const out = document.createElement('canvas');
    out.width = crop ? crop[2] : only == null ? source.width : Math.round(source.width/2);
    out.height = (crop ? crop[3] : source.height) + 32;
    const ctx=out.getContext('2d');
    const cell=16;
    for(let y=32;y<out.height;y+=cell)for(let x=0;x<out.width;x+=cell){ctx.fillStyle=((x/cell+Math.floor((y-32)/cell))%2)?'#d6c7aa':'#fff5df';ctx.fillRect(x,y,cell,cell);}
    ctx.fillStyle='#24190e';ctx.fillRect(0,0,out.width,32);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText(name+' | actual WebGL render · simulated input',8,21);
    if(crop)ctx.drawImage(source,...crop,0,32,crop[2],crop[3]);
    else if(only==null)ctx.drawImage(source,0,32);
    else ctx.drawImage(source,only===0?0:source.width/2,0,source.width/2,source.height,0,32,out.width,source.height);
    files[`screenshots/${name}.png`]=await png(out);
    stage.sceneryLayer.visible=sceneryVisible;
    stage.puppets.forEach((p,i)=>p.group.visible=vis[i]);stage.render();
  }
  function rest() {
    for(const p of stage.puppets){
      p.still=true;p.x=p.baseX;p.time=0;p.walkPhase=0;p.walkAmount=0;p.bodyBob=0;p.bodyLean=0;p.headTilt=0;
      for(const side of ['left','right']){p.setHeld(side,false);p.clearHandTarget(side);}
      for(let i=0;i<100;i++)p.update(1/60,{still:true,rods:false});
    }
    stage.render();
  }
  function posed(frame=1) {
    for(const p of stage.puppets){
      const a=p.rig.arms.left, b=p.rig.arms.right;
      if (a && b) {
        p.setHandTarget('left',p.rigToWorld(a.shoulder.x+110*Math.sin(frame*1.3),a.shoulder.y-110-55*Math.sin(frame)));
        p.setHandTarget('right',p.rigToWorld(b.shoulder.x-65,b.shoulder.y+80));
      } else {
        p.setHandTarget('left',p.rigToWorld(p.rig.bounds.width*.5,p.rig.bounds.height*.15));
        p.setHandTarget('right',p.rigToWorld(p.rig.bounds.width*.5,p.rig.bounds.height*.85));
      }
      p.update(1/60,{still:true,rollL:.6*Math.sin(frame),rollR:-.45,move:0,rods:true});
    }
    stage.render();
  }
  function rawHands(kind) {
    return ['left','right'].map((side,i)=>({label:side==='left'?'Left':'Right',player:0,side,age:0,landmarks:Array.from({length:21},()=>({x:.5,y:.55,z:0})),palm:{x:kind==='bow' ? .47+i*.06 : .18+i*.64,y:kind==='raise'?.35:.57,z:0},gesture:'Open_Palm',gestureScore:.99,openness:1.9,extended:4,pinch:.9,vx:kind==='swing'?1.3:0,vy:0,roll:0}));
  }
  function simulate(kind,frames) {
    show.manual=null;show.readHands=()=>rawHands(kind);
    for(let i=0;i<frames;i++)show.update(1/60,performance.now()+i*16.667);
  }
  async function run() {
    results.length=0;logEl.textContent='';document.getElementById('qa-run').disabled=true;
    try {
      await show.loadScene(0,{silent:true});show.setState(STATE.PLAY,true);show.splitHands=false;
      record('第一出戏两名角色使用独立美术包',stage.puppets.length===2 && stage.puppets.every(p=>p.rig.manifest.visualSkins));
      record('每名角色11部件10关节及两条双骨IK链',stage.puppets.every(p=>p.rig.parts.length===11&&p.rig.joints.length===10&&p.rig.arms.left&&p.rig.arms.right));
      for(const mode of modes){
        status.textContent=`检查 ${mode}`;show.applySkin(mode);rest();
        for(let i=0;i<2;i++)await capture(`${i===0?'woman':'scholar'}_${mode}`,i);
        // Check actual uploaded texture alpha, including enclosed cutouts.
        if(mode==='carved')for(const p of stage.puppets){
          const part=p.rig.parts.find(x=>x.id===p.rig.roles.lowerTorso);const im=part.skinTextures.carved.image;
          const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const cx=c.getContext('2d');cx.drawImage(im,0,0);
          const pixels=cx.getImageData(Math.floor(c.width*.30),Math.floor(c.height*.25),Math.floor(c.width*.40),Math.floor(c.height*.5)).data;
          let clear=0;for(let k=3;k<pixels.length;k+=4)if(pixels[k]<16)clear++;
          record(`${p.name} 雕花腹部采样存在真实alpha镂空`,clear/(pixels.length/4)>.15,{transparentFraction:clear/(pixels.length/4)});
        }
        const before=stage.puppets.map(p=>p.rig.parts.map(x=>x.theta));
        for(let f=0;f<80;f++)posed(f/30);
        record(`${mode} 双骨IK驱动抬手屈肘与转腕`,stage.puppets.every((p,i)=>p.rig.parts.some((x,k)=>Math.abs(x.theta-before[i][k])>.2)&&Math.abs(p.wristRoll.left)>.05));
        record(`${mode} 所有关节变换均为有限数值`,stage.puppets.every(p=>[...p.matrices.values()].every(r=>Object.values(r.F).every(Number.isFinite))));
        await capture(`both_${mode}_bent`);
        const snap=poseSnapshot();show.applySkin(modes[(modes.indexOf(mode)+1)%3]);
        record(`${mode} 切换保留位置姿态执签与剧情状态`,snap===poseSnapshot());show.applySkin(mode);
        const p=show.lead;p.setHeld('left',true);const held=p.rig.arms.left.upper.theta;
        for(let f=0;f<30;f++)p.update(1/60,{still:true,rods:true});
        record(`${mode} 执签保持手臂`,Math.abs(p.rig.arms.left.upper.theta-held)<.03);p.setHeld('left',false);
        rest();const startX=p.x;
        for(let f=0;f<36;f++)stage.puppets.forEach(q=>q.update(1/60,{move:.5,still:true,rods:false}));
        record(`${mode} 行走位移及双足动画`,p.x>startX+20&&p.walkAmount>.5&&Math.abs(p.rig.byId.get(p.rig.roles.legs.left.upper).theta)>.01);
        await capture(`both_${mode}_walking`);
        await yieldFrame();
      }
      show.applySkin('painted');rest();
      for(let f=0;f<=120;f++){
        posed(f/24);
        if(f%12===0)await capture(`motion_${String(f).padStart(3,'0')}`);
        if(f%24===0){const snap=poseSnapshot();show.cycleSkin();record(`连续动画帧${f}切换无状态重置`,snap===poseSnapshot());}
      }
      status.textContent='模拟双手推进第一出戏';
      show.beatIndex=-1;show.setState(STATE.PLAY,true);show.startBeats();show.cueLatch=false;show.raiseTimer=0;
      simulate('neutral',150);record('首句到第一次作揖',show.beatIndex===1,{beat:show.beatIndex});
      simulate('bow',40);record('第一次真实输入几何识别为作揖并推进',show.beatIndex===2&&show.posture==='bow',{beat:show.beatIndex,posture:show.posture});
      simulate('bow',50);record('保持同一手势不会重复推进',show.beatIndex===2);
      simulate('neutral',30);simulate('bow',40);record('松开后第二次作揖推进',show.beatIndex===3);
      await capture('story_second_bow');simulate('neutral',200);record('第一出戏四句完整推进',show.beatIndex===4);
      for(let s=1;s<6;s++){
        status.textContent=`回归验证第 ${s+1} 出`;
        await show.loadScene(s,{silent:true});show.applySkin('painted');simulate('neutral',12);
        record(`第${s+1}出 专属独立三模式角色包加载`,stage.puppets.length===app.SCENES[s].cast.length&&stage.puppets.every(p=>p.rig.manifest.visualSkins&&p.rig.manifest.sceneRole?.scene===app.SCENES[s].id));
        const expected=app.SCENES[s].cast.map(c=>c.asset);
        record(`第${s+1}出 人物身份与原关节拓扑存在`,stage.puppets.every((p,i)=>p.name===expected[i]&&p.rig.parts.length>0));
        for (const mode of modes) {
          status.textContent=`第${s+1}出 ${mode}`;
          show.applySkin(mode);rest();
          await capture(`${show.scene.id}_${mode}_rest`);
          for(let i=0;i<stage.puppets.length;i++)await capture(`${show.scene.id}_${stage.puppets[i].rig.manifest.sceneRole.role}_${mode}`,i);
          if(mode==='carved')for(const p of stage.puppets){
            let interior=0,holes=0;
            for(const part of p.rig.parts){
              const c=document.createElement('canvas');c.width=part.width;c.height=part.height;const x=c.getContext('2d');
              x.drawImage(part.skinTextures.silhouette.image,0,0);const a=x.getImageData(0,0,c.width,c.height).data;
              x.clearRect(0,0,c.width,c.height);x.drawImage(part.skinTextures.carved.image,0,0);const b=x.getImageData(0,0,c.width,c.height).data;
              for(let k=3;k<a.length;k+=4)if(a[k]>220){interior++;if(b[k]<16)holes++;}
            }
            record(`第${s+1}出 ${p.name} 雕花内部真实透明`,holes/interior>.015,{transparentInteriorFraction:holes/interior});
          }
          const before=stage.puppets.map(p=>p.rig.parts.map(x=>x.theta));
          for(let f=0;f<70;f++)posed(f/25);
          record(`第${s+1}出 ${mode} 抬手屈肘转腕或动物关节响应`,stage.puppets.every((p,i)=>p.rig.parts.some((x,k)=>Math.abs(x.theta-before[i][k])>.04)));
          record(`第${s+1}出 ${mode} 全部仿射变换有效`,stage.puppets.every(p=>[...p.matrices.values()].every(r=>Object.values(r.F).every(Number.isFinite))));
          await capture(`${show.scene.id}_${mode}_posed`);
          const snapshot=poseSnapshot();show.cycleSkin();
          record(`第${s+1}出 ${mode} 切换不重置姿态剧情位置执签`,snapshot===poseSnapshot());show.applySkin(mode);
          for (const p of stage.puppets) {
            p.setHeld('left',true);
            const part=p.rig.arms.left?.upper || p.rig.byId.get(p.rig.manifest.articulation.jointDrives.find(x=>x.side==='left').part);
            const angle=part.theta;
            for(let f=0;f<20;f++)p.update(1/60,{still:true,move:0});
            record(`第${s+1}出 ${mode} ${p.name} 执签保持关节`,Math.abs(part.theta-angle)<.03);p.setHeld('left',false);
          }
          rest();
          const walkStarts=stage.puppets.map(p=>p.x);
          for(let f=0;f<36;f++)stage.puppets.forEach((p,i)=>p.update(1/60,{still:true,move:walkStarts[i]>0?-.5:.5,rods:false}));
          record(`第${s+1}出 ${mode} 行走位移`,stage.puppets.every((p,i)=>Math.abs(p.x-walkStarts[i])>20));
          await capture(`${show.scene.id}_${mode}_walking`);await yieldFrame();
        }
        show.applySkin('painted');rest();
        for(let frame=0;frame<=60;frame++) {
          posed(frame/20);
          if(frame%12===0) {
            await capture(`${show.scene.id}_motion_${String(frame).padStart(3,'0')}`);
            const snapshot=poseSnapshot();show.cycleSkin();
            record(`第${s+1}出 动画帧${frame}切换保留状态`,snapshot===poseSnapshot());
          }
        }
        show.applySkin('painted');rest();
        show.startBeats();show.cueLatch=false;show.raiseTimer=0;
        for(let beat=0;beat<show.scene.beats.length;beat++){
          const spec=show.scene.beats[beat];
          if(spec.cue){simulate('neutral',35);simulate(spec.cue==='raise'?'raise':spec.cue,40);}
          else simulate('neutral',Math.ceil((spec.wait||2.6)*60)+5);
          if(show.sceneIndex!==s||show.beatIndex!==beat+1)throw new Error(`第${s+1}出第${beat+1}句未推进`);
        }
        record(`第${s+1}出 全剧情条件与台词推进`,show.beatIndex===show.scene.beats.length);
        await capture(`regression_scene_${s+1}`);await yieldFrame();
      }
      await show.loadScene(0,{silent:true});show.applySkin('painted');rest();
      app.ui.setCaption('六出戏 · 三十六套独立关节美术资产');
      status.textContent=`完成：${results.filter(x=>x.pass).length}/${results.length} 项通过 · 真实摄像头未测`;
    }catch(error){status.textContent='验收失败：'+error.message;logEl.textContent+='\n'+error.stack;results.push({error:String(error),stack:error.stack});console.error(error);}
    files['results.json']=strToU8(JSON.stringify({timestamp:new Date().toISOString(),url:location.href,userAgent:navigator.userAgent,renderer:stage.renderer.getContext().getParameter(stage.renderer.getContext().RENDERER),cameraTested:false,input:'synthetic hand observations / direct IK targets; no camera frames',results},null,2));
    document.getElementById('qa-export').disabled=false;document.getElementById('qa-run').disabled=false;
    window.SHADOWPLAY_QA_RESULTS=results;
    if(location.port==='8766'){
      for(const [name,bytes] of Object.entries(files))await fetch('/__evidence/'+name,{method:'POST',body:bytes});
      status.textContent+=' · 运行证据已保存';
    }
  }

  async function runNeck() {
    const checks=[];const evidence={};
    const density=stage.renderer.getPixelRatio();
    document.getElementById('qa-neck').disabled=true;
    try {
      await show.loadScene(0,{silent:true});rest();
      stage.renderer.setPixelRatio(3);
      for(const mode of modes){
        show.applySkin(mode);
        for(const [pose,ctx] of [['rest',{}],['bow',{bow:1,headTilt:-.08}],['raise',{flourish:1,headTilt:.10}]]){
          rest();
          for(let f=0;f<90;f++)for(const p of stage.puppets){
            if(pose==='raise')for(const side of ['left','right']){
              const a=p.rig.arms[side];p.setHandTarget(side,p.rigToWorld(a.shoulder.x+(side==='left'?100:-80),a.shoulder.y-100));
            }
            p.update(1/60,{still:true,rods:false,...ctx});
          }
          stage.render();
          for(let i=0;i<2;i++){
            const p=stage.puppets[i];const head=p.rig.headPart;const M=p.matrices.get(head.id).T;
            const pt={x:M.a*head.pivot.x+M.c*head.pivot.y+M.tx,y:M.b*head.pivot.x+M.d*head.pivot.y+M.ty};
            const world=p.rigToWorld(pt.x,pt.y);const source=stage.canvas;
            const px=(world.x-stage.camera.left)/(stage.camera.right-stage.camera.left)*source.width;
            const py=(stage.camera.top-world.y)/(stage.camera.top-stage.camera.bottom)*source.height;
            const scale=source.height/(stage.camera.top-stage.camera.bottom);
            const size=Math.round(160*scale);const left=Math.round(px-size/2);const top=Math.round(py-size/2);
            const region=document.createElement('canvas');region.width=size;region.height=size;
            const rc=region.getContext('2d');
            const visible=[...p.partObjects.values()].map(o=>o.mesh.visible);
            const groupVis=stage.puppets.map(q=>q.group.visible);stage.puppets.forEach((q,n)=>q.group.visible=n===i);
            const sceneryVis=stage.sceneryLayer.visible;stage.sceneryLayer.visible=false;
            const layers=[];
            for(const part of [p.rig.headPart,p.rig.torsoPart]){
              for(const o of p.partObjects.values())o.mesh.visible=o.part.id===part.id;
              stage.render();rc.clearRect(0,0,size,size);rc.drawImage(source,left,top,size,size,0,0,size,size);
              layers.push(rc.getImageData(0,0,size,size).data);
            }
            let overlap=0;
            // Central collar area only: exclude the braid and arm overlaps.
            for(let y=Math.round(size*.3);y<Math.round(size*.8);y++)for(let x=Math.round(size*.35);x<Math.round(size*.75);x++){
              const k=(y*size+x)*4+3;if(layers[0][k]>50&&layers[1][k]>50)overlap++;
            }
            [...p.partObjects.values()].forEach((o,n)=>o.mesh.visible=visible[n]);
            stage.puppets.forEach((q,n)=>q.group.visible=groupVis[n]);stage.sceneryLayer.visible=sceneryVis;
            stage.render();
            const out=document.createElement('canvas');out.width=480;out.height=512;const oc=out.getContext('2d');
            oc.fillStyle='#efe5cc';oc.fillRect(0,0,480,512);oc.drawImage(source,left,top,size,size,0,32,480,480);
            oc.fillStyle='#25190e';oc.fillRect(0,0,480,32);oc.fillStyle='#fff';oc.font='16px sans-serif';
            const name=`${i===0?'woman':'scholar'}_${mode}_${pose}`;oc.fillText(name,8,22);
            evidence[`neck/${name}.png`]=await png(out);
            checks.push({name,pass:overlap>30,actualRenderedOverlapPixels:overlap,headAngle:head.theta,bodyAngle:p.rig.torsoPart.theta});
            status.textContent=`颈部检查 ${name} ${overlap>30?'通过':'失败'}`;
          }
          await yieldFrame();
        }
      }
    }catch(error){checks.push({pass:false,error:String(error),stack:error.stack});}
    finally {stage.renderer.setPixelRatio(density);document.getElementById('qa-neck').disabled=false;}
    const report={timestamp:new Date().toISOString(),artworkVersion:stage.puppets[0]?.rig.manifest.artworkVersion,cameraTested:false,method:'Actual production WebGL layers rendered separately; collar-local alpha intersections plus visible closeups in rest, bow and raised-arm/head-tilt poses.',checks};
    evidence['neck-results.json']=strToU8(JSON.stringify(report,null,2));
    if(location.port==='8766')for(const [name,bytes]of Object.entries(evidence))await fetch('/__evidence/'+name,{method:'POST',body:bytes});
    status.textContent=`颈部专项 ${checks.filter(x=>x.pass).length}/${checks.length} 通过；近景已保存`;
    show.applySkin('painted');rest();stage.render();
  }
  document.getElementById('qa-neck').onclick=runNeck;
  document.getElementById('qa-run').onclick=run;
  document.getElementById('qa-export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([zipSync(files)],{type:'application/zip'}));a.download='act01-browser-evidence.zip';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);};
  document.getElementById('qa-rest').onclick=rest;
  document.getElementById('qa-pose').onclick=()=>{for(let f=0;f<80;f++)posed(f/30);};
  document.getElementById('qa-skin').onclick=()=>{show.cycleSkin();stage.render();status.textContent=show.skin;};
  rest();
  // A separate targeted transport check: the mock CDN deliberately omits
  // sceneArt. Production must take annotations from the bundled release.
  async function runCatalog() {
    const checks=[];
    const check=(name,pass)=>{checks.push({name,pass:!!pass});logEl.textContent+=`${pass?'PASS':'FAIL'} ${name}\n`;if(!pass)throw new Error(name);};
    try {
      check('模拟旧CDN索引确实没有新美术配置',app.show.catalog.every(item=>!item.sceneArt));
      for(let index=0;index<app.SCENES.length;index++) {
        status.textContent=`旧CDN索引检查 第${index+1}出`;
        await show.loadScene(index,{silent:true});rest();
        check(`第${index+1}出两名角色均加载本包独立美术`,stage.puppets.length===2&&stage.puppets.every(p=>p.rig.manifest.visualSkins));
        for(const mode of modes) {
          show.applySkin(mode);stage.render();
          check(`第${index+1}出 ${mode} 独立材质生效`,stage.puppets.every(p=>p.skin===mode&&[...p.partObjects.values()].every(o=>o.mesh.material.map===o.part.skinTextures[mode])));
          await yieldFrame();
        }
      }
      await show.loadScene(0,{silent:true});show.applySkin('painted');rest();
      status.textContent=`旧CDN索引验收完成：${checks.filter(c=>c.pass).length}/${checks.length}通过`;
    } catch(error) {checks.push({name:String(error),pass:false});status.textContent='旧CDN索引验收失败：'+error.message;}
    await fetch('/__evidence/catalog-results.json',{method:'POST',body:JSON.stringify({timestamp:new Date().toISOString(),url:location.href,remoteCatalog:'local mock of legacy CDN catalog, sceneArt removed',cameraTested:false,checks},null,2)});
  }
  if(new URLSearchParams(location.search).get('catalog')==='1')runCatalog();

}
