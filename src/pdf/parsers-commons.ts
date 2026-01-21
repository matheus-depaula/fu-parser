import { StringToken } from "./lexers/token";

export const isMartial = (token: StringToken) => token.font.includes("BasicShapes1") && token.string === "E";
export const convertDashOrNumber = (s: string) => (s === "-" ? 0 : Number(s));

export const convertCosts = (s: string) => {
	const normalizeNumber = (value: string) => value.replace(/\./g, "");
	if (s.endsWith(" z")) {
		return Number(normalizeNumber(s.slice(0, -2)));
	}
	if (s.endsWith("z")) {
		return Number(normalizeNumber(s.slice(0, -1)));
	}
	if (s === "-") {
		return 0;
	}
	return Number(normalizeNumber(s));
};

export const prettifyStrings = (lines: string[]): string => {
	return lines
		.reduce((acc, line) => {
			const s = line.trim();
			if (/^[.?!),]/.test(s)) {
				return acc + s;
			} else {
				return acc + " " + s;
			}
		}, "")
		.trim();
};
