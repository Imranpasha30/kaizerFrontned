import React from 'react';
import KaizerV7App from './KaizerV7App';
import './styles.css';

/**
 * Landing page — newspaper design (V7).
 *
 * History: this used to be a "RealitySplitter" that let visitors press-and-
 * hold on the hero h1 to swap between two designs (V6 chrome/futuristic
 * vs V7 newspaper). Per product decision 2026-05-23, the futuristic
 * design was retired and only the newspaper view ships. The splitter
 * logic, KaizerV6App.jsx, and the .theme-v6 stylesheet rules are gone.
 *
 * isActive is hardwired to true so NibCursor (the ink-nib custom cursor
 * inside KaizerV7App) is always engaged.
 */
export default function LandingPage() {
  // The .theme-v7 wrapper class is REQUIRED -- nearly all of the
  // newspaper-specific CSS in styles.css is scoped under .theme-v7 { ... }
  // (CSS-nested rules from when V6 and V7 lived side-by-side). Without
  // this wrapper the page renders unstyled. Do not remove.
  return (
    <div className="theme-v7">
      <KaizerV7App isActive={true} />
    </div>
  );
}
