
import React, {  useState, useEffect, useRef, useMemo  } from 'react';

/* ===== Hooks ===== */
function useReveal(threshold=0.18){
  const ref = useRef(null);
  useEffect(()=>{
    const el = ref.current; if(!el) return;
    const io = new IntersectionObserver(([e])=>{ if(e.isIntersecting){el.classList.add('in');io.unobserve(el);} },{threshold});
    io.observe(el); return ()=>io.disconnect();
  },[threshold]);
  return ref;
}
function Reveal({children, delay=0, className="", as:Tag="div"}){
  const ref = useReveal();
  return <Tag ref={ref} className={`reveal ${className}`} style={{transitionDelay:`${delay}ms`}}>{children}</Tag>;
}
function useCounter(target, dur=1800, decimals=0){
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
  return [decimals ? v.toFixed(decimals) : Math.round(v), ref];
}

/* ===== Ink-nib cursor ===== */
function NibCursorInner(){
  const nib = useRef(null);
  const lbl = useRef(null);
  useEffect(()=>{
    if(window.matchMedia('(pointer:coarse)').matches) return;
    let mx=0,my=0,cx=0,cy=0,raf;
    const move = (e)=>{ mx=e.clientX; my=e.clientY; };
    window.addEventListener('mousemove', move, {passive:true});
    const onOver = (e)=>{
      const t = e.target.closest('[data-cursor],a,button,[role="button"],input,textarea,.tool-btn,.toc-row,.scope-card,.tier,.qa,.short,.drag-knob');
      nib.current?.classList.remove('hover','text-mode');
      lbl.current?.classList.remove('show');
      if(!t) return;
      if(t.matches('input,textarea,p,.body-text')){ nib.current?.classList.add('text-mode'); return; }
      nib.current?.classList.add('hover');
      const c = t.getAttribute('data-cursor');
      if(c){ lbl.current.textContent = c; lbl.current.classList.add('show'); }
      else if(t.tagName==='A' || t.tagName==='BUTTON'){ lbl.current.textContent = 'Read'; lbl.current.classList.add('show'); }
    };
    document.addEventListener('mouseover', onOver, {passive:true});
    const tick = ()=>{
      cx += (mx-cx)*0.32; cy += (my-cy)*0.32;
      if(nib.current){
        const w = nib.current.offsetWidth, h = nib.current.offsetHeight;
        nib.current.style.transform = `translate3d(${cx-w/2}px, ${cy-h/2}px, 0)`;
      }
      if(lbl.current){ lbl.current.style.transform = `translate3d(${cx+18}px, ${cy+18}px, 0)`; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=>{cancelAnimationFrame(raf); window.removeEventListener('mousemove', move); document.removeEventListener('mouseover', onOver);};
  },[]);
  return (
    <>
      <div ref={nib} className="nib" aria-hidden>
        <svg className="nib-icon" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 21l5.2-1.6 11-11-3.6-3.6-11 11L3 21zm14.6-15.6l1.8-1.8a1 1 0 0 1 1.4 0l2.2 2.2a1 1 0 0 1 0 1.4l-1.8 1.8-3.6-3.6z"/>
        </svg>
      </div>
      <div ref={lbl} className="nib-label" aria-hidden></div>
    </>
  );
}

/* ===== Reading bar ===== */
function ReadingBar(){
  const fill = useRef(null);
  useEffect(()=>{
    const f = ()=>{
      const h = document.documentElement;
      const p = h.scrollTop/Math.max(1,h.scrollHeight-h.clientHeight);
      if(fill.current) fill.current.style.width = `${(p*100).toFixed(2)}%`;
    };
    window.addEventListener('scroll', f, {passive:true});
    f();
    return ()=>window.removeEventListener('scroll', f);
  },[]);
  return <div className="reading-bar"><div className="fill" ref={fill}></div></div>;
}

/* ===== Page folio (Page IV of XII) ===== */
function Folio(){
  const [p, setP] = useState(0);
  useEffect(()=>{
    const onS = ()=>{
      const h = document.documentElement;
      setP(h.scrollTop/Math.max(1,h.scrollHeight-h.clientHeight));
    };
    window.addEventListener('scroll', onS, {passive:true});
    onS();
    return ()=>window.removeEventListener('scroll', onS);
  },[]);
  const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
  const total = 12;
  const cur = Math.min(total, Math.max(1, Math.ceil(p*total)));
  return (
    <div className="folio" aria-hidden>
      <span>page</span>
      <span className="pg">{roman[cur-1]}</span>
      <span className="of">of XII</span>
      <div className="bar-wrap"><div className="bar" style={{height:`${(p*100).toFixed(1)}%`}}></div></div>
      <span className="pct">{(p*100).toFixed(0)}%</span>
    </div>
  );
}

/* ===== Tools (highlighter) ===== */
function ReaderTools(){
  const [hl, setHl] = useState(false);
  useEffect(()=>{
    if(hl){ document.body.classList.add('hl-on'); }
    else { document.body.classList.remove('hl-on'); }
  },[hl]);
  useEffect(()=>{
    const onUp = ()=>{
      if(!hl) return;
      const sel = window.getSelection();
      if(!sel || sel.isCollapsed) return;
      const range = sel.getRangeAt(0);
      try{
        const span = document.createElement('span');
        span.className = 'hl-mark';
        range.surroundContents(span);
        sel.removeAllRanges();
      }catch(e){}
    };
    document.addEventListener('mouseup', onUp);
    return ()=>document.removeEventListener('mouseup', onUp);
  },[hl]);
  const clear = ()=>{
    document.querySelectorAll('.hl-mark').forEach(n=>{
      const p = n.parentNode;
      while(n.firstChild) p.insertBefore(n.firstChild, n);
      p.removeChild(n);
      p.normalize();
    });
  };
  const top = ()=>window.scrollTo({top:0,behavior:'smooth'});
  return (
    <div className="tools">
      <button className={`tool-btn ${hl?'active':''}`} onClick={()=>setHl(!hl)} data-cursor={hl?'Off':'Mark'} title="Highlighter">
        ✎
        <span className="tool-tip">Highlighter</span>
      </button>
      <button className="tool-btn" onClick={clear} data-cursor="Clear" title="Clear marks">
        ⌫
        <span className="tool-tip">Clear marks</span>
      </button>
      <button className="tool-btn" onClick={top} data-cursor="Top" title="Top of page">
        ↑
        <span className="tool-tip">To top</span>
      </button>
    </div>
  );
}

/* ===== Footnote helper ===== */
function FN({n, children}){
  return <sup className="fn" tabIndex="0">{n}<span className="fn-pop">{children}</span></sup>;
}

/* ===== Masthead ===== */
function Masthead(){
  const [time, setTime] = useState(()=>new Date());
  useEffect(()=>{ const t = setInterval(()=>setTime(new Date()), 1000); return ()=>clearInterval(t); },[]);
  const today = time.toLocaleDateString('en-US',{weekday:'long', year:'numeric', month:'long', day:'numeric'});
  return (
    <>
      <div className="masthead">
        <div className="side">
          <span><span className="dot"></span> Live edition</span>
          <span>· {today}</span>
        </div>
        <div className="masthead-center">Vol. I · No. 1 · Twelve pages</div>
        <div className="side right">
          <span>One free read</span>
          <span>·</span>
          <span>Edited from the cloud</span>
        </div>
      </div>

      <div className="banner">
        <div className="side-info">
          <div className="row"><span>Founded</span><span style={{color:'var(--ink)'}}>2026</span></div>
          <div className="row"><span>Pages</span><span style={{color:'var(--ink)'}}>XII</span></div>
          <div className="row"><span>Run-time</span><span style={{color:'var(--ink)'}}>8 min</span></div>
          <div className="row"><span>Print</span><span style={{color:'var(--ink)'}}>Press 14</span></div>
        </div>
        <div className="ttl" style={{textAlign:'center'}}>
          <em>The</em> Daily Kaizer
        </div>
        <div className="side-info" style={{textAlign:'right',alignItems:'flex-end'}}>
          <div className="row"><span>Edition</span><span style={{color:'var(--ink)'}}>Director's Cut</span></div>
          <div className="row"><span>Auth</span><span style={{color:'var(--ink)'}}>OAuth 2.0</span></div>
          <div className="row"><span>API</span><span style={{color:'var(--ink)'}}>YouTube v3</span></div>
          <div className="row"><span>Price</span><span style={{color:'var(--accent)'}}>FREE</span></div>
        </div>
      </div>

      <nav className="subnav">
        <div className="subnav-left">
          <a href="#cover" data-cursor="Jump">Cover</a>
          <a href="#sec-1" data-cursor="Jump">§I What it is</a>
          <a href="#sec-2" data-cursor="Jump">§II Pipeline</a>
          <a href="#sec-3" data-cursor="Jump">§III Compositor</a>
          <a href="#sec-4" data-cursor="Jump">§IV Figures</a>
          <a href="#sec-5" data-cursor="Jump">§V Trust</a>
          <a href="#sec-6" data-cursor="Jump">§VI Rates</a>
          <a href="#sec-7" data-cursor="Jump">§VII Q&amp;A</a>
        </div>
        <div className="subnav-right">
          <a href="/login" className="draw-uline" data-cursor="Enter">Sign in →</a>
        </div>
      </nav>

      <div className="ticker-strip">
        <div className="ticker-track">
          {[...Array(2)].map((_,k)=>(
            <React.Fragment key={k}>
              <span>Latest · Pipeline up 99.97% <span className="sep">●</span></span>
              <span>1,847 clips shipped in 24 hours <span className="sep">●</span></span>
              <span>OAuth 2.0 audited and approved <span className="sep">●</span></span>
              <span>63 channels in flight <span className="sep">●</span></span>
              <span>Avg cost per clip $0.09 <span className="sep">●</span></span>
              <span>YouTube Data API v3 <span className="sep">●</span></span>
              <span>Limited Use compliant <span className="sep">●</span></span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
}

/* ===== Section header ===== */
function SectionHead({num, ttl, meta, id}){
  return (
    <div id={id} className="section-head">
      <div className="num">§{num}</div>
      <h2 className="ttl"><em style={{fontStyle:'italic',color:'var(--accent)'}}>·</em> {ttl}</h2>
      <div className="meta">{meta}</div>
    </div>
  );
}

/* ===== Ornament ===== */
function Orn({n}){
  return (
    <div className="orn"><span className="star">✦</span><span>§{n}</span><span className="star">✦</span></div>
  );
}

/* ===== COVER ===== */
function Cover(){
  return (
    <section id="cover" className="cover page">
      <Reveal>
        <div className="dateline" style={{marginBottom:24}}>
          <span><strong>Page I</strong></span>
          <span>·</span>
          <span>The opening</span>
          <span>·</span>
          <span className="label live"><span className="dot"></span>Filed live</span>
          <span>·</span>
          <span>By <strong>Kaizer News</strong></span>
        </div>
      </Reveal>

      <Reveal delay={120}>
        <h1 className="cover-hed">
          <em>Long video</em> in.<br/>
          <span className="uline">Vertical</span> shorts<br/>
          <span className="outline">that publish</span><br/>
          <em style={{fontStyle:'italic',color:'var(--accent)'}}>themselves.</em>
        </h1>
      </Reveal>

      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:48,marginTop:60,alignItems:'start'}} className="cover-bottom-grid">
        <Reveal delay={250}>
          <div className="standfirst">
            An AI video automation engine that turns long-form recordings into multiple short-form clips
            and publishes them <em>to your YouTube channels</em>, on your behalf, with the
            <FN n="1">Authorization is held by Google. Kaizer requests the minimum scopes required: <em>youtube.upload</em>, <em>youtube.readonly</em>, and <em>youtube</em>. Revoke any time at myaccount.google.com/permissions.</FN> creator's explicit consent — using the YouTube Data API v3.
          </div>

          <div style={{marginTop:36,display:'flex',gap:14,flexWrap:'wrap',alignItems:'center'}}>
            <a href="/register" className="btn accent" data-cursor="Begin">▸ Begin reading — free</a>
            <a href="#sec-2" className="btn ghost" data-cursor="Pipeline">View the pipeline</a>
            <span className="stamp">✓ Verified Press</span>
          </div>
        </Reveal>

        <Reveal delay={350}>
          <div className="inset" style={{position:'relative'}}>
            <span className="corner">In this edition</span>
            <div className="crop tl"></div><div className="crop tr"></div><div className="crop bl"></div><div className="crop br"></div>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:8}}>
              {[
                ['§I',  'What this paper is'],
                ['§II', 'The four-stage pipeline'],
                ['§III','The compositor — a demonstration'],
                ['§IV', 'The hours, in figures'],
                ['§V',  'On trust & access'],
                ['§VI', 'Rates'],
                ['§VII','Questions, answered'],
              ].map((r,i)=>(
                <div key={i} style={{display:'flex',gap:14,alignItems:'baseline',fontFamily:'Newsreader',fontSize:14,paddingBottom:8,borderBottom:'1px solid var(--rule-faint)'}}>
                  <span className="f-mono" style={{fontSize:11,letterSpacing:'.18em',color:'var(--ink-mute)',width:34}}>{r[0]}</span>
                  <span style={{flex:1,fontStyle:'italic'}}>{r[1]}</span>
                  <span className="f-mono" style={{fontSize:10,letterSpacing:'.18em',color:'var(--ink-mute)'}}>P. {['II','III','IV','V','VII','VIII','IX'][i]}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>

      <Orn n="I"/>
    </section>
  );
}

/* ===== §I — WHAT IT IS ===== */
function SectionOne(){
  return (
    <section className="page">
      <SectionHead id="sec-1" num="I" ttl={<><em style={{fontStyle:'italic',color:'var(--accent)'}}>What</em> this paper is</>} meta="Page II · 2 min read"/>

      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:64,alignItems:'start'}}>
        <Reveal>
          <p className="body-text dropcap">
            <strong>Kaizer News</strong> is an AI video automation platform. It accepts long-form recordings — interviews, podcasts, lectures, raw camera dumps — and produces multiple <em>vertical shorts</em> from them. Once produced, those shorts are published to creators' YouTube channels on their behalf, using the <strong>YouTube Data API v3</strong><FN n="2">YouTube Data API v3 is the official, supported interface for programmatic uploads and metadata edits. Kaizer uses it under standard Google OAuth 2.0 consent flow.</FN>, with the creator's explicit consent. The creator remains in full control: they connect once, choose what ships, and may revoke access at any moment.
          </p>

          <div style={{height:32}}></div>

          <div className="cols-2 body-text">
            <p>
              The service is intended for storytellers who already have a body of recorded work and lack the time, the editor, or the inclination to crop, caption, brand, schedule, and upload eight clips per day across multiple channels. Kaizer's pipeline does that work in approximately <strong>three minutes per clip</strong>, on demand, with per-channel branding rules.
            </p>
            <p>
              The application is currently in <em>verification review</em> with Google for OAuth scope approval. The scopes requested — <em>youtube.upload</em>, <em>youtube.readonly</em>, and <em>youtube</em> — are described in detail in §V. They are the minimum required to perform the operations described above; nothing more is asked, nothing more is taken.
            </p>
            <p>
              Kaizer's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. No source video is retained beyond the rendering window. No user content is used to train any model. No data is sold or shared with third parties of any kind.
            </p>
            <p>
              What follows is a quiet tour of the pipeline, the controls, the figures, and the terms. <em>Read in any order.</em> The Q&amp;A on Page X answers the most common questions outright.
            </p>
          </div>

          <div className="pullquote" style={{marginTop:48}}>
            We didn't replace the editor. We replaced the <em>waiting</em>.
            <span className="attrib">Founding note · April 2026</span>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <aside style={{display:'flex',flexDirection:'column',gap:28,position:'sticky',top:30}}>
            <div className="marginalia">
              The unit of work in Kaizer News is not the video. It is the <em>moment</em> — the line worth sharing. The pipeline's job is to find those moments and ship them, eight times a day, while you sleep.
            </div>

            <div className="inset">
              <span className="corner">Specifications</span>
              <div style={{display:'flex',flexDirection:'column',gap:11,marginTop:6,fontFamily:'JetBrains Mono',fontSize:12.5}}>
                {[
                  ['Input',    'up to 4 hours · 4K'],
                  ['Output',   '9:16 · captioned · branded'],
                  ['Render',   '~3m 12s per clip'],
                  ['Cost',     '$0.09 per clip'],
                  ['Languages','30+ caption tracks'],
                  ['Auth',     'OAuth 2.0 (Google)'],
                  ['Storage',  'render-only · 72h'],
                ].map((r,i)=>(
                  <div key={i} style={{display:'flex',justifyContent:'space-between',gap:8,borderBottom:'1px solid var(--rule-faint)',paddingBottom:8}}>
                    <span style={{color:'var(--ink-mute)'}}>{r[0]}</span>
                    <span>{r[1]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="inset dark">
              <span className="corner">Verified</span>
              <div style={{fontFamily:'Newsreader',fontSize:24,fontStyle:'italic',fontWeight:500,lineHeight:1.2,marginTop:8}}>
                Limited Use compliant. <span style={{color:'var(--accent)'}}>Three scopes.</span> Two clicks to revoke.
              </div>
              <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={{display:'inline-block',marginTop:14,color:'var(--paper)',borderBottom:'1px solid var(--accent)',fontFamily:'JetBrains Mono',fontSize:11,letterSpacing:'.18em',textTransform:'uppercase',textDecoration:'none'}} data-cursor="Read">Google policy ↗</a>
            </div>
          </aside>
        </Reveal>
      </div>

      <Orn n="II"/>
    </section>
  );
}

/* ===== §II — PIPELINE ===== */
function SectionPipeline(){
  return (
    <section className="page">
      <SectionHead id="sec-2" num="II" ttl={<>The <em style={{fontStyle:'italic',color:'var(--accent)'}}>four-stage</em> pipeline</>} meta="Page III · A diagram"/>

      <Reveal>
        <p className="standfirst" style={{marginBottom:36,maxWidth:880}}>
          Four stages, in order, drawn here in full. <em>Ingest. Analyse. Cut. Publish.</em> Each stage is a separate worker — observable in the production console below — and each one passes its output to the next without human intervention, unless you ask it to wait.
        </p>
      </Reveal>

      <Reveal delay={150}>
        <EditorialPipeline/>
      </Reveal>

      <div style={{height:48}}></div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:24}}>
        {[
          {n:"i",   t:"Ingest",   sub:"You drop the source.",   body:"Long video, podcast cut, raw recording — any format up to four hours, up to 4K. Encrypted on receipt."},
          {n:"ii",  t:"Analyse",  sub:"We find the moments.",   body:"Transcription, topic segmentation, hook scoring. The lines worth sharing get marked automatically."},
          {n:"iii", t:"Cut",      sub:"We render the clips.",   body:"9:16 reframe, captions in your language, your fonts, your colours. Per-channel logo burn-in."},
          {n:"iv",  t:"Publish",  sub:"We ship to YouTube.",    body:"Titles, tags, descriptions, thumbnails — drafted, queued. You approve, or set autopilot."},
        ].map((s,i)=>(
          <Reveal key={s.n} delay={i*100}>
            <div style={{borderTop:'2px solid var(--ink)',paddingTop:20}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:10}}>
                <span className="f-mono" style={{fontSize:11,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--accent)'}}>Stage {s.n}</span>
                <span className="page-marker">{i+1}</span>
              </div>
              <h3 className="f-display" style={{fontSize:36,fontWeight:500,letterSpacing:'-0.02em',lineHeight:1,marginBottom:6}}>{s.t}</h3>
              <p className="f-display-i" style={{fontSize:16,color:'var(--ink-soft)',marginBottom:14,fontStyle:'italic'}}>— {s.sub}</p>
              <p className="body-text" style={{fontSize:14.5,lineHeight:1.55}}>{s.body}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div style={{height:48}}></div>

      <Reveal delay={200}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
          <div className="inset" style={{position:'relative'}}>
            <span className="corner">Production figures · last 24 hours</span>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18,marginTop:14}}>
              {[
                ['Clips rendered','1,847'],
                ['Channels in flight','63'],
                ['Avg. cost / clip','$0.09'],
                ['Pipeline failures','0'],
              ].map((r,i)=>(
                <div key={i} style={{borderBottom:'1px solid var(--rule-faint)',paddingBottom:12}}>
                  <div className="f-mono" style={{fontSize:10,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--ink-mute)',marginBottom:8}}>{r[0]}</div>
                  <div className="f-display" style={{fontSize:44,fontWeight:500,letterSpacing:'-0.03em',lineHeight:1}}>{r[1]}</div>
                </div>
              ))}
            </div>
          </div>
          <LiveTTY/>
        </div>
      </Reveal>

      <Orn n="III"/>
    </section>
  );
}

/* ===== Editorial Pipeline (animated SVG, ink-style) ===== */
function EditorialPipeline(){
  const ref = useRef(null);
  const [tokens, setTokens] = useState([]);
  const [bursts, setBursts] = useState([]);
  const [flash, setFlash] = useState({});
  const idRef = useRef(0);

  const STAGES = [
    {x:140, y:160, t:"INGEST",  s:"4K source"},
    {x:430, y:160, t:"ANALYSE", s:"hook · 0.94"},
    {x:720, y:160, t:"CUT",     s:"9:16 · burn-in"},
    {x:1020,y:160, t:"PUBLISH", s:"to YouTube"},
  ];

  useEffect(()=>{
    let raf=0, last=performance.now(), spawnAt=0, active=false;
    const io = new IntersectionObserver(([e])=>{ active=e.isIntersecting; },{threshold:.25});
    if(ref.current) io.observe(ref.current);
    const tick = (now)=>{
      const dt = now - last; last = now;
      if(active){
        spawnAt -= dt;
        if(spawnAt<=0){
          spawnAt = 1300 + Math.random()*700;
          idRef.current++;
          setTokens(p=>[...p, {id:idRef.current, born:now}]);
        }
        setTokens(p=>{
          const next=[];
          for(const tok of p){
            const dur = 5200;
            const t = (now-tok.born)/dur;
            if(t>=1){
              setBursts(b=>[...b,{id:++idRef.current, x:STAGES[3].x, y:STAGES[3].y, born:now}]);
              setFlash(f=>({...f,3:now}));
              continue;
            }
            const seg = Math.min(3, Math.floor(t*3));
            const segT = (t*3) - seg;
            if(segT < 0.05) setFlash(f=>({...f, [seg+1]:now}));
            next.push({...tok, t});
          }
          return next;
        });
        setBursts(p=>p.filter(b=> now-b.born < 1400));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return ()=>{cancelAnimationFrame(raf); io.disconnect();};
  },[]);

  const interp = (i,t)=>{
    const a=STAGES[i], b=STAGES[i+1];
    const my = a.y + (i%2===0 ? -48 : 48);
    const p0=[a.x+60,a.y], p1=[a.x+150,my], p2=[b.x-150,my], p3=[b.x-60,b.y];
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
    <div ref={ref} className="diagram">
      <div style={{position:'absolute',top:16,left:24,fontFamily:'JetBrains Mono',fontSize:10.5,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--ink-mute)'}}>fig. 1 · pipeline as observed, live</div>
      <div style={{position:'absolute',top:16,right:24,fontFamily:'JetBrains Mono',fontSize:10.5,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--accent)'}}>● recording · 24 fps</div>

      <svg viewBox="0 0 1160 320" style={{width:'100%',height:'auto',display:'block',marginTop:28}}>
        <defs>
          <pattern id="gridDots" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="rgba(26,24,20,.18)"/>
          </pattern>
        </defs>

        {/* paths between stages */}
        {[0,1,2].map(i=>{
          const a=STAGES[i],b=STAGES[i+1];
          const my = a.y + (i%2===0 ? -48 : 48);
          const d = `M ${a.x+60} ${a.y} C ${a.x+150} ${my}, ${b.x-150} ${my}, ${b.x-60} ${b.y}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 6" opacity=".35"/>
              <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="2 5">
                <animate attributeName="stroke-dashoffset" from="0" to="-21" dur="2.4s" repeatCount="indefinite"/>
              </path>
              {/* arrow */}
              <polygon points={`${b.x-66},${b.y-5} ${b.x-58},${b.y} ${b.x-66},${b.y+5}`} fill="var(--accent)"/>
            </g>
          );
        })}

        {/* hand-drawn annotations between stages */}
        <text x="285" y="120" fontFamily="Newsreader" fontStyle="italic" fontSize="14" fill="var(--ink-mute)">~ 9s</text>
        <text x="575" y="205" fontFamily="Newsreader" fontStyle="italic" fontSize="14" fill="var(--ink-mute)">~ 5s</text>
        <text x="870" y="120" fontFamily="Newsreader" fontStyle="italic" fontSize="14" fill="var(--ink-mute)">~ 10s</text>

        {/* Stages */}
        {STAGES.map((s,i)=>{
          const flashing = flash[i] && (performance.now() - flash[i] < 400);
          return (
            <g key={s.t} transform={`translate(${s.x-60}, ${s.y-60})`}>
              <rect width="120" height="120" rx="0"
                fill={flashing ? 'var(--accent)' : 'var(--paper)'}
                stroke="var(--ink)" strokeWidth="1.5"
                style={{transition:'fill .3s'}}/>
              {/* tape strip across top */}
              <rect x="0" y="-12" width="120" height="14" fill="var(--ink)"/>
              <text x="60" y="-2" fontFamily="JetBrains Mono" fontSize="10" fill="var(--paper)" textAnchor="middle" letterSpacing="2.5">STAGE 0{i+1}</text>
              {/* page number small */}
              <text x="12" y="20" fontFamily="JetBrains Mono" fontSize="9.5" fill={flashing?'var(--paper)':'var(--ink-mute)'} letterSpacing="2">0{i+1}</text>
              {/* title */}
              <text x="60" y="68" fontFamily="Newsreader" fontWeight="500" fontSize="22" letterSpacing="-0.5" textAnchor="middle" fill={flashing?'var(--paper)':'var(--ink)'} style={{transition:'fill .3s'}}>{s.t}</text>
              {/* italic sub */}
              <text x="60" y="92" fontFamily="Newsreader" fontStyle="italic" fontSize="12" textAnchor="middle" fill={flashing?'rgba(241,233,213,.8)':'var(--ink-mute)'} style={{transition:'fill .3s'}}>{s.s}</text>
              {/* corner ornaments */}
              <line x1="2" y1="2" x2="10" y2="2" stroke={flashing?'var(--paper)':'var(--ink)'} strokeWidth="1"/>
              <line x1="2" y1="2" x2="2" y2="10" stroke={flashing?'var(--paper)':'var(--ink)'} strokeWidth="1"/>
              <line x1="118" y1="2" x2="110" y2="2" stroke={flashing?'var(--paper)':'var(--ink)'} strokeWidth="1"/>
              <line x1="118" y1="2" x2="118" y2="10" stroke={flashing?'var(--paper)':'var(--ink)'} strokeWidth="1"/>
              <line x1="2" y1="118" x2="10" y2="118" stroke={flashing?'var(--paper)':'var(--ink)'} strokeWidth="1"/>
              <line x1="2" y1="118" x2="2" y2="110" stroke={flashing?'var(--paper)':'var(--ink)'} strokeWidth="1"/>
              <line x1="118" y1="118" x2="110" y2="118" stroke={flashing?'var(--paper)':'var(--ink)'} strokeWidth="1"/>
              <line x1="118" y1="118" x2="118" y2="110" stroke={flashing?'var(--paper)':'var(--ink)'} strokeWidth="1"/>
            </g>
          );
        })}

        {/* tokens */}
        {tokens.map(tok=>{
          const p = pos(tok.t);
          return (
            <g key={tok.id}>
              <circle cx={p.x} cy={p.y} r="10" fill="var(--accent)" opacity=".18"/>
              <circle cx={p.x} cy={p.y} r="5" fill="var(--accent)"/>
              <circle cx={p.x} cy={p.y} r="1.5" fill="var(--paper)"/>
            </g>
          );
        })}
        {bursts.map(b=>{
          const age = (performance.now()-b.born)/1400;
          return <circle key={b.id} cx={b.x} cy={b.y} r={6+age*42} fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity={1-age}/>;
        })}
      </svg>

      {/* Footer caption */}
      <div style={{display:'flex',justifyContent:'space-between',marginTop:18,paddingTop:14,borderTop:'1px solid var(--rule-faint)',fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--ink-mute)'}}>
        <span>T+00s</span><span>T+09s</span><span>T+14s</span><span>T+24s · live</span>
      </div>
    </div>
  );
}

/* ===== Live terminal ===== */
const TTY_EVENTS = [
  {tag:"in", text:"Source accepted · interview_S03E14.mp4 · 4K · 58:21"},
  {tag:"ok", text:"Transcript locked · 12,847 words"},
  {tag:"ok", text:"Hook scoring complete · 11 candidates · top 0.94"},
  {tag:"in", text:"Reframing 9:16 · subject tracking · ROI face+text"},
  {tag:"in", text:"Captions burned · font Newsreader · ch: AutoWala"},
  {tag:"ok", text:"Brand pack applied · logo 0:00 · LUT Kaizer-warm"},
  {tag:"in", text:"Title drafted · 'It doubled the channel'"},
  {tag:"wn", text:"Thumbnail v1 below contrast threshold · regen"},
  {tag:"ok", text:"Thumbnail v2 approved · WCAG-AA · 1280×720"},
  {tag:"in", text:"PUT youtube.googleapis.com/upload/youtube/v3/videos"},
  {tag:"ok", text:"Published · youtube.com/shorts/dQw4w9 · 0:14"},
  {tag:"ok", text:"Pipeline idle · 3m 12s · $0.09 · 0 failures"},
];
function LiveTTY(){
  const [lines, setLines] = useState([]);
  const ref = useRef(null);
  const i = useRef(0), id = useRef(0);
  useEffect(()=>{
    let intv=0, active=false;
    const io = new IntersectionObserver(([e])=>{ active=e.isIntersecting; },{threshold:.3});
    if(ref.current) io.observe(ref.current);
    const push=()=>{
      if(!active) return;
      const ev = TTY_EVENTS[i.current % TTY_EVENTS.length];
      const now = new Date();
      const tc = `${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}.${String(Math.floor(now.getMilliseconds()/10)).padStart(2,'0')}`;
      setLines(p=>[...p,{...ev,id:++id.current,tc}].slice(-7));
      i.current++;
    };
    setTimeout(()=>{ active=true; for(let k=0;k<4;k++)push(); intv = setInterval(push,1700); },250);
    return ()=>{ clearInterval(intv); io.disconnect(); };
  },[]);
  const tagText = {in:'INFO',ok:' OK ',wn:'WARN'};
  return (
    <div ref={ref} className="tty">
      <div className="tty-head">
        <span style={{display:'inline-block',width:7,height:7,borderRadius:'50%',background:'var(--accent)'}}></span>
        <span style={{flex:1}}>kaizer-pipeline · live tail</span>
        <span style={{color:'var(--accent)'}}>● online</span>
      </div>
      {lines.map(l=>(
        <div key={l.id} className="tty-line">
          <span className="tty-tc">[{l.tc}]</span>
          <span className={`tty-tag ${l.tag}`}>{tagText[l.tag]}</span>
          <span>{l.text}</span>
        </div>
      ))}
      <div className="tty-line">
        <span className="tty-tc">[{new Date().toTimeString().slice(3,8)}]</span>
        <span className="tty-tag in">INFO</span>
        <span className="tty-cursor">awaiting next event</span>
      </div>
    </div>
  );
}

/* ===== §III — Compositor ===== */
function SectionCompositor(){
  const wrapRef = useRef(null);
  const [pos, setPos] = useState(0.45);
  const drag = useRef(false);
  useEffect(()=>{
    const onMove = (e)=>{
      if(!drag.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const x = (e.touches?e.touches[0].clientX:e.clientX) - r.left;
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
  const captions = ["It doubled\nthe channel","Don't post.\nShip.","The 7-day\nrule","Why I stopped\nediting","Hook in 0.6 s","Algorithm,\nplease","Three takes,\none truth","Stop scrolling"];
  const channels = ["AUTOWALA","DAILYFIX","TECHSPK","SHORTS","REELS","CHN-05","CHN-06","CHN-07"];

  return (
    <section className="page">
      <SectionHead id="sec-3" num="III" ttl={<>The <em style={{fontStyle:'italic',color:'var(--accent)'}}>compositor</em> — a demonstration</>} meta="Page IV–V · A centerfold"/>

      <Reveal>
        <p className="standfirst" style={{marginBottom:24,maxWidth:880}}>
          One hour in. Eight shorts out. Grip the marker, pull it across — watch the AI carve a single recording into eight publishable verticals in real time. <em>Reader's instruction:</em> drag the red handle.
        </p>
      </Reveal>

      <Reveal delay={150}>
        <div ref={wrapRef} className="drag-wrap" style={{height:440,marginTop:24}}>
          {/* LEFT — source ribbon */}
          <div style={{position:'absolute',inset:0,clipPath:`inset(0 ${(1-pos)*100}% 0 0)`}}>
            <div className="wave-source"></div>
            {/* Waveform */}
            <div style={{position:'absolute',inset:'18% 6%'}}>
              <svg viewBox="0 0 1000 240" preserveAspectRatio="none" style={{width:'100%',height:'100%'}}>
                {Array.from({length:240}).map((_,i)=>{
                  const x = i*4.2;
                  const h = 30 + Math.abs(Math.sin(i*0.42)*60) + Math.abs(Math.sin(i*0.15)*45);
                  return <rect key={i} x={x} y={120-h/2} width="2" height={h} fill="var(--ink)" opacity=".75"/>;
                })}
                {/* Markers */}
                {[0.07,0.16,0.27,0.38,0.51,0.64,0.77,0.90].map((p,i)=>(
                  <g key={i}>
                    <line x1={p*1000} y1="0" x2={p*1000} y2="240" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="3 4"/>
                    <circle cx={p*1000} cy="120" r="6" fill="var(--accent)"/>
                    <text x={p*1000} y="-8" fontFamily="JetBrains Mono" fontSize="9.5" textAnchor="middle" fill="var(--ink-mute)" letterSpacing="1.2">{`00:${String(2 + i*7).padStart(2,'0')}`}</text>
                  </g>
                ))}
              </svg>
            </div>
            <div style={{position:'absolute',top:18,left:24,display:'flex',gap:10,alignItems:'center'}}>
              <span className="label live"><span className="dot"></span>Source</span>
              <span className="f-mono" style={{fontSize:10.5,letterSpacing:'.2em',textTransform:'uppercase',color:'var(--ink-mute)'}}>interview_raw.mp4 · 01:00:00 · 4K</span>
            </div>
            <div style={{position:'absolute',bottom:18,left:24,fontFamily:'Newsreader',fontStyle:'italic',fontSize:18,color:'var(--ink-mute)'}}>
              "Eight hooks detected."
            </div>
            <div style={{position:'absolute',top:18,right:'34%',fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--ink-mute)'}}>before</div>
          </div>

          {/* RIGHT — eight shorts */}
          <div style={{position:'absolute',inset:0,clipPath:`inset(0 0 0 ${pos*100}%)`}}>
            <div style={{position:'absolute',inset:0,background:'var(--paper)',backgroundImage:'repeating-linear-gradient(0deg, transparent 0 22px, rgba(26,24,20,.05) 22px 23px)'}}></div>
            <div style={{position:'absolute',inset:0,display:'grid',gridTemplateColumns:'repeat(8, 1fr)',gap:10,padding:'28px 24px 24px'}}>
              {captions.map((cap,i)=>{
                return (
                  <div key={i} className="short" style={{alignSelf:'center'}}>
                    <div className="ribbon">CLIP · 0{i+1}</div>
                    <div className="stub"><span className="hl">{cap}</span></div>
                    <div className="accent-bar"><div className="fl" style={{width:`${24 + i*8}%`}}></div></div>
                    <div className="footer-line"><span>F.{String((i+1)*137).padStart(4,"0")}</span><span style={{color:'var(--accent)'}}>{channels[i]}</span></div>
                  </div>
                );
              })}
            </div>
            <div style={{position:'absolute',top:18,right:24,display:'flex',gap:10}}>
              <span className="label accent">After · 8 shorts</span>
            </div>
          </div>

          {/* Handle */}
          <div className="drag-handle" style={{left:`${pos*100}%`}} onMouseDown={start} onTouchStart={start} data-cursor="Pull">
            <span className="drag-knob">⇆</span>
          </div>
        </div>
      </Reveal>

      <Reveal delay={300}>
        <div style={{marginTop:18,display:'flex',justifyContent:'space-between',flexWrap:'wrap',gap:10,fontFamily:'JetBrains Mono',fontSize:10,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--ink-mute)'}}>
          <span>fig. 2 · split position {Math.round(pos*100)}% · shipped {Math.max(0, Math.min(8, Math.ceil(pos*8)))} of 8</span>
          <span>avg render · 3m 12s / clip · $0.09 / clip</span>
        </div>
      </Reveal>

      <Orn n="IV"/>
    </section>
  );
}

/* ===== §IV — Figures ===== */
function SectionFigures(){
  const [v1, r1] = useCounter(10);
  const [v2, r2] = useCounter(30);
  const [v3, r3] = useCounter(3);
  const [v4, r4] = useCounter(99.97, 1800, 2);

  return (
    <section className="page">
      <SectionHead id="sec-4" num="IV" ttl={<>The hours, in <em style={{fontStyle:'italic',color:'var(--accent)'}}>figures</em></>} meta="Page VI · By the numbers"/>

      <Reveal>
        <p className="standfirst" style={{marginBottom:36,maxWidth:880}}>
          Four numerals — the only four we measure ourselves by. Faster. Wider. Lighter. Quieter. The hours come back to you.
        </p>
      </Reveal>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:64}}>
        <Reveal>
          <div ref={r1} className="stat-block">
            <span className="big-num">{v1}<em>×</em></span>
            <span className="label-cap">Faster than manual editing — measured against an editor working four hours per clip.</span>
          </div>
          <div ref={r2} className="stat-block">
            <span className="big-num outline">{v2}<em style={{WebkitTextStroke:'1.5px var(--accent)',color:'transparent'}}>+</em></span>
            <span className="label-cap">Languages available for caption tracks. Source language preserved by default.</span>
          </div>
        </Reveal>
        <Reveal delay={150}>
          <div ref={r3} className="stat-block">
            <span className="big-num">{v3}<em>m</em></span>
            <span className="label-cap">Average render time per clip, measured at peak production load.</span>
          </div>
          <div ref={r4} className="stat-block">
            <span className="big-num">{v4}<em>%</em></span>
            <span className="label-cap">Pipeline uptime over the last quarter. Failures are auto-retried; the count is zero this week.</span>
          </div>
        </Reveal>
      </div>

      <div className="pullquote" style={{marginTop:48}}>
        The unit of <em>creator pain</em> is the hour spent cropping. We removed that hour, eight times a day, for free, on a Tuesday in April.
        <span className="attrib">Engineering log · 04.2026</span>
      </div>

      <Orn n="V"/>
    </section>
  );
}

/* ===== §V — Trust ===== */
function SectionTrust(){
  const scopes = [
    {s:"youtube.upload",   w:"To upload your clips.",      d:"We push the final rendered MP4 plus title, description, tags, and thumbnail to the channel you connected."},
    {s:"youtube.readonly", w:"To read your channel name.", d:"Only to display 'connected: My Channel' in the dashboard, and to fetch the channel avatar for the UI."},
    {s:"youtube",          w:"To set thumbnails & titles.",d:"Required by YouTube's API to attach a custom thumbnail or edit metadata — only on uploads we created."},
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
    <section className="page">
      <SectionHead id="sec-5" num="V" ttl={<>On <em style={{fontStyle:'italic',color:'var(--accent)'}}>trust</em> &amp; access</>} meta="Page VII · Three scopes · One revocation"/>

      <Reveal>
        <p className="body-text dropcap" style={{maxWidth:820,marginBottom:36}}>
          <strong>Kaizer News'</strong> use and transfer of information received from Google APIs adheres to the{' '}
          <a className="draw-uline" href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={{color:'var(--accent)'}} data-cursor="Open">Google API Services User Data Policy</a>, including the Limited Use requirements. When you connect, Google asks the application what it wants. We ask for three things — only three — and tell you, in plain language, what each one unlocks. Authorization is held by Google, not by Kaizer; revoke it in two clicks and the connection is gone.
        </p>
      </Reveal>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:18,marginBottom:36}}>
        {scopes.map((sc,i)=>(
          <Reveal key={sc.s} delay={i*120}>
            <div className="scope-card">
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:18}}>
                <span className="f-mono" style={{fontSize:10.5,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--ink-mute)'}}>Scope · 0{i+1}</span>
                <span className="page-marker">{['I','II','III'][i]}</span>
              </div>
              <div className="code-row">/auth/{sc.s}</div>
              <h3 className="f-display" style={{fontSize:28,fontWeight:500,letterSpacing:'-0.02em',lineHeight:1.05,marginTop:18,marginBottom:8}}>{sc.w}</h3>
              <p className="body-text" style={{fontSize:14.5,lineHeight:1.55}}>{sc.d}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1.4fr 1fr',gap:24}}>
        <Reveal delay={150}>
          <div className="inset" style={{position:'relative'}}>
            <span className="corner">What we do not do · ever</span>
            <ul style={{listStyle:'none',marginTop:18,display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 28px'}}>
              {dont.map((d,k)=>(
                <li key={k} style={{display:'flex',gap:10,alignItems:'flex-start',fontSize:14.5,lineHeight:1.5,color:'var(--ink-soft)',fontFamily:'Newsreader'}}>
                  <span style={{color:'var(--accent)',fontFamily:'Newsreader',fontStyle:'italic',fontSize:18,lineHeight:1,marginTop:0}}>—</span>
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={300}>
          <div className="inset dark" style={{display:'flex',flexDirection:'column',position:'relative'}}>
            <span className="corner">Revoke at will</span>
            <h3 className="f-display" style={{fontSize:36,fontWeight:500,letterSpacing:'-0.025em',lineHeight:1.05,marginTop:14,marginBottom:14}}>
              Your channel,<br/>
              <em style={{fontStyle:'italic',color:'var(--accent)'}}>your keys.</em>
            </h3>
            <p style={{fontFamily:'Newsreader',fontSize:14.5,lineHeight:1.55,color:'rgba(241,233,213,.75)',marginBottom:20}}>
              Authorization lives with Google. Two clicks revoke it; the moment you do, we lose every byte of access to your account.
            </p>
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" className="btn" data-cursor="Open" style={{background:'var(--paper)',color:'var(--ink)',borderColor:'var(--paper)',marginTop:'auto'}}>
              myaccount.google.com ↗
            </a>
          </div>
        </Reveal>
      </div>

      <Orn n="VI"/>
    </section>
  );
}

/* ===== §VI — Rates ===== */
function SectionRates(){
  const tiers = [
    { name:"FREE",   role:"For trying it on",   price:"$0",     period:"",
      features:["5 min of source / month","Up to 10 clips / month","One connected channel","Community support"],
      cta:"Begin", featured:false },
    { name:"PRO",    role:"For working creators", price:"$29",  period:"/mo",
      features:["Unlimited source video","Unlimited clips","Up to 5 connected channels","Priority rendering queue","Per-channel branding & SEO","Email support, 24h SLA"],
      cta:"Upgrade", featured:true },
    { name:"STUDIO", role:"For agencies & teams", price:"Custom", period:"",
      features:["Everything in Pro","Unlimited connected channels","Dedicated GPU pipeline","Custom layouts & templates","SAML SSO + audit logs","Priority support, 4h SLA"],
      cta:"Contact us", featured:false },
  ];
  return (
    <section className="page">
      <SectionHead id="sec-6" num="VI" ttl={<>The <em style={{fontStyle:'italic',color:'var(--accent)'}}>rate card</em></>} meta="Page VIII · Three roles · No card to start"/>

      <Reveal>
        <p className="standfirst" style={{marginBottom:36,maxWidth:880}}>
          Three plans, drawn from the call sheet. Free is genuinely free. Pro is the working plan. Studio is for teams that ship across many brands. All include OAuth-secured channel connection and unlimited revocation.
        </p>
      </Reveal>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:18}}>
        {tiers.map((t,i)=>(
          <Reveal key={t.name} delay={i*120}>
            <div className={`tier ${t.featured?'featured':''}`}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
                <h3 className="f-display" style={{fontSize:38,fontWeight:500,letterSpacing:'-0.03em'}}>{t.name}</h3>
                {t.featured && <span className="label accent">Featured</span>}
              </div>
              <div className="role f-display-i" style={{fontSize:16,color:'var(--ink-mute)',marginBottom:24}}>— {t.role}</div>
              <div style={{display:'flex',alignItems:'baseline',gap:6,marginBottom:18}}>
                <span className="price-amount">{t.price}</span>
                {t.period && <span style={{fontSize:14,opacity:.7}}>{t.period}</span>}
              </div>
              <div className="rule" style={{borderColor: t.featured? 'rgba(241,233,213,.25)':'var(--rule-soft)', marginBottom:18}}></div>
              <ul style={{listStyle:'none',display:'flex',flexDirection:'column',gap:11,marginBottom:24,flex:1}}>
                {t.features.map((f,k)=>(
                  <li key={k} style={{display:'flex',gap:10,fontFamily:'Newsreader',fontSize:14.5,lineHeight:1.5}}>
                    <span style={{color:'var(--accent)',marginTop:1}}>✓</span><span>{f}</span>
                  </li>
                ))}
              </ul>
              <a href={t.cta && /talk|contact|sales/i.test(t.cta) ? "mailto:sales@kaizerx.com" : "/register"} className={`btn ${t.featured?'accent':''}`} data-cursor={t.cta} style={t.featured?{}:{}}>{t.cta} →</a>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal delay={350}>
        <p style={{marginTop:24,textAlign:'center',fontFamily:'JetBrains Mono',fontSize:10.5,letterSpacing:'.22em',textTransform:'uppercase',color:'var(--ink-mute)'}}>
          all plans · OAuth-secured · per-channel branding · unlimited revocation · cancel any time
        </p>
      </Reveal>

      <Orn n="VII"/>
    </section>
  );
}

/* ===== §VII — Q&A ===== */
function SectionQA(){
  const items = [
    {q:"How does Kaizer News access my YouTube channel?", a:"Through Google's standard OAuth 2.0 consent flow. You click 'Connect YouTube' inside the app, Google shows you exactly which scopes are requested, and you approve (or deny). Kaizer never sees your password. Authorization is held by Google; you can revoke at any time from myaccount.google.com/permissions."},
    {q:"What does Kaizer News do with my data?",         a:"It is used strictly to provide the service: read your channel name to label the connection, render your source video into clips, and upload those clips with the metadata you have approved. Nothing is sold or shared with third parties, and nothing is used to train AI models. This adheres to the Google API Services User Data Policy, including the Limited Use requirements."},
    {q:"Which YouTube API scopes does the app request?", a:"Exactly three: youtube.upload (to publish), youtube.readonly (to display your channel name), and youtube (required by YouTube to attach a custom thumbnail or edit metadata — only on uploads Kaizer created)."},
    {q:"Can I review every clip before it goes live?",   a:"Yes. Every clip waits for your approval by default. You can also turn on per-channel autopilot once you trust the output for a particular brand."},
    {q:"Where is my source video stored?",               a:"On encrypted cloud storage during rendering only. Source files are deleted within 72 hours of the final clip being approved. Rendered clips persist on YouTube, under your account — never under Kaizer's."},
    {q:"How do I cancel?",                               a:"From the billing page in the app, or by revoking OAuth at myaccount.google.com/permissions. Cancellation is immediate; no questions asked."},
  ];
  return (
    <section className="page">
      <SectionHead id="sec-7" num="VII" ttl={<>Questions, <em style={{fontStyle:'italic',color:'var(--accent)'}}>answered</em></>} meta="Page IX–X · Q&A · 6 entries"/>

      <Reveal>
        <p className="standfirst" style={{marginBottom:36,maxWidth:880}}>
          The six most common questions, set as an interview. Read top to bottom; the answers are short on purpose.
        </p>
      </Reveal>

      <div style={{maxWidth:960,margin:'0 auto'}}>
        {items.map((it,i)=>(
          <Reveal key={i} delay={i*60}>
            <div className="qa">
              <span className="qmark">Q.</span>
              <div>
                <h4>{it.q}</h4>
                <p>{it.a}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <Orn n="VIII"/>
    </section>
  );
}

/* ===== Closing letter / colophon ===== */
function Closing(){
  return (
    <section id="enter" className="colophon">
      <div style={{maxWidth:1380,margin:'0 auto'}}>
        <Reveal>
          <div className="meta" style={{display:'flex',gap:18,alignItems:'center',marginBottom:36}}>
            <span><span className="dot"></span>The closing letter</span>
            <span>·</span>
            <span>Page XII</span>
            <span>·</span>
            <span>From the editor</span>
          </div>
        </Reveal>
        <Reveal delay={100}>
          <p style={{fontFamily:'Newsreader',fontWeight:400,fontSize:'clamp(28px, 3.4vw, 56px)',letterSpacing:'-0.02em',lineHeight:1.15,maxWidth:1000,textWrap:'balance'}}>
            <em style={{fontStyle:'italic',color:'var(--accent)'}}>Connect a channel.</em> Upload a video. Watch it become a week of vertical shorts — already on YouTube before your coffee is cold.
          </p>
        </Reveal>

        <Reveal delay={200}>
          <div style={{display:'flex',flexWrap:'wrap',gap:14,marginTop:36,alignItems:'center'}}>
            <a href="/register" className="btn accent" data-cursor="Enter">▸ Enter — it's free</a>
            <a href="/login" className="btn ghost" data-cursor="Sign in" style={{color:'var(--paper)',borderColor:'rgba(241,233,213,.4)'}}>Sign in ↗</a>
            <span className="meta" style={{marginLeft:'auto',color:'rgba(241,233,213,.55)'}}>No credit card · OAuth-secured · Cancel any time</span>
          </div>
        </Reveal>

        <div className="ttl" style={{marginTop:96}}>
          <span className="out">KAIZER</span><br/>
          <span style={{color:'var(--accent)'}}>NEWS<span style={{color:'var(--paper)'}}>.</span></span>
        </div>

        <div className="rule" style={{borderColor:'rgba(241,233,213,.2)',marginTop:36,marginBottom:24}}></div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:36}}>
          {[
            {h:"Production", rows:[['Auth','OAuth 2.0'],['API','YouTube Data v3'],['Models','Gemini · Whisper']]},
            {h:"Post",       rows:[['Captions','30+ languages'],['Reframe','9:16 auto'],['Brand','Per-channel']]},
            {h:"Delivery",   rows:[['Format','YouTube Shorts'],['Schedule','Per-channel'],['Approval','You approve']]},
            {h:"Trust",      rows:[['Policy','Limited Use'],['Storage','Render-only · 72h'],['Revoke','Two clicks']]},
          ].map(col=>(
            <div key={col.h}>
              <div className="meta" style={{marginBottom:12}}>{col.h}</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {col.rows.map((r,k)=>(
                  <div key={k} style={{display:'flex',justifyContent:'space-between',gap:8,fontFamily:'Newsreader',fontStyle:'italic',fontSize:14,color:'rgba(241,233,213,.85)'}}>
                    <span style={{color:'rgba(241,233,213,.5)',fontStyle:'normal',fontFamily:'JetBrains Mono',fontSize:10.5,letterSpacing:'.2em',textTransform:'uppercase'}}>{r[0]}</span>
                    <span>{r[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rule" style={{borderColor:'rgba(241,233,213,.2)',marginTop:36,marginBottom:18}}></div>
        <div className="meta" style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',gap:12,color:'rgba(241,233,213,.55)'}}>
          <span>© {new Date().getFullYear()} Kaizer News · All rights reserved · The Daily Kaizer · Vol. I, No. 1</span>
          <span><a href="/privacy" data-cursor="Read">Privacy</a> · <a href="/terms" data-cursor="Read">Terms</a> · <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer" data-cursor="Open">YouTube terms ↗</a> · <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" data-cursor="Open">Google privacy ↗</a></span>
          <span style={{fontStyle:'italic',fontFamily:'Newsreader',color:'rgba(241,233,213,.6)'}}>— Set in Newsreader &amp; Manrope. Printed warm.</span>
        </div>
      </div>
    </section>
  );
}

/* ===== App ===== */

function NibCursor({ isActive }) {
  if (!isActive) return null;
  return <NibCursorInner />;
}

export default function KaizerV7App({ isActive }){
  return (
    <>
      <NibCursor isActive={isActive} />
      <ReadingBar/>
      <Folio/>
      <ReaderTools/>
      <Masthead/>
      <main>
        <Cover/>
        <SectionOne/>
        <SectionPipeline/>
        <SectionCompositor/>
        <SectionFigures/>
        <SectionTrust/>
        <SectionRates/>
        <SectionQA/>
      </main>
      <Closing/>
    </>
  );
}


