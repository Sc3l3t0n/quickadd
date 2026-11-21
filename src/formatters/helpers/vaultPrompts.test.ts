import { TFile, type App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type { IChoiceExecutor } from "../../IChoiceExecutor";
import { FILE_CUSTOM_PREFIX, FILE_PICK_PREFIX, parseFileToken } from "../../utils/fileSyntax";
import { suggestForField, suggestForFile } from "./vaultPrompts";

const files = ["People/Thomas Anderson.md", "People/Neo Classic.md"].map((path) =>
	Object.assign(new TFile(), {
		path,
		name: path.slice("People/".length),
		basename: path.slice("People/".length, -".md".length),
		extension: "md",
	}),
);

vi.mock("../../utils/vaultQueries", () => ({ getFileTokenFiles: () => files }));
// The values a FIELD finds for its property, for the |link tests.
vi.mock("../../utils/FieldValueCollector", () => ({
	collectFieldValuesProcessedDetailed: async () => ({
		values: ["[[Book]]", "Book", "[[Unwritten]]"],
		hasDefaultValue: false,
	}),
}));

const app = {
	metadataCache: {
		getFileCache: (file: TFile) =>
			file.basename === "Thomas Anderson" ? { frontmatter: { aliases: ["Neo", "The One"] } } : null,
	},
} as unknown as App;

// A remote client (Raycast) filters by title, so a user who types a note's
// alias sends it as a custom value.
function remoteReply(reply: string, token = "People|custom") {
	const suggester = vi.fn(async () => reply);
	const suggesterMulti = vi.fn(async () => [reply]);
	const executor = { promptProvider: { suggester, suggesterMulti } } as unknown as IChoiceExecutor;
	const parsed = parseFileToken(token);
	if (!parsed) throw new Error("token did not parse");
	return suggestForFile({ app, executor, getSourcePath: () => null }, parsed);
}

describe("suggestForFile with a remote client", () => {
	it("picks the note whose alias was typed (#2062)", async () => {
		await expect(remoteReply("the one")).resolves.toBe(`${FILE_PICK_PREFIX}People/Thomas Anderson.md`);
	});

	it("keeps any other typed text as a custom value", async () => {
		await expect(remoteReply("Niobe")).resolves.toBe(`${FILE_CUSTOM_PREFIX}Niobe`);
	});

	it("picks the note whose alias was typed in a multi-select", async () => {
		await expect(remoteReply("the one", "People|multi|custom")).resolves
			.toEqual([`${FILE_PICK_PREFIX}People/Thomas Anderson.md`]);
		await expect(remoteReply("Niobe", "People|multi|custom")).resolves
			.toEqual([`${FILE_CUSTOM_PREFIX}Niobe`]);
	});
});

describe("suggestForField with |link", () => {
	const notes = ["References/Book.md", "People/Steph Ango.md"].map((path) =>
		Object.assign(new TFile(), {
			path,
			basename: path.slice(path.indexOf("/") + 1, -".md".length),
			extension: "md",
			stat: { mtime: path.startsWith("People") ? 2 : 1 },
		}),
	);
	const linkApp = {
		vault: { getMarkdownFiles: () => notes },
		metadataCache: {
			getFileCache: (file: TFile) =>
				file.basename === "Steph Ango" ? { frontmatter: { aliases: ["Steph"] } } : null,
			getFirstLinkpathDest: (target: string) =>
				notes.find((note) => note.basename.toLowerCase() === target.toLowerCase()) ?? null,
		},
		fileManager: { generateMarkdownLink: (file: TFile) => `[[${file.basename}]]` },
	} as unknown as App;

	function ask(token: string, reply: string | string[]) {
		const suggester = vi.fn(async () => reply);
		const suggesterMulti = vi.fn(async () => reply);
		const executor = { promptProvider: { suggester, suggesterMulti } } as unknown as IChoiceExecutor;
		const result = suggestForField({ app: linkApp, executor, getSourcePath: () => null }, token);
		return { result, suggester, suggesterMulti };
	}

	it("lists the property's values, then the other notes, by name", async () => {
		const { result, suggester } = ask("author|link", "[[Book]]");

		await expect(result).resolves.toBe("[[Book]]");
		expect(suggester).toHaveBeenCalledWith(
			["Book", "Unwritten", "Steph Ango"],
			["[[Book]]", "[[Unwritten]]", "[[Steph Ango]]"],
			"Enter value for author",
			true,
		);
	});

	it("links a typed name or alias to its note, and anything else as typed", async () => {
		await expect(ask("author|link", "Steph").result).resolves.toBe("[[Steph Ango]]");
		await expect(ask("author|link", "New Person").result).resolves.toBe("[[New Person]]");
		await expect(ask("author|multi|link", ["book", "New Person"]).result).resolves
			.toEqual(["[[Book]]", "[[New Person]]"]);
	});
});
