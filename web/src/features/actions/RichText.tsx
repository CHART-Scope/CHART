import { textBlocks } from "./actionCatalog";

/** Curator text as paragraphs and lists (see `textBlocks`). */
export function RichText({
  text,
  listClassName,
}: {
  text: string;
  listClassName?: string;
}) {
  return textBlocks(text).map((block, index) =>
    block.kind === "list" ? (
      <ul key={index} className={listClassName}>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ) : (
      <p key={index}>{block.text}</p>
    ),
  );
}
