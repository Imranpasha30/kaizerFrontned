
import React, {  useState, useEffect, useRef, useMemo, useLayoutEffect  } from 'react';

/* ─────────── Hooks ─────────── */
function useReveal(threshold=0.18){
  const ref = useRef(null);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const io = new IntersectionObserver((ents)=>{
      ents.forEach(e=>{ if(e.isIntersecting){ el.classList.add('in'); io.unobserve(el); }});
    },{threshold});
    io.observe(el); return ()=>io.disconnect();
  },[threshold]);
  return ref;
}
function Reveal({children, delay=0, className=""}){
  const ref = useReveal();
  return <div ref={ref} className={`reveal ${className}`} style={{transitionDelay:`${delay}ms`}}>{children}</div>;
}
function useCounter(target, dur=1800){
  const [v,setV] = useState(0);
  const ref = useRef(null); const done = useRef(false);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const io = new IntersectionObserver(([e])=>{
      if(!done.current && e.isIntersecting){
        done.current = true;
        const t0 = performance.now();
        const step = (now)=>{
          const t = Math.min(1,(now-t0)/dur);
          const eased = 1 - Math.pow(1-t,3);
          setV(target * eased);
          if(t<1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step); io.unobserve(el);
      }
    },{threshold:.4});
    io.observe(el); return ()=>io.disconnect();
  },[target,dur]);
  return [v,ref];
}
function useMagnet(strength=0.4){
  const ref = useRef(null);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    if(window.matchMedia('(pointer:coarse)').matches) return;
    let raf=0, tx=0, ty=0, cx=0, cy=0;
    const animate = ()=>{ cx += (tx-cx)*0.2; cy += (ty-cy)*0.2;
      el.style.transform = `translate(${cx}px, ${cy}px)`;
      if(Math.abs(tx-cx)>0.1 || Math.abs(ty-cy)>0.1) raf = requestAnimationFrame(animate);
    };
    const onMove = (e)=>{
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width/2);
      const y = e.clientY - (r.top + r.height/2);
      const d = Math.hypot(x,y);
      const range = Math.max(r.width, r.height) * 1.4;
      if(d < range){ tx = x*strength; ty = y*strength; }
      else { tx = 0; ty = 0; }
      cancelAnimationFrame(raf); raf = requestAnimationFrame(animate);
    };
    const onLeave = ()=>{ tx=0;ty=0; cancelAnimationFrame(raf); raf = requestAnimationFrame(animate); };
    window.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return ()=>{ window.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); cancelAnimationFrame(raf); };
  },[strength]);
  return ref;
}
function Magnet({children, className="", strength=0.4, ...rest}){
  const ref = useMagnet(strength);
  return <span ref={ref} className={`magnet ${className}`} {...rest}>{children}</span>;
}
function useTilt(strength=8){
  const ref = useRef(null);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    if(window.matchMedia('(pointer:coarse)').matches) return;
    const onMove = (e)=>{
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left)/r.width;
      const y = (e.clientY - r.top)/r.height;
      el.style.transform = `perspective(1200px) rotateX(${(0.5-y)*strength}deg) rotateY(${(x-0.5)*strength}deg)`;
      el.style.setProperty('--mx', `${x*100}%`);
      el.style.setProperty('--my', `${y*100}%`);
    };
    const onLeave = ()=>{ el.style.transform = 'perspective(1200px) rotateX(0) rotateY(0)'; };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return ()=>{ el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); };
  },[strength]);
  return ref;
}
function useMouseVar(){
  const ref = useRef(null);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const onMove = (e)=>{
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    el.addEventListener('mousemove', onMove);
    return ()=>el.removeEventListener('mousemove', onMove);
  },[]);
  return ref;
}

/* ─────────── Word splitter ─────────── */
function SplitWords({text, base=0, per=70}){
  const ref = useReveal();
  const words = text.split(' ');
  return (
    <span ref={ref} className="reveal" style={{display:'inline'}}>
      {words.map((w,i)=>(
        <span key={i} className="split-word" style={{marginRight:'.22em'}}>
          <span style={{transitionDelay: `${base + i*per}ms`}}>{w}</span>
        </span>
      ))}
    </span>
  );
}

/* ─────────── Custom cursor ─────────── */
function LivingCursorInner(){
  const blob = useRef(null);
  const dot = useRef(null);
  const label = useRef(null);
  useEffect(()=>{
    if(window.matchMedia('(pointer:coarse)').matches) return;
    let mx=window.innerWidth/2, my=window.innerHeight/2;
    let bx=mx, by=my, dx=mx, dy=my;
    let raf;
    const move = (e)=>{ mx=e.clientX; my=e.clientY; };
    const down = ()=>{ blob.current?.classList.add('press'); };
    const up = ()=>{ blob.current?.classList.remove('press'); };
    const onOver = (e)=>{
      const t = e.target.closest('[data-cursor],a,button,[role="button"],input,textarea,.huge-target');
      blob.current?.classList.remove('hover','text','huge');
      label.current?.classList.remove('show');
      if(!t){ dot.current.style.opacity=1; return; }
      if(t.matches('input,textarea')){ blob.current?.classList.add('text'); return; }
      if(t.matches('.huge-target')){ blob.current?.classList.add('huge'); dot.current.style.opacity=0; return; }
      blob.current?.classList.add('hover');
      const lbl = t.getAttribute('data-cursor');
      if(lbl){ label.current.textContent = lbl; label.current.classList.add('show'); }
      else if(t.tagName==='A' || t.tagName==='BUTTON'){
        label.current.textContent = 'PRESS'; label.current.classList.add('show');
      }
    };
    window.addEventListener('mousemove', move, {passive:true});
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    document.addEventListener('mouseover', onOver, {passive:true});
    const tick = ()=>{
      bx += (mx-bx)*0.18; by += (my-by)*0.18;
      dx += (mx-dx)*0.55; dy += (my-dy)*0.55;
      if(blob.current){
        const w=blob.current.offsetWidth, h=blob.current.offsetHeight;
        blob.current.style.transform = `translate3d(${bx-w/2}px, ${by-h/2}px, 0)`;
      }
      if(dot.current){
        dot.current.style.transform = `translate3d(${dx-3}px, ${dy-3}px, 0)`;
      }
      if(label.current){
        label.current.style.transform = `translate3d(${dx+18}px, ${dy+18}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=>{
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      document.removeEventListener('mouseover', onOver);
    };
  },[]);
  return (
    <>
      <div ref={blob} className="cur-blob" aria-hidden></div>
      <div ref={dot} className="cur-dot" aria-hidden></div>
      <div ref={label} className="cur-label" aria-hidden></div>
    </>
  );
}

/* ─────────── Atmosphere ─────────── */
function Atmosphere(){
  return (
    <>
      <div className="bg-mesh"></div>
      <div className="bg-noise bg-grain-shift"></div>
      <div className="scanlines"></div>
      <div className="vignette"></div>
      <div className="letterbox-top"></div>
      <div className="letterbox-bot"></div>
    </>
  );
}

/* ─────────── Progress rail ─────────── */
function Rail(){
  const ref = useRef(null);
  useEffect(()=>{
    const onScroll = ()=>{
      const h = document.documentElement;
      const p = h.scrollTop / Math.max(1,(h.scrollHeight - h.clientHeight));
      if(ref.current) ref.current.style.width = `${(p*100).toFixed(2)}%`;
    };
    window.addEventListener('scroll', onScroll, {passive:true});
    onScroll();
    return ()=>window.removeEventListener('scroll', onScroll);
  },[]);
  return <div ref={ref} className="rail"></div>;
}

/* ─────────── HUD ─────────── */
function HUD(){
  const [tc, setTc] = useState('00:00:00');
  const [scene, setScene] = useState('I');
  useEffect(()=>{
    const onScroll = ()=>{
      const h = document.documentElement;
      const p = h.scrollTop / Math.max(1,(h.scrollHeight - h.clientHeight));
      const total = 6200; // 1:43:20
      const s = Math.floor(p*total);
      const hh = String(Math.floor(s/3600)).padStart(2,'0');
      const mm = String(Math.floor((s%3600)/60)).padStart(2,'0');
      const ss = String(s%60).padStart(2,'0');
      setTc(`${hh}:${mm}:${ss}`);
      const labels=['I · ARRIVAL','II · INGEST','III · CORE','IV · TUNNEL','V · UNIVERSE','VI · WRAP'];
      setScene(labels[Math.min(labels.length-1, Math.floor(p*labels.length))]);
    };
    window.addEventListener('scroll', onScroll, {passive:true});
    onScroll();
    return ()=>window.removeEventListener('scroll', onScroll);
  },[]);
  return (
    <div className="hud">
      <span className="pill"><span className="dot"></span>LIVE · KAIZER.PIPELINE</span>
      <span className="pill"><span className="digit">{tc}</span></span>
      <span className="pill">SCENE {scene}</span>
    </div>
  );
}

/* ─────────── Top nav ─────────── */
function TopNav(){
  return (
    <nav className="topnav">
      <a className="logo glow-link" href="#top" data-cursor="HOME">◇ KAIZER.NEWS</a>
      <div className="links">
        <a href="#pipeline" className="glow-link" data-cursor="JUMP">Pipeline</a>
        <a href="#core" className="glow-link" data-cursor="JUMP">The Core</a>
        <a href="#scopes" className="glow-link" data-cursor="JUMP">Trust</a>
        <a href="#pricing" className="glow-link" data-cursor="JUMP">Pricing</a>
      </div>
      <Magnet><a href="/login" className="cap" style={{padding:'10px 18px',fontSize:'10.5px'}} data-cursor="ENTER">Enter ↗</a></Magnet>
    </nav>
  );
}

/* ─────────── SCENE 1 — Arrival ─────────── */
function SceneArrival(){
  const heroRef = useMouseVar();
  const titleRef = useRef(null);
  // Parallax title shift on mouse
  useEffect(()=>{
    const el = titleRef.current; if(!el) return;
    if(window.matchMedia('(pointer:coarse)').matches) return;
    const onMove = (e)=>{
      const x = (e.clientX/window.innerWidth - 0.5);
      const y = (e.clientY/window.innerHeight - 0.5);
      el.style.transform = `translate3d(${x*-10}px, ${y*-6}px, 0)`;
      el.style.textShadow = `${-x*4}px 0 0 rgba(0,224,255,${0.4 + Math.abs(x)*0.3}), ${x*4}px 0 0 rgba(255,80,140,${0.3 + Math.abs(x)*0.2})`;
    };
    window.addEventListener('mousemove', onMove);
    return ()=>window.removeEventListener('mousemove', onMove);
  },[]);

  return (
    <section id="top" ref={heroRef} className="relative min-h-screen pt-[120px] pb-[80px] px-7 lg:px-12">
      <div className="beam"></div>
      <div className="leak"></div>
      {/* Floating fog */}
      <div className="fog" style={{width:600,height:600,top:'-10%',left:'-10%'}}></div>
      <div className="fog" style={{width:500,height:500,bottom:'-15%',right:'-5%',background:'radial-gradient(circle, rgba(124,91,255,.08), transparent 70%)'}}></div>

      <div className="relative max-w-[1480px] mx-auto grid lg:grid-cols-12 gap-12 items-center min-h-[80vh]">
        {/* LEFT: massive type */}
        <div className="lg:col-span-7 relative z-10">
          <Reveal>
            <div className="eyebrow mb-8">
              <span className="bar"></span>
              <span>Scene 01 · The Arrival</span>
              <span className="chip chip-live"><span className="dot"></span>Now live · v6.0</span>
            </div>
          </Reveal>

          <h1 ref={titleRef} className="huge text-[14vw] sm:text-[12vw] lg:text-[10vw] xl:text-[160px] mb-7 huge-target">
            <SplitWords text="LONG VIDEO"/><br/>
            <span className="outline-text"><SplitWords text="IN. SHORTS" base={300}/></span><br/>
            <SplitWords text="THAT" base={600}/>
            <span style={{color:'var(--cyan)'}}> <SplitWords text="PUBLISH" base={750}/></span><br/>
            <span className="f-serif" style={{fontWeight:400,letterSpacing:'-0.02em',color:'var(--chrome-dim)'}}><SplitWords text="themselves." base={900}/></span>
          </h1>

          <Reveal delay={400}>
            <p className="max-w-[480px] text-[15.5px] leading-relaxed text-[color:var(--chrome-dim)] mb-10">
              A living interface for AI video automation. Upload an hour of footage. Walk away. Wake up to a week of vertical shorts already on your channel — captioned, branded, scheduled.
            </p>
          </Reveal>

          <Reveal delay={550}>
            <div className="flex flex-wrap gap-4 items-center">
              <Magnet strength={0.5}><a href="/register" className="cap" data-cursor="BEGIN">▸ Begin — it's free</a></Magnet>
              <Magnet strength={0.3}><a href="#pipeline" className="cap ghost" data-cursor="WATCH">Watch the pipeline</a></Magnet>
              <span className="muted f-mono text-[10.5px] tracking-[.26em] uppercase ml-2">OAuth · YouTube Data API v3</span>
            </div>
          </Reveal>

          {/* Footer strip */}
          <Reveal delay={750}>
            <div className="mt-20 grid grid-cols-4 gap-6 max-w-[640px]">
              {[
                {l:"Format",  v:"9:16"},
                {l:"Source",  v:"4K"},
                {l:"Render",  v:"3m12s"},
                {l:"Failures",v:"0"},
              ].map((s,i)=>(
                <div key={i}>
                  <div className="f-mono text-[9.5px] tracking-[.28em] uppercase muted mb-2">{s.l}</div>
                  <div className="f-display text-[28px]">{s.v}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* RIGHT: AI core sphere */}
        <div className="lg:col-span-5 flex justify-center items-center relative z-10">
          <AICoreSphere/>
        </div>
      </div>

      {/* Bottom: marquee strip */}
      <div className="relative mt-24 overflow-hidden">
        <div className="cyan-line mb-6"></div>
        <div className="flex marqx">
          {[...Array(2)].map((_,k)=>(
            <div key={k} className="strip-row flex items-center shrink-0">
              <span>INGEST</span><span className="dot-sep"></span>
              <span className="outline-text">ANALYZE</span><span className="dot-sep"></span>
              <span>CUT</span><span className="dot-sep"></span>
              <span style={{color:'var(--cyan)'}}>PUBLISH</span><span className="dot-sep"></span>
              <span className="outline-text">SLEEP</span><span className="dot-sep"></span>
            </div>
          ))}
        </div>
        <div className="cyan-line mt-6"></div>
      </div>
    </section>
  );
}

/* ─────────── AI Core sphere ─────────── */
function AICoreSphere(){
  const wrapRef = useRef(null);
  const innerRef = useRef(null);
  const [coords, setCoords] = useState({x:0,y:0});

  useEffect(()=>{
    const onMove = (e)=>{
      if(!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const x = (e.clientX - (r.left + r.width/2)) / r.width;
      const y = (e.clientY - (r.top + r.height/2)) / r.height;
      setCoords({x,y});
    };
    window.addEventListener('mousemove', onMove);
    return ()=>window.removeEventListener('mousemove', onMove);
  },[]);

  const x = coords.x, y = coords.y;

  const orbits = [
    {r:48, dur:14, items:8, color:'var(--cyan)'},
    {r:40, dur:22, items:5, color:'#7C5BFF', rev:true},
    {r:54, dur:30, items:12, color:'#F5E6C8'},
  ];

  return (
    <div ref={wrapRef} className="core-wrap huge-target" data-cursor="THE CORE">
      {/* Backdrop particles */}
      {Array.from({length:24}).map((_,i)=>(
        <span key={i} className="particle" style={{
          left: `${Math.random()*100}%`, top:`${Math.random()*100}%`,
          animationDelay: `${Math.random()*3}s`,
          opacity: 0.2+Math.random()*0.6,
        }}/>
      ))}

      {/* Outer ring frame */}
      <div className="core-ring spin-slow"></div>
      <div className="core-ring r2 spin-rev"></div>
      <div className="core-ring r3 spin-med">
        {/* tickmarks */}
        {Array.from({length:36}).map((_,i)=>(
          <div key={i} style={{
            position:'absolute', top:'50%', left:'50%',
            width:1, height:8, background:'var(--line-2)',
            transformOrigin: '50% 0',
            transform:`translate(-50%,0) rotate(${i*10}deg) translateY(-50%) translateY(-${Math.min(180, 50)}%)`,
          }}/>
        ))}
      </div>

      {/* Orbits with dots */}
      <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full" style={{transform:`rotateY(${x*16}deg) rotateX(${-y*16}deg)`, transition:'transform .2s ease'}}>
        {orbits.map((o,k)=>(
          <g key={k} style={{transformOrigin:'100px 100px'}}>
            <ellipse cx="100" cy="100" rx={o.r} ry={o.r*0.35} fill="none" stroke={o.color} strokeOpacity=".35" strokeWidth=".6" transform={`rotate(${k*40} 100 100)`}/>
          </g>
        ))}
        {/* connector points to inner */}
        {Array.from({length:6}).map((_,i)=>{
          const a = (i/6) * Math.PI*2 + (coords.x+coords.y)*0.5;
          const rx = 100 + Math.cos(a)*38;
          const ry = 100 + Math.sin(a)*38;
          return <line key={i} x1="100" y1="100" x2={rx} y2={ry} stroke="rgba(0,224,255,.2)" strokeDasharray="1 3"/>;
        })}
      </svg>

      {/* Animated dots on each orbit */}
      {orbits.map((o,k)=>(
        <div key={k} className={k===1?'spin-rev':'spin-slow'} style={{position:'absolute', inset:0, animationDuration:`${o.dur}s`}}>
          {Array.from({length:o.items}).map((_,i)=>{
            const a = (i/o.items) * 360;
            return (
              <span key={i} style={{
                position:'absolute', top:'50%', left:'50%',
                width:o.color==='var(--cyan)'?5:3, height:o.color==='var(--cyan)'?5:3,
                borderRadius:'50%',
                background:o.color, boxShadow:`0 0 8px ${o.color}`,
                transformOrigin:'0 0',
                transform:`translate(-50%,-50%) rotate(${a}deg) translateY(-${o.r}%)`,
                opacity:0.7+0.3*Math.sin(i),
              }}/>
            );
          })}
        </div>
      ))}

      {/* Inner core */}
      <div ref={innerRef} className="core-inner" style={{
        transform:`translate(${x*8}px, ${y*8}px)`,
        transition:'transform .15s ease'
      }}>
        {/* Glints */}
        <div style={{position:'absolute',inset:0,borderRadius:'50%',background:'radial-gradient(circle at 30% 30%, rgba(255,255,255,.6), transparent 30%)',mixBlendMode:'screen'}}></div>
      </div>

      {/* HUD readouts around the sphere */}
      <div className="absolute -top-1 left-0 f-mono text-[9.5px] tracking-[.24em] uppercase muted">◇ NODE.001</div>
      <div className="absolute -top-1 right-0 f-mono text-[9.5px] tracking-[.24em] uppercase" style={{color:'var(--cyan)'}}>● ONLINE</div>
      <div className="absolute bottom-0 left-0 f-mono text-[9.5px] tracking-[.24em] uppercase muted">LAT · 14ms</div>
      <div className="absolute bottom-0 right-0 f-mono text-[9.5px] tracking-[.24em] uppercase muted">CYCLES · 1,847</div>
    </div>
  );
}

/* ─────────── SCENE 2 — About / Ingest ─────────── */
function SceneIngest(){
  return (
    <section className="scene relative px-7 lg:px-12">
      <div className="max-w-[1480px] mx-auto">
        <Reveal>
          <div className="eyebrow mb-8">
            <span className="bar"></span>
            <span>Scene 02 · About this app</span>
          </div>
        </Reveal>

        <div className="grid lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-7">
            <h2 className="huge text-[7vw] lg:text-[88px] mb-8">
              <SplitWords text="Kaizer News is"/><br/>
              <span className="outline-text"><SplitWords text="an AI video" base={200}/></span><br/>
              <SplitWords text="automation engine." base={400}/>
            </h2>
            <Reveal delay={300}>
              <p className="text-[17px] leading-relaxed text-[color:var(--chrome)] max-w-[640px]">
                It turns long-form recordings into multiple vertical clips and publishes them to creators' YouTube channels — using the <span style={{color:'var(--cyan)'}}>YouTube Data API v3</span> with the creator's <span style={{color:'var(--cyan)'}}>explicit consent</span>. Connect once. Choose what ships. Revoke anytime. The keys live with you.
              </p>
            </Reveal>
          </div>

          <div className="lg:col-span-5">
            <Reveal delay={150}>
              <div className="panel p-8">
                <div className="f-mono text-[10px] tracking-[.28em] uppercase muted mb-6">// kaizer.io / about</div>
                <div className="space-y-4 f-mono text-[12.5px]">
                  {[
                    ['platform','AI video automation'],
                    ['api','YouTube Data API v3'],
                    ['auth','Google OAuth 2.0'],
                    ['policy','Limited Use compliant'],
                    ['scope.1','/auth/youtube.upload'],
                    ['scope.2','/auth/youtube.readonly'],
                    ['scope.3','/auth/youtube'],
                  ].map((row,k)=>(
                    <div key={k} className="flex justify-between gap-4 pb-3 border-b border-[color:var(--line)]">
                      <span className="muted">{row[0]}</span>
                      <span style={{color:'var(--chrome)'}}>{row[1]}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 f-mono text-[10px] tracking-[.24em] uppercase" style={{color:'var(--cyan)'}}>● VERIFIED</div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────── SCENE 3 — Pipeline as Exhibition ─────────── */
function ScenePipeline(){
  const stages = [
    { n:"01", t:"INGEST",   tc:"T+00s", sub:"You drop the source.",  body:"Long video, podcast cut, raw recording — any format. Up to four hours, up to 4K." },
    { n:"02", t:"ANALYZE",  tc:"T+09s", sub:"We find the moments.",  body:"Transcription. Topic segmentation. Hook scoring. The lines worth sharing get marked automatically." },
    { n:"03", t:"CUT",      tc:"T+14s", sub:"We render the clips.",  body:"9:16 reframe, captions in your language, your fonts, your colors. Channel-specific logo burn-in." },
    { n:"04", t:"PUBLISH",  tc:"T+24s", sub:"We ship to YouTube.",   body:"Titles, tags, descriptions, thumbnails — Gemini drafted them. You approve once, or set autopilot." },
  ];

  return (
    <section id="pipeline" className="scene relative px-7 lg:px-12">
      <div className="max-w-[1480px] mx-auto">
        <Reveal>
          <div className="eyebrow mb-8">
            <span className="bar"></span>
            <span>Scene 03 · The Pipeline · Exhibition Floor</span>
          </div>
        </Reveal>

        <Reveal>
          <div className="flex items-end justify-between gap-8 flex-wrap mb-16">
            <h2 className="huge text-[7vw] lg:text-[112px]">
              <SplitWords text="FOUR ROOMS."/><br/>
              <span className="f-serif" style={{fontWeight:400, color:'var(--chrome-dim)', letterSpacing:'-0.02em'}}><SplitWords text="zero clicks." base={300}/></span>
            </h2>
            <p className="max-w-md text-[15px] muted leading-relaxed">
              Each stage is an exhibition piece. Watch the source enter, the moments surface, the cuts render, the clips ship. Hover any room to walk through it.
            </p>
          </div>
        </Reveal>

        <PipelineExhibition/>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
          {stages.map((s,i)=>(
            <Reveal key={s.n} delay={i*100}>
              <PipeStage {...s}/>
            </Reveal>
          ))}
        </div>

        <Reveal delay={400}>
          <div className="mt-16 grid lg:grid-cols-2 gap-6">
            <div className="grid grid-cols-2 gap-px bg-[color:var(--line-2)] border border-[color:var(--line-2)] rounded-2xl overflow-hidden">
              {[
                {l:"Clips · last 24h",v:"1,847"},
                {l:"Channels in flight",v:"63"},
                {l:"Avg cost / clip",v:"$0.09"},
                {l:"Pipeline failures",v:"0"},
              ].map((s,k)=>(
                <div key={k} className="bg-[color:var(--char)] p-6">
                  <div className="f-mono text-[9.5px] tracking-[.28em] uppercase muted mb-3">{s.l}</div>
                  <div className="stat-num digit" style={{fontSize:'52px'}}>{s.v}</div>
                </div>
              ))}
            </div>
            <LiveTerminal/>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PipeStage({n,t,tc,sub,body}){
  const ref = useTilt(4);
  return (
    <div ref={ref} className="stage tilt3d">
      <div className="flex items-center justify-between mb-7">
        <span className="num">{n}</span>
        <span className="f-mono text-[10px] tracking-[.24em] uppercase muted">{tc}</span>
      </div>
      <h3 className="huge text-[44px] mb-2" style={{lineHeight:.95}}>{t}</h3>
      <p className="f-serif text-[20px] text-[color:var(--chrome)] mb-5" style={{fontWeight:400}}>{sub}</p>
      <p className="text-[13.5px] leading-relaxed muted">{body}</p>
    </div>
  );
}

/* ─────────── Pipeline Exhibition (animated SVG) ─────────── */
function PipelineExhibition(){
  const ref = useRef(null);
  const [tokens, setTokens] = useState([]);
  const [bursts, setBursts] = useState([]);
  const [flash, setFlash] = useState({});
  const idRef = useRef(0);
  const tickerRef = useRef(0);

  const STAGES = [
    {x:120, y:170, label:"INGEST",   sub:"4K source",      glyph:"⬇"},
    {x:430, y:170, label:"ANALYZE",  sub:"hook · 0.94",    glyph:"◉"},
    {x:740, y:170, label:"CUT",      sub:"9:16 · burn-in", glyph:"◐"},
    {x:1050,y:170, label:"PUBLISH",  sub:"youtube · live", glyph:"↗"},
  ];

  useEffect(()=>{
    let raf=0, last=performance.now(), spawnAt=0, active=false;
    const io = new IntersectionObserver(([e])=>{ active=e.isIntersecting; },{threshold:.2});
    if(ref.current) io.observe(ref.current);
    const tick = (now)=>{
      const dt = now - last; last = now;
      if(active){
        spawnAt -= dt;
        if(spawnAt<=0){
          spawnAt = 1100 + Math.random()*500;
          idRef.current++;
          setTokens(p=>[...p,{id:idRef.current, born:now}]);
        }
        setTokens(p=>{
          const next=[];
          for(const tok of p){
            const dur = 4600;
            const t = (now - tok.born)/dur;
            if(t>=1){
              setBursts(b=>[...b,{id:++idRef.current, x:STAGES[3].x, y:STAGES[3].y, born:now}]);
              setFlash(f=>({...f, 3:now}));
              continue;
            }
            const seg = Math.min(3, Math.floor(t*3));
            const segT = (t*3) - seg;
            if(segT < 0.05) setFlash(f=>({...f, [seg+1]:now}));
            next.push({...tok, t});
          }
          return next;
        });
        setBursts(p=>p.filter(b=> now - b.born < 1400));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=>{ cancelAnimationFrame(raf); io.disconnect(); };
  },[]);

  const cubic = (a,b)=>{
    const my = a.y + (Math.random() > 0.5 ? -50 : 50);
    return `C ${a.x+150} ${a.y-50}, ${b.x-150} ${b.y+50}, ${b.x} ${b.y}`;
  };
  const interp = (i, t)=>{
    const a=STAGES[i], b=STAGES[i+1];
    const my = a.y + (i%2===0 ? -55 : 55);
    const p0=[a.x+50,a.y], p1=[a.x+160,my], p2=[b.x-160,my], p3=[b.x-50,b.y];
    const u=1-t;
    return {
      x: u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
      y: u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1],
    };
  };
  const pos = (t)=>{
    if(t<1/3) return interp(0, t*3);
    if(t<2/3) return interp(1, (t-1/3)*3);
    return interp(2, (t-2/3)*3);
  };

  return (
    <div ref={ref} className="relative border border-[color:var(--line-2)] rounded-2xl bg-[color:var(--char)] overflow-hidden">
      <div className="absolute top-4 left-5 f-mono text-[10px] tracking-[.24em] uppercase muted z-10">// exhibition.live · tokens: {tokens.length}</div>
      <div className="absolute top-4 right-5 f-mono text-[10px] tracking-[.24em] uppercase z-10" style={{color:'var(--cyan)'}}>● RECORDING · 24FPS</div>

      <svg viewBox="0 0 1170 340" className="w-full h-auto block" style={{minHeight:280}}>
        <defs>
          <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,.06)"/>
          </pattern>
          <filter id="glow"><feGaussianBlur stdDeviation="3"/></filter>
          <linearGradient id="pathgrad" x1="0%" x2="100%">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.05"/>
            <stop offset="50%" stopColor="var(--cyan)" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0.05"/>
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#dotgrid)"/>

        {/* Paths */}
        {[0,1,2].map(i=>{
          const a=STAGES[i],b=STAGES[i+1];
          const my = a.y + (i%2===0 ? -55 : 55);
          const d = `M ${a.x+50} ${a.y} C ${a.x+160} ${my}, ${b.x-160} ${my}, ${b.x-50} ${b.y}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="4 6"/>
              <path d={d} fill="none" stroke="url(#pathgrad)" strokeWidth="2">
                <animate attributeName="stroke-dasharray" from="0 100" to="100 0" dur="2.4s" repeatCount="indefinite"/>
              </path>
            </g>
          );
        })}

        {/* Stages */}
        {STAGES.map((s,i)=>{
          const flashing = flash[i] && (performance.now() - flash[i] < 400);
          return (
            <g key={s.label} transform={`translate(${s.x-58}, ${s.y-58})`}>
              <rect width="116" height="116" rx="14"
                fill={flashing ? 'rgba(0,224,255,.15)' : 'rgba(255,255,255,.02)'}
                stroke={flashing ? 'var(--cyan)' : 'var(--line-2)'} strokeWidth={flashing?2:1}
                style={{transition:'all .3s'}}/>
              <text x="14" y="22" fontFamily="JetBrains Mono" fontSize="9.5" fill="var(--chrome-faint)" letterSpacing="2">{String(i+1).padStart(2,"0")}</text>
              <text x="58" y="58" fontFamily="Clash Display" fontWeight="600" fontSize="40" textAnchor="middle" fill={flashing?'var(--cyan)':'var(--chrome)'} style={{transition:'fill .3s'}}>{s.glyph}</text>
              <text x="58" y="82" fontFamily="Clash Display" fontWeight="600" fontSize="13" letterSpacing="2" textAnchor="middle" fill="var(--chrome)">{s.label}</text>
              <text x="58" y="100" fontFamily="JetBrains Mono" fontSize="8.5" textAnchor="middle" fill="var(--chrome-faint)" letterSpacing="1.5">{s.sub}</text>
            </g>
          );
        })}

        {/* Tokens */}
        {tokens.map(tok=>{
          const p = pos(tok.t);
          return (
            <g key={tok.id} filter="url(#glow)">
              <circle cx={p.x} cy={p.y} r="9" fill="rgba(0,224,255,.3)"/>
              <circle cx={p.x} cy={p.y} r="4" fill="var(--cyan)"/>
              <circle cx={p.x} cy={p.y} r="1.5" fill="#fff"/>
            </g>
          );
        })}
        {bursts.map(b=>{
          const age = (performance.now() - b.born)/1400;
          return <circle key={b.id} cx={b.x} cy={b.y} r={6 + age*40} fill="none" stroke="var(--cyan)" strokeWidth="1.5" opacity={1-age}/>;
        })}
      </svg>

      {/* Bottom timecode rail */}
      <div className="px-5 pb-4 flex items-center justify-between f-mono text-[10px] tracking-[.22em] uppercase muted">
        <span>T+00s</span><span>T+09s</span><span>T+14s</span><span>T+24s · ▶ LIVE</span>
      </div>
    </div>
  );
}

/* ─────────── Live terminal ─────────── */
const TICKER_EVENTS = [
  {tag:"info", text:"Source accepted · interview_S03E14.mp4 · 4K · 58:21"},
  {tag:"ok",   text:"Transcript locked · 12,847 words · 31 langs available"},
  {tag:"ok",   text:"Hook scoring complete · 11 candidates · top 0.94"},
  {tag:"cyan", text:"Reframing 9:16 · subject tracking · ROI = face+text"},
  {tag:"info", text:"Captions burned · font 'Slate Bold' · ch: AutoWala"},
  {tag:"ok",   text:"Brand pack applied · logo 0:00 · LUT Kaizer-warm"},
  {tag:"info", text:"Title drafted · 'It doubled the channel'"},
  {tag:"warn", text:"Thumbnail v1 below contrast threshold · regen"},
  {tag:"ok",   text:"Thumbnail v2 approved · WCAG-AA · 1280×720"},
  {tag:"send", text:"PUT youtube.googleapis.com/upload/youtube/v3/videos"},
  {tag:"ok",   text:"Published · youtube.com/shorts/dQw4w9 · 0:14"},
  {tag:"cyan", text:"Pipeline idle · 3m 12s · $0.09 · 0 failures"},
];
function LiveTerminal(){
  const [lines, setLines] = useState([]);
  const ref = useRef(null);
  const i = useRef(0), id = useRef(0);
  useEffect(()=>{
    let intv=0, active=false;
    const io = new IntersectionObserver(([e])=>{ active=e.isIntersecting; },{threshold:.3});
    if(ref.current) io.observe(ref.current);
    const push=()=>{
      if(!active) return;
      const ev = TICKER_EVENTS[i.current % TICKER_EVENTS.length];
      const now = new Date();
      const tc = `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.${String(Math.floor(now.getMilliseconds()/10)).padStart(2,'0')}`;
      setLines(p=>[...p, {...ev, id:++id.current, tc}].slice(-7));
      i.current++;
    };
    setTimeout(()=>{ active=true; for(let k=0;k<4;k++)push(); intv = setInterval(push, 1800); }, 250);
    return ()=>{ clearInterval(intv); io.disconnect(); };
  },[]);
  const labels = {info:'INFO',ok:' OK ',warn:'WARN',send:'SEND',cyan:'CYAN'};
  return (
    <div ref={ref} className="term">
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[color:var(--line)] f-mono text-[10px] tracking-[.24em] uppercase muted">
        <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:'var(--cyan)',boxShadow:'0 0 6px var(--cyan)'}}></span>
        <span style={{flex:1}}>kaizer-pipeline · live tail</span>
        <span style={{color:'var(--cyan)'}}>● ONLINE</span>
      </div>
      {lines.map(l=>(
        <div key={l.id} className="term-line">
          <span className="term-tc">[{l.tc}]</span>
          <span className={`term-tag ${l.tag}`}>{labels[l.tag]}</span>
          <span className="term-msg">{l.text}</span>
        </div>
      ))}
      <div className="term-line">
        <span className="term-tc">[{new Date().toTimeString().slice(3,8)}]</span>
        <span className="term-tag info">INFO</span>
        <span className="term-msg term-cursor">awaiting next event</span>
      </div>
    </div>
  );
}

/* ─────────── SCENE 4 — Drag demo ─────────── */
function SceneDrag(){
  const wrapRef = useRef(null);
  const [pos, setPos] = useState(0.45);
  const drag = useRef(false);
  useEffect(()=>{
    const onMove = (e)=>{
      if(!drag.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      setPos(Math.max(0.04, Math.min(0.96, x/r.width)));
    };
    const onUp = ()=>{ drag.current = false; document.body.style.userSelect=''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, {passive:true});
    window.addEventListener('touchend', onUp);
    return ()=>{
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  },[]);
  const start = ()=>{ drag.current = true; document.body.style.userSelect='none'; };

  const captions = ["It doubled\nthe channel","Don't post.\nShip.","The 7-day\nrule","Why I stopped\nediting","Hook in 0.6s","Algorithm,\nplease","Three takes,\none truth","Stop scrolling"];
  const channels = ["AUTOWALA","DAILYFIX","TECHSPK","SHORTS","REELS","CHN-05","CHN-06","CHN-07"];

  return (
    <section className="scene relative px-7 lg:px-12">
      <div className="max-w-[1480px] mx-auto">
        <Reveal>
          <div className="eyebrow mb-8">
            <span className="bar"></span>
            <span>Scene 04 · The Compositor</span>
          </div>
        </Reveal>

        <Reveal>
          <div className="flex items-end justify-between gap-8 flex-wrap mb-14">
            <h2 className="huge text-[7vw] lg:text-[112px]">
              <SplitWords text="DRAG TO"/><br/>
              <span className="outline-text"><SplitWords text="SPLIT THE" base={200}/></span><br/>
              <span style={{color:'var(--cyan)'}}><SplitWords text="HOUR." base={400}/></span>
            </h2>
            <p className="max-w-md text-[15px] muted leading-relaxed">
              One sixty-minute recording. Eight vertical shorts. Pull the handle and watch the AI carve the timeline in real time — each clip captioned, branded, ready to ship.
            </p>
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div ref={wrapRef} className="drag-wrap" style={{height:420}}>
            {/* LEFT — Source */}
            <div className="absolute inset-0" style={{clipPath:`inset(0 ${(1-pos)*100}% 0 0)`}}>
              <div className="absolute inset-0" style={{background:'linear-gradient(180deg, #0A0A0C, #050505)'}}></div>
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[180px] flex items-center px-12 border-y border-[color:var(--line)]" style={{background:'linear-gradient(180deg, rgba(0,224,255,.04), transparent)'}}>
                {/* waveform */}
                <svg className="w-full h-full" viewBox="0 0 1000 180" preserveAspectRatio="none">
                  {Array.from({length:240}).map((_,i)=>{
                    const x = i*4.2;
                    const h = 22 + Math.abs(Math.sin(i*0.42)*40) + Math.abs(Math.sin(i*0.15)*30);
                    return <rect key={i} x={x} y={90-h/2} width="2" height={h} fill="rgba(0,224,255,.4)"/>;
                  })}
                  {/* 8 markers */}
                  {[0.07,0.16,0.27,0.38,0.51,0.64,0.77,0.90].map((p,i)=>(
                    <g key={i}>
                      <line x1={p*1000} y1="0" x2={p*1000} y2="180" stroke="var(--cyan)" strokeWidth="1" strokeDasharray="2 3" opacity=".6"/>
                      <circle cx={p*1000} cy="90" r="5" fill="var(--cyan)" filter="url(#glow)"/>
                    </g>
                  ))}
                </svg>
              </div>
              <div className="absolute top-4 left-6 chip chip-live"><span className="dot"></span>SOURCE · 01:00:00</div>
              <div className="absolute bottom-4 left-6 f-mono text-[10px] tracking-[.22em] uppercase muted">interview_raw.mp4 · 4K · 12.4 GB</div>
              <div className="absolute bottom-4 right-1/3 f-mono text-[10px] tracking-[.22em] uppercase" style={{color:'var(--cyan)'}}>8 hooks detected</div>
              <div className="absolute top-4 right-1/3 f-mono text-[10px] tracking-[.22em] uppercase muted">BEFORE</div>
            </div>

            {/* RIGHT — 8 shorts */}
            <div className="absolute inset-0" style={{clipPath:`inset(0 0 0 ${pos*100}%)`}}>
              <div className="absolute inset-0" style={{background:'#08080A'}}></div>
              <div className="absolute inset-0 grid grid-cols-8 gap-2 p-6">
                {captions.map((cap,i)=>{
                  const center = (i+0.5)/8;
                  const hidden = pos < center - 0.01;
                  return (
                    <div key={i} className={`short ${hidden?'hidden':''}`} style={{'--delay':`${i*40}ms`,alignSelf:'center'}}>
                      <div className="frame-no">F.{String((i+1)*137).padStart(4,"0")}</div>
                      <div style={{position:'absolute',inset:0,background:`radial-gradient(60% 40% at 50% 30%, rgba(0,224,255,${0.2+i*0.04}), transparent 70%)`}}></div>
                      <div className="cap-txt"><span>{cap}</span></div>
                      <div className="channel">{channels[i]}</div>
                    </div>
                  );
                })}
              </div>
              <div className="absolute top-4 right-6 chip" style={{color:'var(--cyan)',borderColor:'rgba(0,224,255,.4)'}}>AFTER · 8 SHORTS</div>
            </div>

            {/* Divider */}
            <div className="drag-handle" style={{left:`${pos*100}%`}} onMouseDown={start} onTouchStart={start} data-cursor="DRAG">
              <span className="drag-knob">⇆</span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={350}>
          <div className="mt-6 flex justify-between flex-wrap gap-3 f-mono text-[10px] tracking-[.24em] uppercase muted">
            <span>// position: {Math.round(pos*100)}% · shorts shipped: {Math.max(0, Math.min(8, Math.ceil(pos*8)))} of 8</span>
            <span>render time avg · 3m 12s per clip</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ─────────── SCENE 5 — Tunnel ─────────── */
function SceneTunnel(){
  const ref = useRef(null);
  const [s, setS] = useState(0);
  useEffect(()=>{
    const onScroll = ()=>{
      const el = ref.current; if(!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 at top entering, 1 at exit
      const total = r.height + vh;
      const traveled = vh - r.top;
      setS(Math.max(0, Math.min(1, traveled / total)));
    };
    window.addEventListener('scroll', onScroll, {passive:true});
    onScroll();
    return ()=>window.removeEventListener('scroll', onScroll);
  },[]);

  // Map progress to typography size and chromatic ab
  const scale = 0.6 + s*1.4; // 0.6 -> 2.0
  const ab = Math.abs(s - 0.5) * 18;
  const blur = (1 - Math.abs(s-0.5)*2) * 0;
  const tx = (0.5 - s) * 80;

  return (
    <section ref={ref} className="tunnel scene relative px-7 lg:px-12 overflow-hidden">
      <div className="leak"></div>
      {/* Star particles */}
      {Array.from({length:60}).map((_,i)=>(
        <span key={i} className="particle" style={{
          left:`${Math.random()*100}%`, top:`${Math.random()*100}%`,
          animationDelay:`${Math.random()*3}s`,
        }}/>
      ))}
      <div className="max-w-[1480px] mx-auto relative z-10">
        <Reveal>
          <div className="eyebrow mb-8">
            <span className="bar"></span>
            <span>Scene 05 · Intertitle · The Tunnel</span>
          </div>
        </Reveal>

        <div className="relative min-h-[60vh] flex items-center justify-center">
          <div style={{
            transform:`scale(${scale}) translateX(${tx}px)`,
            textShadow:`${-ab}px 0 0 rgba(0,224,255,.5), ${ab}px 0 0 rgba(255,80,140,.4)`,
            transition:'transform .15s ease-out',
            textAlign:'center',
          }} className="tunnel-words">
            <div className="huge text-[10vw] lg:text-[160px]">
              We didn't<br/>
              <span className="outline-text">replace</span><br/>
              the editor.
            </div>
          </div>
        </div>

        <div className="relative min-h-[40vh] flex items-end justify-center pb-12">
          <div className="text-center">
            <div className="huge text-[8vw] lg:text-[120px]" style={{lineHeight:0.9}}>
              We replaced<br/>
              <span style={{color:'var(--cyan)'}}>the waiting.</span>
            </div>
            <div className="mt-8 f-mono text-[10.5px] tracking-[.32em] uppercase muted">— Kaizer News, founding note · Apr 2026</div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────── SCENE 6 — Universe (stats + trust + scopes) ─────────── */
function SceneCore(){
  const stats = [
    {target:10, suffix:"×", label:"Faster than manual"},
    {target:30, suffix:"+", label:"Languages"},
    {target:3,  suffix:"m", label:"Avg render / clip"},
    {target:99.97, suffix:"%", label:"Pipeline uptime", decimals:2},
  ];
  return (
    <section id="core" className="scene relative px-7 lg:px-12">
      <div className="max-w-[1480px] mx-auto">
        <Reveal>
          <div className="eyebrow mb-8">
            <span className="bar"></span>
            <span>Scene 06 · The Core · By the numbers</span>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="huge text-[8vw] lg:text-[140px] mb-16">
            <SplitWords text="THE HOURS"/><br/>
            <span className="f-serif" style={{fontWeight:400,color:'var(--chrome-dim)',letterSpacing:'-0.02em'}}><SplitWords text="come back" base={200}/></span><br/>
            <span style={{color:'var(--cyan)'}}><SplitWords text="to you." base={400}/></span>
          </h2>
        </Reveal>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-12 mb-24">
          {stats.map((s,i)=>(
            <Reveal key={s.label} delay={i*120}>
              <CoreStat {...s}/>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
function CoreStat({target, suffix, label, decimals=0}){
  const [v, ref] = useCounter(target);
  const d = decimals ? v.toFixed(decimals) : Math.round(v);
  return (
    <div ref={ref}>
      <div className="stat-num digit">{d}<span style={{color:'var(--cyan)'}}>{suffix}</span></div>
      <div className="mt-3 cyan-line" style={{width:'72%'}}></div>
      <div className="mt-3 f-mono text-[10px] tracking-[.26em] uppercase muted">{label}</div>
    </div>
  );
}

/* ─────────── SCENE 7 — Scopes / Trust ─────────── */
function SceneScopes(){
  const scopes = [
    {s:"youtube.upload",   w:"To upload your clips.",      d:"We push the final rendered MP4 plus title, description, tags, and thumbnail to the channel you connected."},
    {s:"youtube.readonly", w:"To read your channel name.", d:"Only to display 'connected: My Channel' inside the app and fetch the channel avatar for the dashboard."},
    {s:"youtube",          w:"To set thumbnails & titles.",d:"Required by YouTube's API to attach a custom thumbnail or edit a clip's title — only on uploads we created."},
  ];
  const dont = [
    "Sell or share your YouTube data with anyone.",
    "Use your videos to train any AI model.",
    "Read your comments, viewers, or analytics.",
    "Touch channels you haven't explicitly connected.",
    "Retain raw source video beyond rendering.",
    "Make any change without your prompt.",
  ];
  return (
    <section id="scopes" className="scene relative px-7 lg:px-12">
      <div className="max-w-[1480px] mx-auto">
        <Reveal>
          <div className="eyebrow mb-8">
            <span className="bar"></span>
            <span>Scene 07 · Continuity · We only ask for what we need</span>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="huge text-[7vw] lg:text-[96px] mb-8 max-w-5xl">
            <SplitWords text="Your channel,"/><br/>
            <span className="outline-text"><SplitWords text="your keys." base={250}/></span>
          </h2>
        </Reveal>

        <Reveal delay={150}>
          <p className="max-w-3xl text-[15.5px] leading-relaxed muted mb-14">
            Kaizer News's use and transfer of information received from Google APIs adheres to the{' '}
            <a className="glow-link" style={{color:'var(--cyan)'}} href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" data-cursor="OPEN">Google API Services User Data Policy</a>, including Limited Use. We ask for three scopes — only three — and tell you exactly what each one unlocks.
          </p>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {scopes.map((sc,i)=>(
            <Reveal key={sc.s} delay={i*120}>
              <ScopeCard sc={sc} i={i}/>
            </Reveal>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Reveal delay={150}>
            <div className="panel p-9">
              <div className="chip mb-6"><span style={{color:'var(--cyan)'}}>◆</span>What we don't do</div>
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
                {dont.map((d,k)=>(
                  <li key={k} className="flex gap-3 text-[13.5px] leading-relaxed text-[color:var(--chrome)]">
                    <span style={{color:'var(--cyan)',marginTop:2}}>—</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={300}>
            <div className="panel p-9 flex flex-col" style={{background:'linear-gradient(135deg, rgba(0,224,255,.08), rgba(255,255,255,.02))'}}>
              <div className="chip chip-live mb-4"><span className="dot"></span>Revoke anytime</div>
              <h3 className="huge text-[44px] mb-4">Authorization<br/><span className="f-serif" style={{fontWeight:400,color:'var(--chrome-dim)'}}>lives with Google.</span></h3>
              <p className="text-[14px] muted leading-relaxed mb-7">
                Revoke in two clicks — the moment you do, we lose every byte of access to your account.
              </p>
              <Magnet><a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="cap" data-cursor="OPEN">myaccount.google.com/permissions ↗</a></Magnet>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
function ScopeCard({sc, i}){
  const ref = useTilt(5);
  return (
    <div ref={ref} className="panel tilt3d p-7 h-full">
      <div className="flex items-center justify-between mb-5">
        <span className="f-mono text-[10px] tracking-[.28em] uppercase muted">Scope {String(i+1).padStart(2,"0")}</span>
        <span style={{color:'var(--cyan)'}}>◆</span>
      </div>
      <div className="f-mono text-[11.5px] mb-5 p-3 rounded-md" style={{background:'rgba(0,224,255,.05)',border:'1px solid rgba(0,224,255,.2)',color:'var(--cyan)'}}>
        /auth/{sc.s}
      </div>
      <div className="huge text-[26px] mb-3" style={{lineHeight:1}}>{sc.w}</div>
      <p className="text-[13.5px] leading-relaxed muted">{sc.d}</p>
    </div>
  );
}

/* ─────────── SCENE 8 — Pricing (call sheet) ─────────── */
function ScenePricing(){
  const tiers = [
    { name:"FREE",   price:"$0",     period:"",      role:"Trial run",
      features:["5 min source / month","Up to 10 clips / month","1 connected channel","Community support"],
      cta:"Begin", highlight:false },
    { name:"PRO",    price:"$29",    period:"/mo",   role:"Featured",
      features:["Unlimited source video","Unlimited clips","Up to 5 connected channels","Priority rendering queue","Per-channel branding & SEO","Email support"],
      cta:"Upgrade", highlight:true },
    { name:"STUDIO", price:"Custom", period:"",      role:"Lead role",
      features:["Everything in Pro","Unlimited connected channels","Dedicated GPU pipeline","Custom layouts & templates","SAML SSO + Audit logs","Priority support, 4h SLA"],
      cta:"Contact us", highlight:false },
  ];
  return (
    <section id="pricing" className="scene relative px-7 lg:px-12">
      <div className="max-w-[1480px] mx-auto">
        <Reveal>
          <div className="eyebrow mb-8">
            <span className="bar"></span>
            <span>Scene 08 · The Call Sheet · Three roles</span>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="huge text-[8vw] lg:text-[140px] mb-16">
            <SplitWords text="PICK"/>{' '}
            <span className="outline-text"><SplitWords text="YOUR" base={150}/></span><br/>
            <span style={{color:'var(--cyan)'}}><SplitWords text="ROLE." base={300}/></span>
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-3 gap-6">
          {tiers.map((t,i)=>(
            <Reveal key={t.name} delay={i*120}>
              <PriceCard tier={t}/>
            </Reveal>
          ))}
        </div>

        <Reveal delay={400}>
          <p className="mt-12 f-mono text-[10px] tracking-[.24em] uppercase muted text-center">
            All plans · OAuth-secured · per-channel branding · unlimited revocation · cancel any time
          </p>
        </Reveal>
      </div>
    </section>
  );
}
function PriceCard({tier}){
  const ref = useTilt(4);
  const cls = `panel tilt3d p-9 h-full flex flex-col ${tier.highlight?'border-[color:var(--cyan)]':''}`;
  const style = tier.highlight ? {borderColor:'var(--cyan)', background:'linear-gradient(180deg, rgba(0,224,255,.05), rgba(255,255,255,.01))'} : {};
  return (
    <div ref={ref} className={cls} style={style}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="huge text-[40px]">{tier.name}</h3>
        {tier.highlight && <span className="chip chip-live"><span className="dot"></span>Featured</span>}
      </div>
      <div className="f-serif text-[16px] muted mb-6" style={{fontWeight:400}}>— {tier.role}</div>
      <div className="flex items-baseline gap-2 mb-7">
        <span className="huge text-[64px]" style={{color: tier.highlight?'var(--cyan)':'var(--chrome)'}}>{tier.price}</span>
        {tier.period && <span className="text-[14px] muted">{tier.period}</span>}
      </div>
      <div className="cyan-line mb-6" style={{opacity: tier.highlight?1:0.3}}></div>
      <ul className="flex flex-col gap-3 mb-8">
        {tier.features.map((f,i)=>(
          <li key={i} className="flex gap-3 text-[13.5px] text-[color:var(--chrome)]"><span style={{color:'var(--cyan)'}}>+</span><span>{f}</span></li>
        ))}
      </ul>
      <Magnet><a href={tier.cta && /talk|contact|sales/i.test(tier.cta) ? "mailto:sales@kaizerx.com" : "/register"} className={`cap ${tier.highlight?'':'ghost'} mt-auto`} data-cursor={tier.cta.toUpperCase()}>▸ {tier.cta}</a></Magnet>
    </div>
  );
}

/* ─────────── SCENE 9 — Notes / FAQ ─────────── */
function SceneNotes(){
  const qs = [
    {q:"How does Kaizer News access my YouTube channel?",       a:"Through Google's standard OAuth 2.0 consent flow. You click 'Connect YouTube' inside the app, Google shows you exactly which scopes we request, and you approve (or deny). We never see your password. Authorization is held by Google — you can revoke it at any time from myaccount.google.com/permissions."},
    {q:"What does Kaizer News do with my data?",                a:"We use it strictly to provide the service: read your channel name to label connections, render your source video into clips, and upload those clips with the metadata you approve. We do not sell or share data with third parties, and we do not use your videos to train AI models. This adheres to the Google API Services User Data Policy, including Limited Use."},
    {q:"Which YouTube API scopes does the app request?",        a:"Exactly three: youtube.upload (to publish clips), youtube.readonly (to display your channel name), and youtube (required by YouTube's API to attach custom thumbnails or edit metadata on uploads we created)."},
    {q:"Can I review every clip before it goes live?",          a:"Yes. By default every clip waits for your approval before publishing. You can also enable per-channel autopilot once you trust a brand's output."},
    {q:"Where is my source video stored?",                      a:"On encrypted cloud storage during rendering only. Source files are deleted within 72 hours of the final clip being approved. Rendered clips persist on YouTube under your account, not ours."},
    {q:"How do I cancel?",                                      a:"From the app's billing page or by revoking OAuth at myaccount.google.com/permissions. Cancellation is immediate; no questions asked."},
  ];
  const [open, setOpen] = useState(0);
  return (
    <section className="scene relative px-7 lg:px-12">
      <div className="max-w-[1100px] mx-auto">
        <Reveal>
          <div className="eyebrow mb-8">
            <span className="bar"></span>
            <span>Scene 09 · Director's notes</span>
          </div>
        </Reveal>
        <Reveal>
          <h2 className="huge text-[7vw] lg:text-[88px] mb-16">
            <SplitWords text="QUESTIONS,"/><br/>
            <span className="outline-text"><SplitWords text="answered." base={200}/></span>
          </h2>
        </Reveal>
        <div>
          {qs.map((it,i)=>(
            <Reveal key={i} delay={i*50}>
              <div className={`q-row ${open===i?'open':''}`}>
                <div className="q-head" onClick={()=>setOpen(open===i?-1:i)} data-cursor={open===i?"CLOSE":"OPEN"}>
                  <div className="flex items-baseline gap-6 flex-1">
                    <span className="f-mono text-[10px] tracking-[.28em] uppercase muted shrink-0">Q{String(i+1).padStart(2,"0")}</span>
                    <span className="huge text-[20px] md:text-[26px]" style={{lineHeight:1.15}}>{it.q}</span>
                  </div>
                  <span className="q-toggle">+</span>
                </div>
                <div className="q-body">
                  <div className="pl-[78px] pr-10 text-[14.5px] leading-relaxed muted max-w-3xl">{it.a}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────── SCENE 10 — Wrap / End ─────────── */
function SceneEnd(){
  return (
    <section id="enter" className="scene relative px-7 lg:px-12 overflow-hidden">
      <div className="fog" style={{width:600,height:600,top:'10%',right:'-10%'}}></div>
      <div className="leak"></div>
      <div className="max-w-[1480px] mx-auto relative">
        <Reveal>
          <div className="eyebrow mb-8">
            <span className="bar"></span>
            <span>Scene 10 · That's a wrap</span>
            <span className="chip chip-live"><span className="dot"></span>Free plan available</span>
          </div>
        </Reveal>

        <Reveal>
          <h2 className="huge text-[14vw] lg:text-[14vw] xl:text-[260px] mb-12" style={{lineHeight:.86}}>
            <SplitWords text="START"/><br/>
            <span className="outline-text"><SplitWords text="MAKING" base={200}/></span><br/>
            <span style={{color:'var(--cyan)'}}><SplitWords text="SHORTS." base={400}/></span>
          </h2>
        </Reveal>

        <div className="grid md:grid-cols-2 gap-12 items-end mb-20">
          <Reveal delay={300}>
            <p className="text-[18px] leading-relaxed text-[color:var(--chrome)] max-w-md">
              Connect a channel. Upload a video. Watch it become a week of vertical shorts — already on YouTube before your coffee's cold.
            </p>
          </Reveal>
          <Reveal delay={450}>
            <div className="flex flex-wrap gap-4 md:justify-end items-center">
              <Magnet strength={0.5}><a href="/register" className="cap" data-cursor="ENTER">▸ Enter — it's free</a></Magnet>
              <Magnet strength={0.3}><a href="/login" className="cap ghost" data-cursor="SIGN IN">Sign in ↗</a></Magnet>
            </div>
          </Reveal>
        </div>

        {/* Credits row */}
        <Reveal delay={600}>
          <div className="grid md:grid-cols-4 gap-8 pt-12 border-t border-[color:var(--line)]">
            {[
              {h:"Direction", rows:[['Auth','OAuth 2.0'],['API','YouTube v3'],['Models','Gemini · Whisper']]},
              {h:"Post",      rows:[['Captions','30+ langs'],['Reframe','9:16 auto'],['Brand','Per-channel']]},
              {h:"Delivery",  rows:[['Format','Shorts'],['Schedule','Per-channel'],['Approval','You approve']]},
              {h:"Trust",     rows:[['Policy','Limited Use'],['Storage','Render only'],['Revoke','Two clicks']]},
            ].map(col=>(
              <div key={col.h}>
                <div className="f-mono text-[10px] tracking-[.28em] uppercase muted mb-4">{col.h}</div>
                <div className="flex flex-col gap-2">
                  {col.rows.map(r=>(
                    <div key={r[0]} className="flex justify-between gap-2 text-[12px]">
                      <span className="muted">{r[0]}</span>
                      <span>{r[1]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* Footer mega type */}
      <div className="mt-32 px-7 lg:px-12 max-w-[1480px] mx-auto">
        <div className="foot-mega">
          <span className="out">KAIZER</span><br/>
          <span style={{color:'var(--cyan)'}}>NEWS</span><span>.</span>
        </div>
        <div className="pt-10 mt-10 border-t border-[color:var(--line)] flex flex-wrap items-center justify-between gap-3 f-mono text-[10px] tracking-[.28em] uppercase muted">
          <span>© {new Date().getFullYear()} Kaizer News · All rights reserved</span>
          <span>Built for storytellers · v6 · Neo-Digital Museum</span>
          <span><a className="glow-link" href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms ↗</a></span>
        </div>
      </div>
    </section>
  );
}

/* ─────────── App ─────────── */

function LivingCursor({ isActive }) {
  if (!isActive) return null;
  return <LivingCursorInner />;
}

export default function KaizerV6App({ isActive }){
  return (
    <>
      <Atmosphere/>
      <LivingCursor isActive={isActive} />
      <Rail/>
      <HUD/>
      <TopNav/>
      <main style={{position:'relative', zIndex:5}}>
        <SceneArrival/>
        <SceneIngest/>
        <ScenePipeline/>
        <SceneDrag/>
        <SceneTunnel/>
        <SceneCore/>
        <SceneScopes/>
        <ScenePricing/>
        <SceneNotes/>
        <SceneEnd/>
      </main>
    </>
  );
}


