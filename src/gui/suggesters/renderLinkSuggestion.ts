import { renderMatches, type SearchMatches } from "obsidian";

/** A row for a note a FIELD `|link` writes a link to: the note's name, in link color. */
export function renderLinkSuggestion(
	el: HTMLElement,
	display: string,
	matches: SearchMatches,
): void {
	renderMatches(el.createSpan({ cls: "qa-field-link" }), display, matches);
}
