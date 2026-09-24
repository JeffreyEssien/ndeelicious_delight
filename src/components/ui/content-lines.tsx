import { Fragment } from "react";

export function ContentLines({ text }: { text: string }) {
  return text.split("\n").map((line, index, lines) => (
    <Fragment key={`${index}-${line}`}>
      {line}
      {index < lines.length - 1 && <br />}
    </Fragment>
  ));
}
