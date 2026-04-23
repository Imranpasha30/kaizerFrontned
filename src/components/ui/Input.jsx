import React, { useId } from "react";

/**
 * Input — the text/email/number field counterpart to PasswordInput. Same
 * wrapper shell, same label/hint/error pattern, but no trailing toggle.
 *
 *   <Input label="Email" type="email" icon={<Mail size={12} />} .../>
 */
export default function Input({
  label,
  hint,
  error,
  icon,
  className = "",
  id: idProp,
  ...inputProps
}) {
  const genId = useId();
  const id = idProp || `input-${genId}`;
  const hintId = hint  ? `${id}-hint`  : undefined;
  const errId  = error ? `${id}-error` : undefined;
  return (
    <div className={`ui-field ${className}`.trim()}>
      {label ? (
        <label htmlFor={id} className="ui-field-label">
          {icon ? <span className="shrink-0">{icon}</span> : null}
          <span>{label}</span>
        </label>
      ) : null}
      <input
        {...inputProps}
        id={id}
        className="ui-input"
        aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? "true" : undefined}
      />
      {error ? (
        <span id={errId} className="ui-field-error" role="alert">{error}</span>
      ) : hint ? (
        <span id={hintId} className="ui-field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
