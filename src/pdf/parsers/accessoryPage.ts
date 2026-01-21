import {
	Parser,
	alt,
	cost,
	description,
	fail,
	fmap,
	image,
	kl,
	kr,
	many1,
	matches,
	seq,
	str,
	text,
	watermark,
	optionalStar,
	success,
	isResult,
} from "./lib";
import { Accessory } from "../model/accessory";

const accessoryParser: Parser<Accessory> = fmap(
	seq(image, str, optionalStar, cost, description),
	([image, name, _star, cost, description]) => {
		return { image, name, description, cost };
	},
);

const accessoryHeaderTitle = alt(alt(text("ACCESSORIES"), text("ACESSÓRIOS")), text("EXEMPLOS DE ACESSÓRIOS"));
const accessoryHeaderColumns = alt(
	seq(
		alt(text("ACCESSORY"), text("ACESSÓRIO")),
		alt(text("COST"), text("CUSTO")),
		alt(text("EFFECT"), text("EFEITO")),
	),
	seq(alt(text("ACCESSORY"), text("ACESSÓRIO")), alt(text("COST"), text("CUSTO"))),
);
const accessoryHeader = alt(seq(accessoryHeaderTitle, accessoryHeaderColumns), accessoryHeaderColumns);

const accessoriesStarting: Parser<null> = (ptr) => {
	for (let i = ptr[1]; i < ptr[0].length; i += 1) {
		const parses = accessoryHeader([ptr[0], i]);
		const found = parses.find(isResult);
		if (found) {
			const [, remainder] = found.result;
			return success(null)(remainder);
		}
	}
	return fail<null>("accessory header")(ptr);
};

const pageNumber = matches(/^\d+$/, "page number");
const ornament = text("W");
const chapterRankOrRules = alt(text("REGRAS DO JOGO"), text("MESTRE"));
const chapterLabel = text("CAPÍTULO");
const chapterNumber = matches(/^\d+$/, "chapter number");
const chapterFooter = seq(
	pageNumber,
	ornament,
	chapterNumber,
	chapterNumber,
	chapterRankOrRules,
	chapterLabel,
	chapterLabel,
	watermark,
);
const footer = alt(
	alt(
		alt(seq(image, pageNumber, ornament, watermark), seq(image, pageNumber, watermark)),
		alt(seq(pageNumber, ornament, watermark), seq(pageNumber, watermark)),
	),
	alt(alt(seq(image, chapterFooter), seq(chapterFooter)), alt(seq(image, watermark), seq(watermark))),
);

export const accessories = kl(kr(accessoriesStarting, many1(accessoryParser)), footer);
