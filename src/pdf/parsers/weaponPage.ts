import { Token, isStringToken } from "../lexers/token";
import {
	Parser,
	accuracy,
	alt,
	cost,
	damage,
	damageType,
	description,
	eof,
	fmap,
	hands,
	image,
	kl,
	kr,
	many1,
	martial,
	matches,
	melee,
	sep,
	seq,
	starting,
	str,
	text,
	then,
	fail,
	nextToken,
	success,
	inc,
	optionalStar,
	normalizeText,
	watermark,
} from "./lib";
import { Weapon } from "../model/weapon";
import { WEAPON_CATEGORIES, WeaponCategory } from "../model/common";

const weaponListingParser = fmap(
	seq(
		image,
		str,
		optionalStar,
		martial,
		cost,
		accuracy,
		damage,
		damageType,
		kl(hands, sep),
		kl(melee, sep),
		description,
	),
	([image, name, _star, martial, cost, accuracy, damage, damageType, hands, melee, description]) => {
		return { image, name, martial, cost, damage, accuracy, damageType, hands, melee, description };
	},
);

const rareHeaderCategory: Parser<WeaponCategory> = (ptr) => {
	const token = nextToken(ptr);
	if (token && isStringToken(token)) {
		if (/^SAMPLE RARE .* WEAPONS$/.test(token.string)) {
			const category = normalizeWeaponCategory(token.string.slice(12, -8));
			return asWeaponCategory(category, ptr);
		}
		const ptMatch = token.string.match(/^EXEMPLOS DE (.+) RAR[AO]S$/);
		if (ptMatch) {
			const category = normalizeWeaponCategory(ptMatch[1]);
			return asWeaponCategory(category, ptr);
		}
	}
	return fail<WeaponCategory>("Category")(ptr);
};

function asWeaponCategory(s: string, ptr: [Token[], number]) {
	if ((WEAPON_CATEGORIES as readonly string[]).includes(s)) {
		return success(s as WeaponCategory)(inc(ptr));
	}
	return fail<WeaponCategory>(`Unexpected category ${s}`)(ptr);
}

const CATEGORY_ALIASES: Record<string, WeaponCategory> = {
	arcana: "arcane",
	arcano: "arcane",
	arcanas: "arcane",
	arcanos: "arcane",
	arco: "bow",
	arcos: "bow",
	luta: "brawling",
	adaga: "dagger",
	adagas: "dagger",
	"armas de fogo": "firearm",
	fogo: "firearm",
	malhos: "flail",
	pesada: "heavy",
	pesadas: "heavy",
	lanca: "spear",
	lancas: "spear",
	espada: "sword",
	espadas: "sword",
	arremesso: "thrown",
	arremessada: "thrown",
	arremessadas: "thrown",
};

const normalizeWeaponCategory = (raw: string) => {
	const normalized = normalizeText(raw.trim());
	const withoutPrefix = normalized
		.replace(/^categorias? de\s+/, "")
		.replace(/^armas\s+de\s+/, "")
		.replace(/^armas\s+/, "")
		.replace(/\s+category$/, "");
	return CATEGORY_ALIASES[withoutPrefix] ?? withoutPrefix;
};

const categoryTitle: Parser<WeaponCategory> = (ptr) => {
	const token = nextToken(ptr);
	if (token && isStringToken(token)) {
		if (token.string.endsWith(" Category")) {
			const category = normalizeWeaponCategory(token.string.slice(0, -9));
			return asWeaponCategory(category, ptr);
		}
		if (token.string.startsWith("Categoria de ")) {
			const category = normalizeWeaponCategory(token.string.slice(13));
			return asWeaponCategory(category, ptr);
		}
		if (token.string.startsWith("Categorias de ")) {
			const category = normalizeWeaponCategory(token.string.slice(14));
			return asWeaponCategory(category, ptr);
		}
	}
	return fail<WeaponCategory>("Category")(ptr);
};
const weaponsParser = fmap(then(categoryTitle, many1(weaponListingParser)), ([category, weapons]) =>
	weapons.map((v) => {
		return { ...v, category };
	}),
);
const weaponHeader = seq(
	alt(text("BASIC WEAPONS"), text("ARMAS BÁSICAS")),
	alt(text("WEAPON"), text("ARMA")),
	alt(text("COST"), text("CUSTO")),
	alt(text("ACCURACY"), text("PRECISÃO")),
	alt(text("DAMAGE"), text("DANO")),
);

const weaponColumns = seq(
	alt(text("WEAPON"), text("ARMA")),
	alt(text("COST"), text("CUSTO")),
	alt(text("ACCURACY"), text("PRECISÃO")),
	alt(text("DAMAGE"), text("DANO")),
);

const optionalWeaponHeader: Parser<null> = (ptr) => {
	const token = nextToken(ptr);
	if (token && isStringToken(token)) {
		if (token.string === "BASIC WEAPONS" || token.string === "ARMAS BÁSICAS") {
			return fmap(weaponHeader, () => null)(ptr);
		}
		if (token.string === "WEAPON" || token.string === "ARMA") {
			return fmap(weaponColumns, () => null)(ptr);
		}
	}
	return success(null)(ptr);
};

const weaponsStarting = alt(starting, kr(many1(image), optionalWeaponHeader));
const pageNumber = matches(/^\d+$/, "page number");
const ornament = text("W");
const chapterWord = alt(text("CAPÍTULO"), text("CHAPTER"));
const chapterNumber = matches(/^\d+$/, "chapter number");
const chapterMarker = seq(ornament, chapterNumber, chapterWord, chapterWord);
const chapterRankOrRules = alt(text("REGRAS DO JOGO"), text("MESTRE"));
const chapterFooter = seq(
	pageNumber,
	ornament,
	chapterNumber,
	chapterNumber,
	chapterRankOrRules,
	chapterWord,
	chapterWord,
	watermark,
);
const footer = alt(
	alt(
		alt(seq(image, pageNumber, ornament, watermark), seq(image, pageNumber, watermark)),
		alt(seq(pageNumber, ornament, watermark), seq(pageNumber, watermark)),
	),
	alt(seq(image, watermark), seq(watermark)),
);
const footerWithChapter = alt(seq(image, chapterFooter), alt(chapterFooter, alt(then(chapterMarker, footer), footer)));
const ending = then(
	alt(
		alt(then(text("BASIC WEAPONS"), footerWithChapter), then(text("ARMAS BÁSICAS"), footerWithChapter)),
		footerWithChapter,
	),
	eof,
);

export const basicWeapons: Parser<Weapon[]> = fmap(kl(kr(weaponsStarting, many1(weaponsParser)), ending), (k) =>
	k.flat(1),
);

const rareStarting = fmap(kr(many1(image), seq(rareHeaderCategory, weaponColumns)), ([category]) => category);
const rareEnding = then(footerWithChapter, eof);

export const rareWeapons: Parser<Weapon[]> = kl(
	fmap(then(rareStarting, many1(weaponListingParser)), ([category, weapons]) =>
		weapons.map((v) => ({ ...v, category })),
	),
	rareEnding,
);
