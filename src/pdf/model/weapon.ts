import {
	Accuracy,
	DamageType,
	Distance,
	Handed,
	Image,
	normalizeDescription,
	normalizeText,
	STAT_MAPPING,
	WeaponCategory,
} from "./common";
import { CATEGORY, FUItem } from "../../external/project-fu";

export type Weapon = {
	image: Image;
	name: string;
	martial: boolean;
	cost: number;
	damage: number;
	accuracy: Accuracy;
	damageType: DamageType;
	hands: Handed;
	melee: Distance;
	category: WeaponCategory;
	description: string;
};

const normalizeDamageType = (value: DamageType): DamageType => {
	const normalized = normalizeText(value).replace(/^(de|do|da|dos|das)\s+/, "");
	const map: Record<string, DamageType> = {
		fisico: "physical",
		ar: "air",
		raio: "bolt",
		trevas: "dark",
		terra: "earth",
		fogo: "fire",
		gelo: "ice",
		luz: "light",
		veneno: "poison",
	};
	return map[normalized] ?? (value as DamageType);
};
const normalizeCategory = (value: WeaponCategory): CATEGORY => {
	const normalized = normalizeText(value);
	const map: Record<string, CATEGORY> = {
		arcane: "arcane",
		bow: "bow",
		brawling: "brawling",
		dagger: "dagger",
		firearm: "firearm",
		flail: "flail",
		heavy: "heavy",
		spear: "spear",
		sword: "sword",
		thrown: "thrown",
	};
	return map[normalized] ?? "arcane";
};

export function weaponToFuItem(data: Weapon, imagePath: string, folderId: string, source: string): FUItem {
	return {
		type: "weapon" as const,
		name: data.name,
		img: imagePath + "/" + data.name + ".png",
		folder: folderId,
		system: {
			isMartial: { value: data.martial },
			description: normalizeDescription(data.description),
			cost: { value: data.cost },
			attributes: {
				primary: { value: STAT_MAPPING[data.accuracy.primary] },
				secondary: { value: STAT_MAPPING[data.accuracy.secondary] },
			},
			accuracy: { value: data.accuracy.bonus },
			damage: { value: data.damage },
			type: { value: data.melee },
			category: { value: normalizeCategory(data.category) },
			hands: { value: data.hands },
			damageType: { value: normalizeDamageType(data.damageType) },
			source: { value: source },
			isBehavior: false,
			weight: { value: 1 },
			isCustomWeapon: { value: false },
		},
	};
}
