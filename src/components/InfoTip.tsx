type Props = {
  title: string;
  body: string;
  example: string;
  align?: "start" | "end";
  wide?: boolean;
};

export function InfoTip({
  title,
  body,
  example,
  align = "start",
  wide = false,
}: Props) {
  return (
    <span className="info">
      <button type="button" className="info-btn" aria-label={`Info: ${title}`}>
        i
      </button>
      <span
        className={`info-pop${align === "end" ? " end" : ""}${wide ? " wide" : ""}`}
        role="tooltip"
      >
        <strong>{title}</strong>
        <p>{body}</p>
        <p className="ex">Exemplu: {example}</p>
      </span>
    </span>
  );
}
