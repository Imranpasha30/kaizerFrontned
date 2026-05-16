import React, { useState, useEffect, useRef } from 'react';
import KaizerV6App from './KaizerV6App';
import KaizerV7App from './KaizerV7App';
import './styles.css';

export default function RealitySplitter() {
  const containerRef = useRef(null);
  const pressTimer = useRef(null);
  const v6Ref = useRef(null);
  const v7Ref = useRef(null);
  
  const [activeTheme, setActiveTheme] = useState('v6');
  
  const targetRadiusRef = useRef(0);
  const currentRadiusRef = useRef(0);
  const isSwappingRef = useRef(false);

  const handlePointerMove = (e) => {
    if (containerRef.current) {
      containerRef.current.style.setProperty('--mouse-x', `${e.clientX}px`);
      containerRef.current.style.setProperty('--mouse-y', `${e.clientY}px`);
    }

    if (isSwappingRef.current) return; // Ignore hover logic while exploding

    const el = document.elementFromPoint(e.clientX, e.clientY);
    
    // The massive hero title is an h1
    const isHeroTitle = el && el.closest('h1');

    if (isHeroTitle) {
      document.body.classList.add('hide-cursor');
      const textEl = el.closest('h1');
      const style = window.getComputedStyle(textEl);
      const fontSize = parseFloat(style.fontSize) || 150;
      targetRadiusRef.current = Math.max(100, fontSize * 1.2);
    } else {
      document.body.classList.remove('hide-cursor');
      targetRadiusRef.current = 0;
    }
  };

  const handlePointerDown = (e) => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const isHeroTitle = el && el.closest('h1');
    
    if (!isHeroTitle) return; // Only allow swap when hovering over the main hero title

    pressTimer.current = setTimeout(() => {
      isSwappingRef.current = true;
      targetRadiusRef.current = 3000;
    }, 500); 
  };

  const handlePointerUp = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  // Animation Loop for smoothly tweening the mask radius
  useEffect(() => {
    let raf;
    const tick = () => {
      currentRadiusRef.current += (targetRadiusRef.current - currentRadiusRef.current) * 0.12;
      
      if (isSwappingRef.current && currentRadiusRef.current > 2000) {
        setActiveTheme(prev => prev === 'v6' ? 'v7' : 'v6');
        currentRadiusRef.current = 0;
        isSwappingRef.current = false;
        targetRadiusRef.current = 40; // Reset to default small
      }

      if (containerRef.current) {
        containerRef.current.style.setProperty('--mask-radius', `${currentRadiusRef.current}px`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Scroll Sync
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      if (v6Ref.current && v6Ref.current.parentElement.classList.contains('layer-top')) {
        v6Ref.current.scrollTop = scrollY;
      }
      if (v7Ref.current && v7Ref.current.parentElement.classList.contains('layer-top')) {
        v7Ref.current.scrollTop = scrollY;
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTheme]);

  const isV6Bottom = activeTheme === 'v6';

  return (
    <div 
      ref={containerRef}
      className="split-reality-container"
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      style={{
        '--mask-radius': '0px'
      }}
    >
      <div className={`theme-v6 ${isV6Bottom ? 'layer-bottom' : 'layer-top'}`}>
        <div ref={v6Ref}>
          <KaizerV6App isActive={isV6Bottom} />
        </div>
      </div>

      <div className={`theme-v7 ${isV6Bottom ? 'layer-top' : 'layer-bottom'}`}>
        <div ref={v7Ref}>
          <KaizerV7App isActive={!isV6Bottom} />
        </div>
      </div>
    </div>
  );
}
