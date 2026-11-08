import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';
import { detectSlotsFromImageData, toCatalogSlots } from '../src/index';

const DIR = join(__dirname, 'fixtures');

/**
 * Minimal PNG decoder for the fixtures (8-bit RGBA, non-interlaced, as written
 * by Go's image/png for NRGBA). Test helper only.
 * @returns RGBA bytes plus size
 */
function decodePng(buf: Buffer): { data: Uint8Array; width: number; height: number } {
    let pos = 8, width = 0, height = 0;
    const idat: Buffer[] = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
        const body = buf.subarray(pos + 8, pos + 8 + len);
        if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error('fixture must be 8-bit RGBA, not interlaced'); }
        if (type === 'IDAT') idat.push(body);
        pos += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * 4, out = new Uint8Array(stride * height);
    for (let y = 0; y < height; y++) {
        const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
        for (let i = 0; i < stride; i++) {
            const a = i >= 4 ? out[y * stride + i - 4] : 0, b = y ? out[(y - 1) * stride + i] : 0, c = i >= 4 && y ? out[(y - 1) * stride + i - 4] : 0;
            const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            out[y * stride + i] = (line[i] + pred) & 255;
        }
    }
    return { data: out, width, height };
}

/**
 * Parity with the Go detector (backend/internal/slots, CustomOptions).
 * Tolerance: exact for the synthetic fixtures; if float rounding ever differs
 * between Math.* and Go math.*, allow +-1 px and +-0.5 deg (checked below).
 */
describe('parity with vlor Go detector', () => {
    const expected = JSON.parse(readFileSync(join(DIR, 'expected.json'), 'utf8'));
    for (const name of readdirSync(DIR).filter((n) => n.endsWith('.png') && !n.startsWith('._'))) {
        it(name, () => {
            const { data, width, height } = decodePng(readFileSync(join(DIR, name)));
            expect({ width, height }).toEqual({ width: expected[name].width, height: expected[name].height });
            const raw = detectSlotsFromImageData(data, width, height, { alphaThreshold: 20, minSlotSize: Math.max(200, Math.round(width * 0.1)) });
            const got = toCatalogSlots(raw, 50);
            const want = expected[name].slots;
            expect(got.length).toBe(want.length);
            got.forEach((s, i) => {
                for (const k of ['cx', 'cy', 'width', 'height'] as const) expect(Math.abs(s[k] - want[i][k])).toBeLessThanOrEqual(1);
                expect(Math.abs(s.angle - want[i].angle)).toBeLessThanOrEqual(0.5);
                expect([s.radius, s.round]).toEqual([0, false]);
            });
            expect(got).toEqual(want); // currently exact
        });
    }
});
