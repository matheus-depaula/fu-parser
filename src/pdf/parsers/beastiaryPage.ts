import {
	accuracy,
	alt,
	damage,
	eof,
	fail,
	fmap,
	image,
	kl,
	kr,
	many,
	many1,
	matches,
	nextToken,
	Parser,
	sep,
	seq,
	str,
	strWithFont,
	success,
	text,
	textWithFont,
	then,
	watermark,
	inc,
	isResult,
	normalizeText,
} from "./lib";
import { Beast } from "../model/beast";
import {
	AFFINITIES,
	Affinity,
	Accuracy,
	DAMAGE_TYPES,
	DamageType,
	DIE_SIZES,
	DieSize,
	ResistanceMap,
	TYPE_CODES,
} from "../model/common";
import { isStringToken, Token } from "../lexers/token";
import { prettifyStrings } from "../parsers-commons";

const beastAttribute = (codes: string[]) =>
	fmap(matches(new RegExp(`^(${codes.join("|")}) d(${DIE_SIZES.join("|")})$`), "beast attribute"), (t) =>
		Number(t.slice(t.lastIndexOf("d") + 1)),
	) as Parser<DieSize>;
const dex = beastAttribute(["DEX", "DES"]);
const ins = beastAttribute(["INS", "AST"]);
const mig = beastAttribute(["MIG", "VIG"]);
const wlp = beastAttribute(["WLP", "VON"]);
const beastInit = fmap(matches(/^(Init\.|Inic\.) [0-9]+$/, "beast init"), (s) => Number(s.split(" ")[1]));
const beastDef = (prefixes: string[]) =>
	fmap(matches(new RegExp(`^(${prefixes.join("|")}) \\+?[0-9]+$`), "beast def"), (s) => Number(s.split(" ")[1]));
const beastAttributes = fmap(
	seq(
		dex,
		ins,
		mig,
		wlp,
		kr(
			alt(text("HP"), text("PV")),
			fmap(matches(/^[0-9]+$/, "HP"), (s) => Number(s)),
		),
		kr(
			sep,
			fmap(matches(/^[0-9]+$/, "Crisis"), (s) => Number(s)),
		),
		kr(
			alt(text("MP"), text("PM")),
			fmap(matches(/^[0-9]+$/, "MP"), (s) => Number(s)),
		),
		beastInit,
		beastDef(["DEF"]),
		beastDef(["M.DEF", "DEF.M"]),
	),
	([dex, ins, mig, wlp, maxHp, crisis, maxMp, init, def, mdef]) => {
		return { dex, ins, mig, wlp, maxHp, crisis, maxMp, init, def, mdef };
	},
);

const TYPE_CODE_ALIASES: Record<DamageType, string[]> = {
	physical: [TYPE_CODES.physical, "p", "P"],
	air: [TYPE_CODES.air, "a", "A"],
	bolt: [TYPE_CODES.bolt, "b", "B"],
	dark: [TYPE_CODES.dark, "d", "D"],
	earth: [TYPE_CODES.earth, "e", "E"],
	fire: [TYPE_CODES.fire, "f", "F"],
	ice: [TYPE_CODES.ice, "i", "I"],
	light: [TYPE_CODES.light, "l", "L"],
	poison: [TYPE_CODES.poison, "t", "T"],
};

const normalizeAffinity = (value: string): Affinity | null => {
	const normalized = value === "RE" ? "RS" : value;
	return (AFFINITIES as readonly string[]).includes(normalized) ? (normalized as Affinity) : null;
};

const isTypeCode = (token: unknown, type: DamageType): token is { string: string } => {
	return (
		!!token &&
		typeof token === "object" &&
		"string" in (token as { string: string }) &&
		TYPE_CODE_ALIASES[type].includes((token as { string: string }).string)
	);
};

const beastResistance =
	(type: DamageType): Parser<Affinity> =>
	(ptr) => {
		const token = nextToken(ptr);
		if (!token || !isTypeCode(token, type)) {
			return fail<Affinity>("type code")(ptr);
		}
		const afterIcon = inc(ptr);
		const next = nextToken(afterIcon);
		if (next && isStringToken(next)) {
			const affinity = normalizeAffinity(next.string);
			if (affinity) {
				return success<Affinity>(affinity)(inc(afterIcon));
			}
			if (isTypeCode(next, type)) {
				const afterSecond = inc(afterIcon);
				const nextAfterSecond = nextToken(afterSecond);
				if (nextAfterSecond && isStringToken(nextAfterSecond)) {
					const affinityAfterSecond = normalizeAffinity(nextAfterSecond.string);
					if (affinityAfterSecond) {
						return success<Affinity>(affinityAfterSecond)(inc(afterSecond));
					}
				}
			}
		}
		return success<Affinity>("N")(afterIcon);
	};

const beastResistances = DAMAGE_TYPES.reduce(
	(p, t) =>
		fmap(then(p, beastResistance(t)), ([m, n]) => {
			return { ...m, [t]: n };
		}),
	success({}),
) as Parser<ResistanceMap>;

const BEAST_DESCRIPTION_FONTS = [
	/PTSans-Narrow$/,
	/PTSans-NarrowBold$/,
	/Heydings-Icons$/,
	/KozMinPro-Regular$/,
	/Type3$/,
	/FabulaUltimaicons-Regular$/,
];

const DAMAGE_TYPE_WORDS: Record<string, DamageType> = {
	physical: "physical",
	air: "air",
	bolt: "bolt",
	dark: "dark",
	earth: "earth",
	fire: "fire",
	ice: "ice",
	light: "light",
	poison: "poison",
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

const maybeDamageType: Parser<DamageType | null> = (ptr) => {
	const token = nextToken(ptr);
	if (token && isStringToken(token)) {
		const normalized = normalizeText(token.string);
		const mapped = DAMAGE_TYPE_WORDS[normalized];
		if (mapped) {
			return success(mapped)(inc(ptr));
		}
	}
	return success(null)(ptr);
};

const DESCRIPTION_STOP_HEADERS = [
	"BASIC ATTACKS",
	"ATAQUES BÁSICOS",
	"SPELLS",
	"FEITIÇOS",
	"OTHER ACTIONS",
	"OUTRAS AÇÕES",
	"SPECIAL RULES",
	"REGRAS ESPECIAIS",
	"Typical Traits:",
	"Traços típicos:",
];

const isSectionIcon = (token: { string: string; font: string }) =>
	/FabulaUltimaicons-Regular$/.test(token.font) && ["C", "M", "R", "S"].includes(token.string);

const isBeastDescriptionToken = (token: unknown): token is { string: string; font: string } => {
	return (
		!!token &&
		typeof token === "object" &&
		"string" in (token as { string: string }) &&
		"font" in (token as { font: string }) &&
		BEAST_DESCRIPTION_FONTS.some((r) => r.test((token as { font: string }).font)) &&
		!DESCRIPTION_STOP_HEADERS.includes((token as { string: string }).string) &&
		!/^Opportunity:/.test((token as { string: string }).string) &&
		!/^Oportunidade:/.test((token as { string: string }).string) &&
		!isSectionIcon(token as { string: string; font: string })
	);
};

const beastDescription: Parser<string> = (ptr) => {
	const lines: string[] = [];
	let cursor = ptr;
	let token = nextToken(cursor);
	while (token && isBeastDescriptionToken(token)) {
		lines.push(token.string);
		cursor = inc(cursor);
		token = nextToken(cursor);
	}
	if (lines.length === 0) {
		return fail<string>("beast description")(ptr);
	}
	return success(prettifyStrings(lines))(cursor);
};

const maybeDamage: Parser<[number, DamageType | null]> = (ptr) => {
	const token = nextToken(ptr);
	if (token && isStringToken(token) && (token.string === "【" || token.string === "(")) {
		return fmap(
			then(damage, maybeDamageType),
			([value, type]) => [value, type] as [number, DamageType | null],
		)(ptr);
	}
	return success<[number, DamageType | null]>([0, null])(ptr);
};

const beastAttack = fmap(
	seq(
		alt(
			alt(
				fmap(textWithFont("$", [/Evilz$/]), () => "melee" as const),
				fmap(textWithFont("M", [/FabulaUltimaicons-Regular$/]), () => "melee" as const),
			),
			alt(
				fmap(many1(textWithFont("a", [/fabulaultima$/])), () => "ranged" as const),
				fmap(many1(textWithFont("R", [/FabulaUltimaicons-Regular$/])), () => "ranged" as const),
			),
		),
		str,
		kr(sep, accuracy),
		kr(sep, maybeDamage),
		beastDescription,
	),
	([range, name, accuracy, [damage, damageType], description]) => {
		return { range, name, accuracy, damage, damageType, description };
	},
);

const maybeSepDescription: Parser<string> = (ptr) => {
	const token = nextToken(ptr);
	if (token && isStringToken(token) && token.string === "w" && /Wingdings-Regular$/.test(token.font)) {
		return kr(sep, beastDescription)(ptr);
	}
	return beastDescription(ptr);
};

const specialRule = fmap(seq(str, maybeSepDescription), ([name, description]) => {
	return { name, description };
});

const opportunity = kr(alt(text("Opportunity:"), text("Oportunidade:")), beastDescription);

const maybeOpportunity: Parser<string | null> = (ptr) => {
	const token = nextToken(ptr);
	if (token && isStringToken(token) && (token.string === "Opportunity:" || token.string === "Oportunidade:")) {
		return opportunity(ptr);
	}
	return success(null)(ptr);
};

const spellIcon = alt(textWithFont("h", [/Evilz$/]), textWithFont("C", [/FabulaUltimaicons-Regular$/]));
const spellAccuracyIcon = alt(textWithFont("r", [/Heydings-Icons$/]), textWithFont("O", [/Type3$/]));

const BEAST_DURATION_MAP: Record<string, string> = {
	"Until the start of your next turn": "nextTurn",
	"Até o início do seu próximo turno": "nextTurn",
	Instantaneous: "instant",
	Instantânea: "instant",
	Scene: "scene",
	Cena: "scene",
};

const mapBeastDuration = (value: string) =>
	Object.prototype.hasOwnProperty.call(BEAST_DURATION_MAP, value) ? BEAST_DURATION_MAP[value] : value.toLowerCase();

const maybeSpellAccuracy: Parser<Accuracy | null> = (ptr) => {
	const token = nextToken(ptr);
	if (token && isStringToken(token) && /Heydings-Icons$/.test(token.font)) {
		return kr(many1(spellAccuracyIcon), kr(sep, accuracy))(ptr);
	}
	if (token && isStringToken(token) && token.string === "O" && /Type3$/.test(token.font)) {
		return kr(many1(spellAccuracyIcon), kr(sep, accuracy))(ptr);
	}
	return success(null)(ptr);
};

const beastSpells = kr(
	alt(text("SPELLS"), text("FEITIÇOS")),
	many1(
		fmap(
			seq(
				kr(spellIcon, str),
				maybeSpellAccuracy,
				kr(
					sep,
					fmap(str, (s) => s.slice(0, -3)),
				),
				kr(sep, str),
				kr(sep, fmap(kl(str, text(".")), mapBeastDuration)),
				beastDescription,
				maybeOpportunity,
			),
			([name, accuracy, mp, target, duration, description, opportunity]) => {
				if (opportunity) return { name, accuracy, mp, target, duration, description, opportunity };
				else return { name, accuracy, mp, target, duration, description };
			},
		),
	),
);
const beastAttacks = kr(alt(text("BASIC ATTACKS"), text("ATAQUES BÁSICOS")), many1(beastAttack));
const specialRules = kr(alt(text("SPECIAL RULES"), text("REGRAS ESPECIAIS")), many1(specialRule));
const otherActions = kr(
	alt(text("OTHER ACTIONS"), text("OUTRAS AÇÕES")),
	many1(
		kr(
			alt(textWithFont("S", [/WebSymbols-Regular$/]), textWithFont("S", [/FabulaUltimaicons-Regular$/])),
			specialRule,
		),
	),
);

const hasNextHeader = (ptr: Parameters<Parser<unknown>>[0], headers: string[]) => {
	const token = nextToken(ptr);
	return token && isStringToken(token) && headers.includes(token.string);
};

const maybeEquipment: Parser<string[] | null> = (ptr) => {
	if (!hasNextHeader(ptr, ["Equipment:", "Equipamento:"])) {
		return success(null)(ptr);
	}
	return kr(
		alt(text("Equipment:"), text("Equipamento:")),
		fmap(str, (s) => s.slice(0, -1).split(", ")),
	)(ptr);
};

const maybeAttacks: Parser<Beast["attacks"]> = (ptr) => {
	if (!hasNextHeader(ptr, ["BASIC ATTACKS", "ATAQUES BÁSICOS"])) {
		return success([])(ptr);
	}
	return beastAttacks(ptr);
};

const maybeSpells: Parser<Beast["spells"]> = (ptr) => {
	if (!hasNextHeader(ptr, ["SPELLS", "FEITIÇOS"])) {
		return success([])(ptr);
	}
	return beastSpells(ptr);
};

const maybeOtherActions: Parser<Beast["otherActions"]> = (ptr) => {
	if (!hasNextHeader(ptr, ["OTHER ACTIONS", "OUTRAS AÇÕES"])) {
		return success([])(ptr);
	}
	return otherActions(ptr);
};

const maybeSpecialRules: Parser<Beast["specialRules"]> = (ptr) => {
	if (!hasNextHeader(ptr, ["SPECIAL RULES", "REGRAS ESPECIAIS"])) {
		return success([])(ptr);
	}
	return specialRules(ptr);
};
const beastParser: Parser<Beast> = fmap(
	seq(
		image,
		str,
		fmap(matches(/^(Lv|Nvl)\. \d+/, "Level"), (s) => Number(s.split(" ")[1])),
		kr(sep, str),
		beastDescription,
		kr(alt(text("Typical Traits:"), text("Traços típicos:")), str),
		beastAttributes,
		beastResistances,
		maybeEquipment,
		maybeAttacks,
		maybeSpells,
		maybeOtherActions,
		maybeSpecialRules,
	),
	([
		image,
		name,
		level,
		type,
		description,
		traits,
		attributes,
		resists,
		equipment,
		attacks,
		spells,
		otherActions,
		specialRules,
	]) => {
		return {
			image,
			name,
			level,
			type,
			description,
			traits,
			attributes,
			resists,
			equipment,
			attacks,
			spells,
			otherActions,
			specialRules,
		};
	},
);
const pageNumber = matches(/^\d+$/, "page number");
const ornament = text("W");
const chapterLabel = text("CAPÍTULO");
const chapterNumber = matches(/^\d+$/, "chapter number");
const chapterTitle = alt(text("BESTIARY"), text("BESTIÁRIO"));
const chapterFooter = seq(
	pageNumber,
	ornament,
	chapterNumber,
	chapterNumber,
	chapterTitle,
	chapterLabel,
	chapterLabel,
	watermark,
	eof,
);

const legacyFooter = seq(
	alt(
		alt(
			alt(
				seq(
					strWithFont([/MonotypeCorsiva$/]),
					strWithFont([/MonotypeCorsiva$/]),
					alt(seq(many1(str), strWithFont([/Antonio-Bold$/]), image, many(str), image), success(null)),
				),
				seq(
					many1(matches(/^.*[^.]$/, "aside")),
					matches(/^.*\.$/, "aside"),
					strWithFont([/Antonio-Bold$/]),
					image,
					many(str),
					image,
				),
			),
			strWithFont([/CreditValley$/]),
		),
		success(null),
	),
	watermark,
	eof,
);

const footer = alt(chapterFooter, legacyFooter);

const beastStart = seq(image, str, matches(/^(Lv|Nvl)\. \d+/, "Level"));

const manyBeasts: Parser<Beast[]> = (ptr) => {
	const beasts: Beast[] = [];
	let cursor = ptr;
	while (cursor[1] < cursor[0].length) {
		const footerMatch = footer(cursor).find(isResult);
		if (footerMatch) {
			break;
		}
		let start = cursor;
		let foundStart: [Token[], number] | null = null;
		for (let i = cursor[1]; i < cursor[0].length; i += 1) {
			const footerAhead = footer([cursor[0], i]).find(isResult);
			if (footerAhead) {
				break;
			}
			const startMatch = beastStart([cursor[0], i]).find(isResult);
			if (startMatch) {
				foundStart = [cursor[0], i];
				break;
			}
		}
		if (!foundStart) {
			break;
		}
		start = foundStart;
		const parsed = beastParser(start).find(isResult);
		if (!parsed) {
			break;
		}
		const [beast, remainder] = parsed.result;
		if (remainder[1] === cursor[1]) {
			break;
		}
		beasts.push(beast);
		cursor = remainder;
	}
	if (beasts.length === 0) {
		return fail<Beast[]>("beast list")(ptr);
	}
	return success(beasts)(cursor);
};

const beastiaryStarting: Parser<null> = (ptr) => {
	for (let i = ptr[1]; i < ptr[0].length; i += 1) {
		const parses = beastStart([ptr[0], i]);
		const found = parses.find(isResult);
		if (found) {
			return success(null)([ptr[0], i]);
		}
	}
	return fail<null>("beastiary start")(ptr);
};

const beastiaryEnding: Parser<null> = (ptr) => {
	for (let i = ptr[1]; i < ptr[0].length; i += 1) {
		const parses = footer([ptr[0], i]);
		const found = parses.find(isResult);
		if (found) {
			const [, remainder] = found.result;
			return success(null)(remainder);
		}
	}
	return fail<null>("beastiary footer")(ptr);
};

export const beastiary = kl(kr(beastiaryStarting, manyBeasts), beastiaryEnding);
