import Icone from "../Icone";

function RenderIcon({ value, className = "" }) {
  return typeof value === "string" ? (
    <Icone nome={value} className={className} />
  ) : (
    <span className="ui-button-icon" aria-hidden="true">
      {value}
    </span>
  );
}

// Aceita nomes do registro ou elementos React, preservando children e props nativas.
export default function Button({
  as: Component = "button",
  icon,
  startIcon,
  endIcon,
  leftIcon,
  rightIcon,
  loading = false,
  disabled,
  className = "",
  children,
  "aria-busy": ariaBusy,
  ...props
}) {
  const leading = startIcon ?? leftIcon ?? icon;
  const trailing = endIcon ?? rightIcon;
  return (
    <Component
      {...props}
      className={`ui-button ${className}`.trim()}
      {...(Component === "button" ? { disabled: disabled || loading } : {})}
      aria-busy={loading || ariaBusy}
    >
      {loading ? (
        <Icone nome="carregando" className="icon-spinner" />
      ) : (
        leading && <RenderIcon value={leading} />
      )}
      {children}
      {trailing && <RenderIcon value={trailing} />}
    </Component>
  );
}

export function IconButton({
  label,
  title = label,
  className = "",
  type = "button",
  ...props
}) {
  return (
    <Button
      {...props}
      type={type}
      className={`icon-button ${className}`}
      aria-label={label}
      title={title}
    />
  );
}
