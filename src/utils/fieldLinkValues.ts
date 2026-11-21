import type { TFile } from "obsidian";
import { itemWithAlias } from "./fileSyntax";

/**
 * `{{FIELD:<name>|link}}`: a property whose values are notes.
 *
 * The picker shows each note by name and writes a link to it. It lists the
 * values the property already has first, then every other note in the vault,
 * and a typed name that matches no note becomes a link to a note that does not
 * exist yet - the way Obsidian treats an unresolved link.
 */

const WIKILINK = /^!?\[\[([^\]]*)\]\]$/;
const MARKDOWN_LINK = /^!?\[[^\]]*\]\(([^)]*)\)$/;

/** Whether the value already is a whole wikilink or Markdown link. */
export function isLinkValue(value: string): boolean {
	const trimmed = value.trim();
	return WIKILINK.test(trimmed) || MARKDOWN_LINK.test(trimmed);
}

/** The value as a link: a link stays as written, anything else becomes `[[value]]`. */
export function ensureLinkValue(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	return isLinkValue(trimmed) ? trimmed : `[[${trimmed}]]`;
}

/** A `|link` FIELD's answer as links: each string of a list, or the one string. */
export function linkifyFieldValue(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => (typeof item === "string" ? ensureLinkValue(item) : item));
	}
	return typeof value === "string" ? ensureLinkValue(value) : value;
}

/**
 * The note a property value names, without heading, block, or display text:
 * `[[Book#Plot|The book]]`, `[The book](Book.md)` and `Book` all name `Book`.
 */
export function linkTargetOf(value: string): string {
	const trimmed = value.trim();
	const wiki = WIKILINK.exec(trimmed);
	if (wiki) return stripSubpath(wiki[1].split("|")[0]);

	const markdown = MARKDOWN_LINK.exec(trimmed);
	if (markdown) {
		let target = markdown[1].trim();
		if (target.startsWith("<") && target.endsWith(">")) {
			target = target.slice(1, -1);
		}
		try {
			target = decodeURIComponent(target);
		} catch {
			// A stray % is part of the name.
		}
		return stripSubpath(target);
	}

	return trimmed;
}

function stripSubpath(target: string): string {
	const hash = target.indexOf("#");
	return (hash >= 0 ? target.slice(0, hash) : target).trim();
}

export interface FieldLinkOption {
	/** What gets written: a link. */
	value: string;
	/** What the picker shows: the note's name. */
	display: string;
	/** The note's aliases, which the picker also matches. */
	aliases: string[];
}

export interface FieldLinkVault {
	/** Every Markdown note, in the order the picker lists the ones no value names. */
	files: TFile[];
	/** The note a link target resolves to, as Obsidian resolves links. */
	resolve: (target: string) => TFile | null;
	/** A link to the note that follows the user's link settings. */
	linkFor: (file: TFile) => string;
	/** Display names for the notes, by index: the label and the aliases. */
	describe: (files: TFile[]) => { label: string; aliases: string[] }[];
}

export class FieldLinkOptions {
	readonly options: FieldLinkOption[];
	/** How many leading options are the property's values; the rest are other notes. */
	readonly valueCount: number;
	private readonly byPath = new Map<string, FieldLinkOption>();

	/**
	 * `values` are the property's existing values, in the order the picker
	 * shows them. Values naming the same note collapse into one option.
	 */
	constructor(values: readonly string[], private readonly vault: FieldLinkVault) {
		const descriptions = vault.describe(vault.files);
		const describedByPath = new Map<string, { label: string; aliases: string[] }>();
		vault.files.forEach((file, index) => {
			describedByPath.set(file.path, descriptions[index]);
		});

		const options: FieldLinkOption[] = [];
		const unresolved = new Set<string>();
		const add = (file: TFile) => {
			if (this.byPath.has(file.path)) return;
			const described = describedByPath.get(file.path);
			const option = {
				value: vault.linkFor(file),
				display: described?.label ?? file.basename,
				aliases: described?.aliases ?? [],
			};
			this.byPath.set(file.path, option);
			options.push(option);
		};

		for (const value of values) {
			const target = linkTargetOf(value);
			if (!target) continue;
			const file = vault.resolve(target);
			if (file) {
				add(file);
				continue;
			}
			const key = target.toLowerCase();
			if (unresolved.has(key)) continue;
			unresolved.add(key);
			options.push({ value: ensureLinkValue(value), display: target, aliases: [] });
		}

		this.valueCount = options.length;
		for (const file of vault.files) add(file);
		this.options = options;
	}

	get values(): string[] {
		return this.options.map((option) => option.value);
	}

	get displays(): string[] {
		return this.options.map((option) => option.display);
	}

	get aliases(): string[][] {
		return this.options.map((option) => option.aliases);
	}

	/** The name a link shows as: its note's name, or the name it links to. */
	displayFor(value: string): string {
		return (
			this.options.find((option) => option.value === value)?.display ??
			linkTargetOf(value).split("/").pop() ??
			value
		);
	}

	/**
	 * The link for a value that is not one of the options: a value a note's
	 * name or alias names becomes a link to that note, anything else a link to
	 * the name as typed.
	 */
	linkForTyped(typed: string): string {
		const trimmed = typed.trim();
		if (!trimmed) return "";
		if (this.values.includes(trimmed)) return trimmed;
		if (isLinkValue(trimmed)) {
			const file = this.vault.resolve(linkTargetOf(trimmed));
			return file ? (this.byPath.get(file.path)?.value ?? trimmed) : trimmed;
		}

		const byAlias = itemWithAlias(this.options, this.aliases, trimmed);
		if (byAlias) return byAlias.value;
		const byDisplay = this.options.find(
			(option) => option.display.toLowerCase() === trimmed.toLowerCase(),
		);
		if (byDisplay) return byDisplay.value;
		const file = this.vault.resolve(trimmed);
		if (file) return this.byPath.get(file.path)?.value ?? this.vault.linkFor(file);
		return ensureLinkValue(trimmed);
	}

	/** Whether a typed value names a note the options already list. */
	namesOption(typed: string): boolean {
		return this.linkForTyped(typed) !== ensureLinkValue(typed) ||
			this.values.includes(ensureLinkValue(typed));
	}
}
