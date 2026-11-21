import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type IChoice from "../../src/types/choices/IChoice";
import { TemplateChoice } from "../../src/types/choices/TemplateChoice";
import { createQuickAddE2EHarness, seedVaultFile } from "./e2eVault";
import { POLL_OPTS, closeOpenPrompts, expectNoPrompt, jsLiteral, pressKey, typeInto, waitForElement } from "./uiHelpers";

// `{{FIELD:<property>|link}}`: a property whose values are notes. The picker
// shows notes by name and writes links Obsidian reads as links.
const getContext = createQuickAddE2EHarness("field-link");

type QuickAddData = { choices: IChoice[]; onePageInputEnabled: boolean };

const PICKER = ".prompt input";
const TEMPLATE = "---\nauthor: {{FIELD:author|link}}\n---\nBy {{FIELD:author|link}}\n";

beforeEach(() => closeOpenPrompts(getContext().obsidian));
afterEach(() => closeOpenPrompts(getContext().obsidian));

async function runTemplate(name: string): Promise<void> {
	const { obsidian, plugin, sandbox } = getContext();
	await seedVaultFile(obsidian, sandbox, "References/Steph Ango.md", "---\naliases: [Steph]\n---\n");
	await seedVaultFile(obsidian, sandbox, "Notes/book.md", '---\nauthor: "[[Steph Ango]]"\n---\n');
	const template = new TemplateChoice(name);
	template.command = true;
	template.templatePath = await seedVaultFile(obsidian, sandbox, `${name}.template.md`, TEMPLATE);
	template.fileNameFormat = { enabled: true, format: name };
	template.folder = { ...template.folder, enabled: true, folders: [sandbox.path("out")] };
	await plugin.data<QuickAddData>().patch((data) => {
		data.onePageInputEnabled = false;
		data.choices.push(template);
	});
	await plugin.reload({ waitUntilReady: true });
	await obsidian.exec("command", { id: `quickadd:choice:${template.id}` });
	await waitForElement(obsidian, PICKER);
}

const topRow = () => getContext().obsidian.dev.evalJson<{ text: string; link: boolean }>(`(() => {
	const row = document.querySelector(".prompt .suggestion-item.is-selected");
	return { text: row?.textContent ?? "", link: Boolean(row?.querySelector(".qa-field-link")) };
})()`);

/** The note's text, and the links Obsidian found in its front matter. */
async function expectNote(name: string, content: string, links: string[]) {
	const { obsidian, sandbox } = getContext();
	const path = sandbox.path(`out/${name}.md`);
	await expect.poll(() => sandbox.read(`out/${name}.md`).catch(() => ""), POLL_OPTS).toBe(content);
	await expect.poll(() => obsidian.dev.evalJson<string[]>(`(() => {
		const file = app.vault.getAbstractFileByPath(${jsLiteral(path)});
		return (file && app.metadataCache.getFileCache(file)?.frontmatterLinks || []).map((link) => link.link);
	})()`), POLL_OPTS).toEqual(links);
}

describe("FIELD |link", () => {
	it("shows a note by name in link color and writes a link to it", async () => {
		const { obsidian } = getContext();
		await runTemplate("by name");

		await typeInto(obsidian, PICKER, "Steph An");
		await expect.poll(topRow, POLL_OPTS).toEqual({ text: "Steph Ango", link: true });
		await pressKey(obsidian, "Enter");

		await expectNote("by name", '---\nauthor: "[[Steph Ango]]"\n---\nBy [[Steph Ango]]\n', ["Steph Ango"]);
		await expectNoPrompt(obsidian);
	});

	it("links the note whose alias was typed", async () => {
		const { obsidian } = getContext();
		await runTemplate("by alias");

		await typeInto(obsidian, PICKER, "Steph");
		await expect.poll(() => obsidian.dev.evalJson<string>(
			'document.querySelector(".prompt .suggestion-item.is-selected")?.textContent ?? ""',
		), POLL_OPTS).toContain("Steph Ango");
		await pressKey(obsidian, "Enter");

		await expectNote("by alias", '---\nauthor: "[[Steph Ango]]"\n---\nBy [[Steph Ango]]\n', ["Steph Ango"]);
	});

	it("links a name no note has, without creating the note", async () => {
		const { obsidian, sandbox } = getContext();
		await runTemplate("new name");

		await typeInto(obsidian, PICKER, "Zqxw Person");
		await expect.poll(topRow, POLL_OPTS).toEqual({ text: "Link to [[Zqxw Person]]", link: false });
		await pressKey(obsidian, "Enter");

		await expectNote("new name", '---\nauthor: "[[Zqxw Person]]"\n---\nBy [[Zqxw Person]]\n', ["Zqxw Person"]);
		expect(await sandbox.read("Zqxw Person.md").catch(() => null)).toBeNull();
	});
});
