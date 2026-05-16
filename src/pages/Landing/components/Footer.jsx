import React from "react";
import { Link } from "react-router-dom";

/**
 * Footer — column links + legal smallprint. Same data in both modes;
 * CSS handles the visual style swap.
 */
export default function Footer({ mode, content }) {
  const f = content.footer;
  return (
    <footer className={`ls-footer ls-footer--${mode}`}>
      <div className="ls-footer__cols">
        {f.columns.map((col) => (
          <div key={col.title} className="ls-footer__col">
            <h4 className="ls-footer__col-title">{col.title}</h4>
            <ul className="ls-footer__col-list">
              {col.links.map((link, i) => (
                <li key={i}>
                  {link.to
                    ? <Link to={link.to}  className="ls-footer__link">{link.label}</Link>
                    : <a href={link.href} className="ls-footer__link">{link.label}</a>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="ls-footer__smallprint">{f.smallprint}</p>
      <p className="ls-footer__copyright">{f.copyright}</p>
    </footer>
  );
}
