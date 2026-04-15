import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PhotoboothFrameGenerator } from '../src/index';

describe('PhotoboothFrameGenerator Unit Tests', () => {
    let engine: PhotoboothFrameGenerator;

    beforeEach(() => {
        engine = new PhotoboothFrameGenerator();

        // Cukup mock method yang tidak tersedia di environment Node murni secara native
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('harus berhasil melakukan inisialisasi dengan konfigurasi default', () => {
        expect(engine).toBeInstanceOf(PhotoboothFrameGenerator);
    });

    it('harus menerima konfigurasi kustom saat inisialisasi', () => {
        const customEngine = new PhotoboothFrameGenerator({
            alphaThreshold: 20,
            outputFormat: 'image/webp',
            quality: 0.8
        });
        
        expect(customEngine).toBeInstanceOf(PhotoboothFrameGenerator);
    });

    it('metode reset() harus berjalan lancar untuk manajemen memori', () => {
        // Melakukan pemanggilan reset untuk memastikan tidak ada array bounds/crash
        expect(() => engine.reset()).not.toThrowError();
    });

    it('tetap mendukung pengisian foto berdasarkan urutan slot', () => {
        const slots = [
            { cx: 0, cy: 0, width: 100, height: 100, angle: 0 },
            { cx: 0, cy: 0, width: 100, height: 100, angle: 0 },
            { cx: 0, cy: 0, width: 100, height: 100, angle: 0 }
        ];

        const result = (engine as any).resolveSlotPhotos(slots, [], ['photo-a', 'photo-b']);

        expect(result).toEqual(['photo-a', 'photo-b', 'photo-a']);
    });

    it('bisa menempatkan foto ke slot tertentu tanpa mengubah urutan slot lain', () => {
        const slots = [
            { cx: 0, cy: 0, width: 100, height: 100, angle: 0 },
            { cx: 0, cy: 0, width: 100, height: 100, angle: 0 },
            { cx: 0, cy: 0, width: 100, height: 100, angle: 0 }
        ];

        const result = (engine as any).resolveSlotPhotos(
            slots,
            [{ slotIndex: 2, photo: 'photo-c' }],
            ['photo-a', 'photo-b']
        );

        expect(result).toEqual(['photo-a', 'photo-b', 'photo-c']);
    });

    it('menghormati fillEmptySlots=false saat foto berurutan kurang dari jumlah slot', () => {
        const customEngine = new PhotoboothFrameGenerator({ fillEmptySlots: false });
        const slots = [
            { cx: 0, cy: 0, width: 100, height: 100, angle: 0 },
            { cx: 0, cy: 0, width: 100, height: 100, angle: 0 }
        ];

        const result = (customEngine as any).resolveSlotPhotos(slots, [], ['photo-a']);

        expect(result).toEqual(['photo-a', undefined]);
    });

    it('melempar error jika slotIndex assignment di luar batas', () => {
        const slots = [
            { cx: 0, cy: 0, width: 100, height: 100, angle: 0 }
        ];

        expect(() => {
            (engine as any).resolveSlotPhotos(slots, [{ slotIndex: 3, photo: 'photo-a' }], []);
        }).toThrowError('Invalid slotIndex 3. Only 1 slot(s) were detected, so the valid range is 0 to 0.');
    });

    it('melempar error yang jelas jika frame tidak memiliki slot transparan', () => {
        expect(() => {
            (engine as any).resolveSlotPhotos([], [{ slotIndex: 0, photo: 'photo-a' }], []);
        }).toThrowError('Invalid slotIndex 0. No transparent slots were detected in the selected frame.');
    });
    
    // ---
    // Catatan: Karena engine sangat bergantung pada Canvas API,
    // pengujian lengkap terhadap method "create" akan membutuhkan library seperti "canvas" (node-canvas).
    // Implementasi di bawah ini merupakan template skeleton untuk Canvas.
    // ---
    
    it('meng-set crossOrigin=anonymous (default) untuk URL http(s) agar tidak taint canvas', async () => {
        const created: any[] = [];

        global.Image = class {
            crossOrigin: string | null | undefined;
            onload: () => void = () => {};
            onerror: () => void = () => {};
            private _src = '';

            constructor() {
                created.push(this);
            }

            set src(v: string) {
                this._src = v;
                setTimeout(() => this.onload(), 0);
            }

            get src() {
                return this._src;
            }
        } as any;

        const img = await (engine as any).loadImage('https://cdn.example.com/frame.png');
        expect(img).toBe(created[0]);
        expect(created[0].crossOrigin).toBe('anonymous');
    });

    it('tidak meng-set crossOrigin bila config crossOrigin=null', async () => {
        const customEngine = new PhotoboothFrameGenerator({ crossOrigin: null });

        global.Image = class {
            crossOrigin: string | null | undefined;
            onload: () => void = () => {};
            onerror: () => void = () => {};
            set src(_: string) {
                setTimeout(() => this.onload(), 0);
            }
        } as any;

        const img = await (customEngine as any).loadImage('https://cdn.example.com/photo.jpg');
        expect((img as any).crossOrigin).toBeUndefined();
    });

    it('tidak meng-set crossOrigin untuk data: URL', async () => {
        global.Image = class {
            crossOrigin: string | null | undefined;
            onload: () => void = () => {};
            onerror: () => void = () => {};
            set src(_: string) {
                setTimeout(() => this.onload(), 0);
            }
        } as any;

        const img = await (engine as any).loadImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB');
        expect((img as any).crossOrigin).toBeUndefined();
    });
});
