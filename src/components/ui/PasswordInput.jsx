import React, { useId, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

/**
 * PasswordInput — password field with show/hide toggle + label + help + error.
 *
 *   <PasswordInput
 *     label="Password"
 *     value={pw}
 *     onChange={(e) => setPw(e.target.value)}
 *     autoComplete="current-password"
 *     placeholder="••••••••"
 *   />
 *
 * The eye toggle is a real <button type="button"> so it doesn't submit the form.
 * Tab order: field → toggle → next field. Labels live above the input, hints
 * below. Passes ARIA correctly (aria-describedby + aria-invalid when error).
 */
export default function PasswordInput({
  label = "Password",
  hint,
  error,
  icon = <Lock size={12} />,
  leadingIcon,           // pass null to hide the label icon
  className = "",
  id: idProp,
  ...inputProps
}) {
  const [visible, setVisible] = useState(false);
  const genId = useId();
  const id = idProp || `pw-${genId}`;
  const hintId = hint  ? `${id}-hint`  : undefined;
  const errId  = error ? `${id}-error` : undefined;

  const labelIcon = leadingIcon !== undefined ? leadingIcon : icon;

  return (
    <div className={`ui-field ${className}`.trim()}>
      {label ? (
        <label htmlFor={id} className="ui-field-label">
          {labelIcon}
          <span>{label}</span>
        </label>
      ) : null}

      <div className="ui-input-wrap">
        <input
          {...inputProps}
          id={id}
          type={visible ? "text" : "password"}
          className="ui-input ui-input--with-trailing"
          aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? "true" : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="ui-input-trailing-btn"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={0}
        >
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      {error ? (
        <span id={errId} className="ui-field-error" role="alert">{error}</span>
      ) : hint ? (
        <span id={hintId} className="ui-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
