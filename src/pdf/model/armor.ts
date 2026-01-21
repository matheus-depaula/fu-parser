import { Image, normalizeDescription, normalizeText } from "./common";
import { FUItem } from "../../external/project-fu";

export type Armor = {
	image: Image;
	name: string;
	martial: boolean;
	cost: number;
	def: number;
	mdef: number;
	init: number;
	description: string;
};

export const convertDef = (prefix: string) => (s: string) => {
	const raw = s.trim();
	const normalized = normalizeText(raw);
	const aliases = new Set([normalizeText(prefix)]);
	if (normalizeText(prefix) === "dex") {
		aliases.add("des");
	}
	if (normalizeText(prefix) === "ins") {
		aliases.add("ast");
	}
	for (const p of aliases) {
		if (normalized.startsWith(`${p} size`)) {
			const num = normalized.slice((p + " size").length).trim();
			return num === "" ? 0 : Number(num);
		}
		if (normalized.startsWith(`${p} die`)) {
			const num = normalized.slice((p + " die").length).trim();
			return num === "" ? 0 : Number(num);
		}
		if (normalized.startsWith(`dado de ${p}`)) {
			const label = `dado de ${p}`;
			const num = normalized.slice(label.length).trim();
			return num === "" ? 0 : Number(num);
		}
	}
	return normalized === "-" ? 0 : Number(raw);
};

export function armorToFuItem(data: Armor, imagePath: string, folderId: string, source: string): FUItem {
	return {
		type: "armor" as const,
		name: data.name,
		img: imagePath + "/" + data.name + ".png",
		folder: folderId,
		system: {
			isMartial: { value: data.martial },
			description: normalizeDescription(data.description),
			cost: { value: data.cost },
			source: { value: source },
			def: { value: data.def },
			mdef: { value: data.mdef },
			init: { value: data.init },
			isBehavior: false,
			weight: { value: 1 },
		},
	};
}
