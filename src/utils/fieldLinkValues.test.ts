import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import {
	ensureLinkValue,
	FieldLinkOptions,
	linkifyFieldValue,
	linkTargetOf,
	type FieldLinkVault,
} from "./fieldLinkValues";

function note(path: string): TFile {
	const name = path.split("/").pop() ?? path;
	return { path, basename: name.replace(/\.md$/, ""), extension: "md" } as TFile;
}

function vault(paths: string[], aliases: Record<string, string[]> = {}): FieldLinkVault {
	const files = paths.map(note);
	return {
		files,
		resolve: (target) => {
			const wanted = target.replace(/\.md$/, "").toLowerCase();
			return (
				files.find((file) => file.path.replace(/\.md$/, "").toLowerCase() === wanted) ??
				files.find((file) => file.basename.toLowerCase() === wanted) ??
				null
			);
		},
		linkFor: (file) => `[[${file.basename}]]`,
		describe: (notes) =>
			notes.map((file) => ({ label: file.basename, aliases: aliases[file.path] ?? [] })),
	};
}

describe("linkTargetOf", () => {
	it.each([
		["Book", "Book"],
		["[[Book]]", "Book"],
		["[[References/Book|The book]]", "References/Book"],
		["[[Book#Plot]]", "Book"],
		["[The book](References/Book.md)", "References/Book.md"],
		["[The book](<My%20Book.md#Plot>)", "My Book.md"],
	])("%s names %s", (value, target) => {
		expect(linkTargetOf(value)).toBe(target);
	});
});

describe("ensureLinkValue", () => {
	it("wraps a name and leaves links as written", () => {
		expect(ensureLinkValue(" Book ")).toBe("[[Book]]");
		expect(ensureLinkValue("[[Book|B]]")).toBe("[[Book|B]]");
		expect(ensureLinkValue("[B](Book.md)")).toBe("[B](Book.md)");
		expect(ensureLinkValue("")).toBe("");
	});

	it("links each string of a list", () => {
		expect(linkifyFieldValue(["A", "[[B]]"])).toEqual(["[[A]]", "[[B]]"]);
		expect(linkifyFieldValue(3)).toBe(3);
	});
});

describe("FieldLinkOptions", () => {
	it("lists the property's values first, one option per note, then the other notes", () => {
		const links = new FieldLinkOptions(
			["[[Book]]", "Book", "[[References/Book|The book]]", "[[Missing]]", "missing"],
			vault(["Other.md", "References/Book.md"]),
		);

		expect(links.options).toEqual([
			{ value: "[[Book]]", display: "Book", aliases: [] },
			{ value: "[[Missing]]", display: "Missing", aliases: [] },
			{ value: "[[Other]]", display: "Other", aliases: [] },
		]);
	});

	it("links a typed name, alias, or link to the note it names", () => {
		const links = new FieldLinkOptions(
			[],
			vault(["People/Steph Ango.md"], { "People/Steph Ango.md": ["Steph"] }),
		);

		expect(links.linkForTyped("steph ango")).toBe("[[Steph Ango]]");
		expect(links.linkForTyped("Steph")).toBe("[[Steph Ango]]");
		expect(links.linkForTyped("[[People/Steph Ango|S]]")).toBe("[[Steph Ango]]");
		expect(links.linkForTyped("New Person")).toBe("[[New Person]]");
		expect(links.linkForTyped("")).toBe("");
		expect(links.displayFor("[[Steph Ango]]")).toBe("Steph Ango");
		expect(links.displayFor("[[People/New Person|Newbie]]")).toBe("New Person");
	});

	it("offers a link to a new note only for a name no note has", () => {
		const links = new FieldLinkOptions(["[[Unwritten]]"], vault(["Book.md"]));

		expect(links.namesOption("Book")).toBe(true);
		expect(links.namesOption("unwritten")).toBe(true);
		expect(links.namesOption("Boo")).toBe(false);
	});
});
