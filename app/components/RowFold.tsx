/**
 * The first rows of a long table or list, with the rest one click away.
 *
 * Rows past `visible` carry `data-fold` (spread `foldAt(index, visible)` onto them). A
 * checkbox shows them, so it works without a script, and a printed page shows every row.
 * Nothing leaves the page: hidden rows stay in the document for search, export and tests.
 */
export function RowFold({ id, total, visible, noun, children }: {
  id: string;
  total: number;
  visible: number;
  /** What a row is, plural: "districts", "mandals". */
  noun: string;
  children: React.ReactNode;
}) {
  if (total <= visible) return <>{children}</>;
  return (
    <div className="rowFold" style={{ display: "contents" }}>
      <input type="checkbox" id={id} className="rowFoldToggle" />
      {children}
      <label htmlFor={id} className="rowFoldLabel">
        <span className="rowFoldMore">Show all {total} {noun}</span>
        <span className="rowFoldLess">Show the first {visible}</span>
      </label>
    </div>
  );
}

export function foldAt(index: number, visible: number): { "data-fold"?: "" } {
  return index >= visible ? { "data-fold": "" } : {};
}
