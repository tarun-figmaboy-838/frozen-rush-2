#!/usr/bin/env node
/**
 * verify-mix.js — prove the mix layer does what it claims, by rendering it.
 *
 *   1. Every trimmed sound lands on its family target.
 *   2. Ducking actually attenuates effects while voice plays, and restores.
 *   3. A burst of cues stays below full scale instead of clipping.
 */
'use strict';
const path = require('path');
const { OfflineAudioContext } = require('node-web-audio-api');

const SR = 48000, SFX_PATH = path.resolve(__dirname, '../sfx.js');
const PRE = { b:[1.53512485958697,-2.69169618940638,1.19839281085285], a:[1,-1.69065929318241,0.73248077421585] };
const RLB = { b:[1,-2,1], a:[1,-1.99004745483398,0.99007225036621] };

function biquad(x,c){const y=new Float64Array(x.length);let x1=0,x2=0,y1=0,y2=0;
  for(let i=0;i<x.length;i++){const v=c.b[0]*x[i]+c.b[1]*x1+c.b[2]*x2-c.a[1]*y1-c.a[2]*y2;
    x2=x1;x1=x[i];y2=y1;y1=v;y[i]=v;}return y;}
function lufs(s){const k=biquad(biquad(Float64Array.from(s),PRE),RLB);const w=Math.round(0.1*SR);
  if(k.length<w)return -Infinity;let sum=0;for(let i=0;i<w;i++)sum+=k[i]*k[i];let best=sum;
  for(let i=w;i<k.length;i++){sum+=k[i]*k[i]-k[i-w]*k[i-w];if(sum>best)best=sum;}
  const ms=best/w;return ms>0?-0.691+10*Math.log10(ms):-Infinity;}
/**
 * Average several renders in the power domain. Noise-based recipes read a
 * random offset into a freshly generated noise buffer, so a single render of
 * a 35 ms click can sit several dB from its own mean. Calibrating from one
 * draw bakes that error into the trim.
 */
function meanLoudness(runs) {
  var lin = 0, n = 0;
  for (var i = 0; i < runs.length; i++) {
    if (isFinite(runs[i])) { lin += Math.pow(10, runs[i] / 10); n++; }
  }
  return n ? 10 * Math.log10(lin / n) : -Infinity;
}

function peak(s){let p=0;for(let i=0;i<s.length;i++){const a=Math.abs(s[i]);if(a>p)p=a;}return p;}
function rmsRange(s,a,b){let t=0,n=0;for(let i=Math.floor(a*SR);i<Math.min(s.length,Math.floor(b*SR));i++){t+=s[i]*s[i];n++;}
  return n?Math.sqrt(t/n):0;}

function load(oac){
  global.window=global; global.self=global;
  global.AudioContext=function(){return oac;};
  global.addEventListener=()=>{}; global.removeEventListener=()=>{};
  global.document=undefined;
  delete require.cache[require.resolve(SFX_PATH)];
  const S=require(SFX_PATH); S.unlock(); S.volume(1); return S;
}

const TARGETS={interface:-27,setup:-24,movement:-23,cartoon:-22,comic:-21,
 reward:-20,punchline:-19,drama:-18};
const FAMILY={coin:'reward',gem:'reward',powerUp:'reward',levelUp:'reward',sparkle:'reward',correct:'reward',
 jump:'movement',doubleJump:'movement',boing:'movement',swoosh:'movement',slice:'movement',land:'movement',
 pop:'cartoon',bubble:'cartoon',squeak:'cartoon',splat:'cartoon',honk:'cartoon',slideWhistle:'cartoon',
 click:'interface',select:'interface',tick:'interface',wrong:'interface',error:'interface',menuWhoosh:'interface',
 laser:'drama',explode:'drama',hurt:'drama',gameOver:'drama',alarm:'drama',powerDown:'drama',
 sadTrombone:'punchline',rimshot:'punchline',drumroll:'punchline',
 ratchet:'setup',anticipate:'setup',
 bonk:'comic',doink:'comic',zip:'comic',recordScratch:'comic',cuckoo:'comic',
 rubberChicken:'comic',ricochet:'comic',pianoRun:'comic',fallingWhistle:'comic',kazoo:'comic'};

(async function(){
  let fails = 0;

  /* --- 1. trimmed levels hit their targets ------------------------- */
  console.log('\n1. Trimmed levels vs family targets\n');
  const errs = [];
  const oac0 = new OfflineAudioContext(1,128,SR);
  const names = load(oac0).list();

  const REPEATS = 7;
  for (const name of names) {
    const ls = [];
    for (let r = 0; r < REPEATS; r++) {
      const oac = new OfflineAudioContext(1, 3*SR, SR);
      const S = load(oac);
      S.play(name, { vary: 0 });
      ls.push(lufs((await oac.startRendering()).getChannelData(0)));
    }
    const got = meanLoudness(ls), want = TARGETS[FAMILY[name]];
    const err = got - want;
    errs.push(err);
    // Averaged over REPEATS renders, so the tolerance can be tight again.
    const tol = 1.5;
    const bad = Math.abs(err) > tol;
    if (bad) fails++;
    console.log(`   ${bad?'!':' '} ${name.padEnd(14)} ${got.toFixed(1).padStart(7)} LUFS  ` +
                `target ${want.toString().padStart(4)}  err ${((err>=0?'+':'')+err.toFixed(1)).padStart(6)} dB`);
  }
  const worst = Math.max(...errs.map(Math.abs));
  const spread = Math.max(...errs) - Math.min(...errs);
  console.log(`\n   worst deviation ${worst.toFixed(1)} dB, residual spread ${spread.toFixed(1)} dB ` +
              `(was 26.8 dB uncorrected)`);

  /* --- 2. ducking ------------------------------------------------- */
  console.log('\n2. Ducking under voice\n');
  const oacD = new OfflineAudioContext(1, 4*SR, SR);
  const S = load(oacD);

  // Steady tone on the sfx bus, so the duck envelope is readable directly.
  const osc = oacD.createOscillator();
  const og  = oacD.createGain();
  osc.frequency.value = 440; og.gain.value = 0.3;
  osc.connect(og); og.connect(S.bus());
  osc.start(0); osc.stop(4);

  // Open-ended duck held from 1.0 s, released at 2.0 s.
  let release = null;
  oacD.suspend(1.0).then(() => { release = S.duck(); oacD.resume(); });
  oacD.suspend(2.0).then(() => { release(); oacD.resume(); });
  // Timed duck at 2.8 s for 0.4 s, released on the audio clock with no callback.
  oacD.suspend(2.8).then(() => { S.duckFor(0.4); oacD.resume(); });

  const d = (await oacD.startRendering()).getChannelData(0);
  const seg = (a,b) => 20*Math.log10(rmsRange(d,a,b) / rmsRange(d,0.2,0.9));
  const rows = [
    ['0.2-0.9s  before',      seg(0.2,0.9),   0,   0.5],
    ['1.3-1.9s  held duck',   seg(1.3,1.9), -12,   1.5],
    ['2.4-2.7s  released',    seg(2.4,2.7),   0,   1.0],
    ['2.95-3.15s timed duck', seg(2.95,3.15),-12,  2.0],
    ['3.6-3.9s  restored',    seg(3.6,3.9),   0,   1.0]
  ];
  let duckOk = true;
  for (const [label, got, want, tol] of rows) {
    const ok = Math.abs(got - want) <= tol;
    if (!ok) duckOk = false;
    console.log(`   ${ok?'ok  ':'FAIL'} ${label.padEnd(22)} ${got.toFixed(1).padStart(6)} dB  ` +
                `(expect ${want>=0?'+':''}${want} ±${tol})`);
  }
  if (!duckOk) fails++;

  /* --- 3. burst headroom ------------------------------------------ */
  console.log('\n3. Burst headroom — 20 identical cues in one frame\n');
  for (const lim of [false, true]) {
    for (const cap of [99, 4]) {
      const oacB = new OfflineAudioContext(1, 2*SR, SR);
      const B = load(oacB);
      B.configure({ maxVoices: cap, limiter: lim });
      for (let i = 0; i < 20; i++) B.play('explode', { vary: 0 });
      const pcm = (await oacB.startRendering()).getChannelData(0);
      const p = peak(pcm);
      const clip = p > 1.0;
      if (lim && clip) fails++;
      console.log(`   limiter ${lim ? 'on ' : 'off'}  cap ${String(cap).padEnd(3)} ` +
                  `peak ${p.toFixed(3)}  ${clip ? 'CLIPPING' : 'clean'}`);
    }
  }
  console.log('\n   Voice capping is what keeps the signal in range; the soft clip is');
  console.log('   the backstop for whatever still gets through.');

  /* --- 4. musical key --------------------------------------------- */
  console.log('\n4. Key quantisation\n');
  {
    const oacK = new OfflineAudioContext(1, 128, SR);
    const K = load(oacK);
    const semis = f => 12 * Math.log2(f / 440);
    K.key('C pentatonic');
    const inKey = [440, 466.16, 493.88, 523.25, 554.37, 587.33].map(f => K.snap(f));
    const pcs = inKey.map(f => ((Math.round(semis(f)) + 69) % 12 + 12) % 12);
    const allowed = [0, 2, 4, 7, 9];   // C pentatonic pitch classes
    const ok1 = pcs.every(pc => allowed.indexOf(pc) >= 0);
    // Snapping should never move a note more than a semitone and a bit.
    const drift = [440, 466.16, 493.88, 554.37].map(f => Math.abs(semis(K.snap(f)) - semis(f)));
    const ok2 = drift.every(d => d <= 1.51);
    K.key(null);
    const ok3 = K.snap(466.16) === 466.16;
    console.log(`   ${ok1?'ok  ':'FAIL'} every snapped note is in C pentatonic`);
    console.log(`   ${ok2?'ok  ':'FAIL'} max drift ${Math.max(...drift).toFixed(2)} semitones`);
    console.log(`   ${ok3?'ok  ':'FAIL'} key(null) is exactly identity`);
    if (!ok1 || !ok2 || !ok3) fails++;
  }

  console.log(fails ? `\n${fails} check(s) failed\n` : '\nall verified\n');
  process.exit(fails ? 1 : 0);
})();
