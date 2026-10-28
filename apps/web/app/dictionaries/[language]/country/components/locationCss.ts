// CSS for the picker: with data-at set, hide every other location's segment
// and contents link. A page with nothing for the chosen place shows its
// data-missing note for that place instead.
export function locationCss(rootId: string, ids: string[]): string {
  return [
    `#${rootId} [data-missing]{display:none}`,
    ...ids.flatMap((id) => [
      `#${rootId}[data-at="${id}"] [data-location]:not([data-location="${id}"]){display:none}`,
      `#${rootId}[data-at="${id}"] [data-missing][data-location="${id}"]{display:block}`,
    ]),
  ].join('\n');
}
