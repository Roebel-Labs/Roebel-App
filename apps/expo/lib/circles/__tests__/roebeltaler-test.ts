import { canMint, formatRoebeltaler } from "../roebeltaler";

test("canMint requires positive amount within available pCRC", () => {
	expect(canMint(0, 10)).toBe(false);
	expect(canMint(5, 10)).toBe(true);
	expect(canMint(11, 10)).toBe(false);
});

test("formatRoebeltaler renders 2 decimals with suffix", () => {
	expect(formatRoebeltaler(12.3456)).toBe("12.35 Röbeltaler");
});
