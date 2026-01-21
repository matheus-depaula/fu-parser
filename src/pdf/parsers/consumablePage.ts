import {
	Parser,
	alt,
	description,
	end,
	fmap,
	fail,
	image,
	kl,
	kr,
	many1,
	matches,
	nextToken,
	inc,
	seq,
	starting,
	str,
	then,
	text,
	watermark,
} from "./lib";
import { Consumable } from "../model/consumable";

const consumableParser: Parser<Consumable> = fmap(
	seq(
		image,
		fmap(many1(str), (s) => s.join(" ")),
		fmap(matches(/^[0-9]+$/, "ipCost"), (s) => Number(s)),
		description,
	),
	([image, name, ipCost, description]) => {
		return { image, name, ipCost, description };
	},
);

const header = matches(/^[^.?!]*$/, "header");

const itemHeader: Parser<null> = (ptr) => {
	let p = ptr;
	while (!end(p)) {
		const token = nextToken(p);
		if (token && token.kind === "String" && token.string === "ITEM") {
			return fmap(seq(text("ITEM"), text("CUSTO DE PI"), text("EFEITO")), () => null)(p);
		}
		p = inc(p);
	}
	return fail<null>("consumables header")(ptr);
};

const pageNumber = matches(/^\d+$/, "page number");
const ornament = text("W");
const footer = alt(
	alt(
		alt(seq(image, pageNumber, ornament, watermark), seq(image, pageNumber, watermark)),
		alt(seq(pageNumber, ornament, watermark), seq(pageNumber, watermark)),
	),
	alt(seq(image, watermark), seq(watermark)),
);

const consumablesStarting = alt(starting, kr(many1(image), itemHeader));
export const consumablesPage = kl(kr(consumablesStarting, many1(then(header, many1(consumableParser)))), footer);
