import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(text: string) {
	let bits = "";
	for (const char of text.replace(/[\s=]/g, "").toUpperCase()) {
		bits += ALPHABET.indexOf(char).toString(2).padStart(5, "0");
	}
	const bytes: number[] = [];
	for (let i = 0; i + 8 <= bits.length; i += 8) {
		bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
	}
	return Buffer.from(bytes);
}

/** Código TOTP (RFC 6238: SHA-1, 6 dígitos, 30 s) de uma chave em base32, como a de um app autenticador. */
export function totpCode(base32Secret: string, at = Date.now()) {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
	const hmac = createHmac("sha1", base32Decode(base32Secret))
		.update(counter)
		.digest();
	const offset = (hmac.at(-1) ?? 0) & 0x0f;
	const value = hmac.readUInt32BE(offset) & 0x7fffffff;
	return String(value % 1_000_000).padStart(6, "0");
}

/** A chave (base32) que vai dentro da URI otpauth:// do QR code. */
export function secretFromUri(uri: string) {
	const secret = new URL(uri).searchParams.get("secret");
	if (!secret) throw new Error("URI sem secret");
	return secret;
}
