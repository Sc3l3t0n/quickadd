import type { App, Scope, SearchMatches } from "obsidian";
import { TextInputSuggest } from "../suggesters/suggest";
import { renderLinkSuggestion } from "../suggesters/renderLinkSuggestion";

/** A suggestion for the multi-select's custom-value field. */
export interface CustomValueSuggestion {
	/** What gets added to the selection. */
	value: string;
	/** What the row shows. */
	display: string;
	/** The query's match ranges in `display`. */
	matches: SearchMatches;
	/** A muted second line, such as the note an alias belongs to. */
	note?: string;
	/** Renders as a plain row, not a link: a link to a note that does not exist yet. */
	plain?: boolean;
}

/** The list under the multi-select's custom-value field, which suggests values while typing. */
export class CustomValueSuggest extends TextInputSuggest<CustomValueSuggestion> {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		private readonly suggestFor: (query: string) => CustomValueSuggestion[],
		private readonly onPick: (value: string) => void,
		parentScope?: Scope,
	) {
		super(app, inputEl, parentScope);
	}

	getSuggestions(query: string): CustomValueSuggestion[] {
		return query.trim() ? this.suggestFor(query) : [];
	}

	renderSuggestion(item: CustomValueSuggestion, el: HTMLElement): void {
		if (item.plain) {
			el.setText(item.display);
			return;
		}
		if (!item.note) {
			renderLinkSuggestion(el, item.display, item.matches);
			return;
		}
		el.addClass("mod-complex");
		const content = el.createDiv({ cls: "suggestion-content" });
		renderLinkSuggestion(content.createDiv({ cls: "suggestion-title" }), item.display, item.matches);
		content.createDiv({ cls: "suggestion-note", text: item.note });
	}

	selectSuggestion(item: CustomValueSuggestion): void {
		this.close();
		this.onPick(item.value);
	}
}
