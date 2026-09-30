// Deterministic frame capture avoids real-time recording stalls and dropped animation frames.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'app/package.json'));
const {chromium}=require('@playwright/test');
const format=process.argv.includes('--portrait')?'portrait':'landscape';
const preview=process.argv.includes('--preview');
const out=path.join(root,'app/public/films/monsoon');
const evidence=path.join(root,'dist/monsoon-film',format);
await mkdir(evidence,{recursive:true});
const W=format==='portrait'?1080:1920,H=format==='portrait'?1920:1080;
const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=metal','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(`http://127.0.0.1:4178/films/monsoon/studio.html?capture=1&format=${format}`);
  await page.waitForFunction(()=>window.filmReady===true,{timeout:60000});
  const data=JSON.parse(await readFile(path.join(out,'manifest.json'),'utf8'));
  const checks=[];
  for(const s of data.scenes){
    for(const fraction of [.15,.55,.9]){
      const check=await page.evaluate(({time,id})=>{
        const report=window.renderFilm(time),canvas=document.getElementById('film');
        const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        const sample=[];
        for(let y=Math.floor(canvas.height*.34);y<canvas.height*.76;y+=13){
          for(let x=Math.floor(canvas.width*.04);x<canvas.width*.96;x+=13){const i=(y*canvas.width+x)*4;sample.push(pixels[i],pixels[i+1],pixels[i+2]);}
        }
        const previous=window.__filmPixelSamples?.[id];
        window.__filmPixelSamples??={};window.__filmPixelSamples[id]=sample;
        const changed=previous?sample.filter((v,i)=>Math.abs(v-previous[i])>4).length/sample.length:null;
        return{...report,contrast:Math.max(...sample)-Math.min(...sample),changedFraction:changed};
      },{time:s.start+s.duration*fraction,id:s.id});
      checks.push(check);
      if(fraction===.55)await page.screenshot({path:path.join(evidence,s.id+'.png')});
    }
  }
  const locationChecks=[];
  for(const scene of data.scenes.filter(s=>s.locationCues)){
    for(const cue of scene.locationCues){
      const report=await page.evaluate(t=>window.renderFilm(t),scene.start+cue.time+.1);
      const location=report.geography.find(g=>g.label===cue.label);
      locationChecks.push({scene:scene.id,cue:cue.label,time:scene.start+cue.time+.1,...location});
      if(!location?.visible||!location?.inFrame)throw new Error('Narrated location not visible: '+JSON.stringify(locationChecks));
      await page.screenshot({path:path.join(evidence,scene.id+'-'+cue.label.toLowerCase().replaceAll(' ','-')+'.png')});
    }
  }
  await writeFile(path.join(evidence,'checks.json'),JSON.stringify({errors,checks,locationChecks},null,2));
  const moving=new Set(['connection','normal','nino','india','recharge','mandals','districts','well','outlook','prepare','cities','close']);
  if(errors.length||checks.some(c=>c.overflow.length||c.contrast<70||(moving.has(c.id)&&c.changedFraction!==null&&c.changedFraction<.001)))throw new Error('Scene verification failed: '+JSON.stringify({errors,checks}));
  await page.evaluate(()=>window.renderFilm(2.4));
  await page.screenshot({path:path.join(out,format==='landscape'?'poster.jpg':'poster-portrait.jpg'),type:'jpeg',quality:94});
  if(process.argv.includes('--benchmark')){
    const start=Date.now();for(let i=0;i<30;i++){await page.evaluate(t=>window.renderFilm(t),2+i/30);await page.screenshot({type:'jpeg',quality:94});}
    console.log('Frame throughput: '+(30000/(Date.now()-start)).toFixed(1)+' fps');
  }
  if(!preview){
    const fps=30,frames=Math.ceil(data.duration*fps);
    const movie=path.join(out,`pacific-to-ap-${format}.mp4`);
    const encoder=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','pipe:0','-i',path.join(out,'narration.m4a'),'-map','0:v','-map','1:a','-c:v','libx264','-preset','medium','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t',String(data.duration),movie],{stdio:['pipe','inherit','inherit']});
    let pipeError;encoder.stdin.on('error',e=>{pipeError=e;});
    const exit=once(encoder,'close');
    for(let i=0;i<frames;i++){
      if(pipeError)throw pipeError;
      await page.evaluate(t=>window.renderFilm(t),i/fps);
      const frame=await page.screenshot({type:'jpeg',quality:94});
      if(!encoder.stdin.write(frame))await once(encoder.stdin,'drain');
      if(i%150===0)console.log(`${format}: ${i}/${frames} frames (${Math.round(i/frames*100)}%)`);
    }
    encoder.stdin.end();const [code]=await exit;if(code!==0)throw new Error('ffmpeg exited '+code);
    console.log('Rendered '+movie);
  }
}finally{await browser.close();}
