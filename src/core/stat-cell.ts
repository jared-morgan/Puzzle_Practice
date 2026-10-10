/** A table value can contain separately coloured counts, without accepting HTML. */
export interface StatPart {
  text: string;
  tone?: 'positive' | 'negative';
  title?: string;
}
export type StatCell = string | readonly StatPart[];
export type StatRows = readonly (readonly StatCell[])[];

export function fillStatCell(node: HTMLElement, value: StatCell): void {
  if (typeof value === 'string') { node.textContent = value; return; }
  value.forEach((part, i) => {
    if (i) node.append(', ');
    const span = document.createElement('span');
    span.textContent = part.text;
    span.className = `stat-part${part.tone ? ` is-${part.tone}` : ''}`;
    if (part.title) span.title = part.title;
    node.append(span);
  });
}
