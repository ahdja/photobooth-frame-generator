import { ImageSource, Slot, SlotPhotoAssignment, PhotoboothConfig, RenderResult, SlotDetectionResult } from './types';
import { detectSlotsFromImageData } from './detect';

export { detectSlotsFromImageData, toCatalogSlots } from './detect';
export type { CatalogSlot, DetectOptions } from './types';

export type { ImageSource, Slot, SlotPhotoAssignment, PhotoboothConfig, RenderResult, SlotDetectionResult } from './types';

export class PhotoboothFrameGenerator {
    private config: Required<PhotoboothConfig>;
    private objectUrls: string[] = []; // Track untuk manajemen memori

    constructor(config?: PhotoboothConfig) {
        this.config = {
            alphaThreshold: config?.alphaThreshold ?? 10,
            minSlotSize: config?.minSlotSize ?? 50,
            outputFormat: config?.outputFormat ?? 'image/png',
            quality: config?.quality ?? 0.92,
            fillEmptySlots: config?.fillEmptySlots ?? true,
            slotExpansion: config?.slotExpansion ?? 5,
            crossOrigin: config?.crossOrigin !== undefined ? config.crossOrigin : 'anonymous',
        };
    }

    /**
     * Fungsi utama untuk memproses frame dan foto.
     * Mendukung input berupa Base64 string atau File object.
     */
    public async create(frameSource: ImageSource, userPhotos: ImageSource[]): Promise<RenderResult> {
        return this.render(frameSource, [], userPhotos);
    }

    /**
     * Mengisi slot tertentu dengan assignment eksplisit,
     * sambil tetap mendukung foto fallback untuk slot sisanya.
     */
    public async createWithAssignments(
        frameSource: ImageSource,
        assignments: SlotPhotoAssignment[],
        fallbackPhotos: ImageSource[] = []
    ): Promise<RenderResult> {
        return this.render(frameSource, assignments, fallbackPhotos);
    }

    private async render(
        frameSource: ImageSource,
        assignments: SlotPhotoAssignment[],
        fallbackPhotos: ImageSource[]
    ): Promise<RenderResult> {
        try {
            const frame = await this.loadImage(frameSource);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error("Canvas context 2D not found");

            canvas.width = frame.width;
            canvas.height = frame.height;

            // 1. Deteksi Slot
            ctx.drawImage(frame, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const slots = this.findSlotsBFS(imageData);

            // 2. Render Final
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Gambar foto user (Layer bawah)
            const slotPhotos = this.resolveSlotPhotos(slots, assignments, fallbackPhotos);

            for (let i = 0; i < slots.length; i++) {
                const photoSource = slotPhotos[i];

                if (photoSource) {
                    const photo = await this.loadImage(photoSource);
                    this.drawCover(ctx, photo, slots[i]);
                }
            }

            // Gambar frame (Layer atas)
            ctx.drawImage(frame, 0, 0);

            let dataUrl: string;
            try {
                dataUrl = canvas.toDataURL(this.config.outputFormat, this.config.quality);
            } catch (error) {
                // Biasanya DOMException: Tainted canvases may not be exported (CORS)
                throw new Error(
                    `Failed to export canvas (likely CORS/tainted canvas). ` +
                    `If you pass image URLs, ensure the image host allows CORS (Access-Control-Allow-Origin) ` +
                    `and keep crossOrigin='anonymous' (default), or use same-origin / File / data URL sources. ` +
                    `Original error: ${error}`
                );
            }

            return {
                dataUrl,
                slotsFound: slots.length,
                width: canvas.width,
                height: canvas.height
            };
        } catch (error) {
            throw new Error(`PhotoboothFrameGenerator Error: ${error}`);
        }
    }

    /**
     * Mendeteksi slot pada frame tanpa memerlukan foto user.
     * Mengembalikan koordinat slot yang ditemukan.
     */
    public async detectSlots(frameSource: ImageSource): Promise<SlotDetectionResult> {
        try {
            const frame = await this.loadImage(frameSource);

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) throw new Error("Canvas context 2D not found");

            canvas.width = frame.width;
            canvas.height = frame.height;

            ctx.drawImage(frame, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const slots = this.findSlotsBFS(imageData);

            return {
                slots,
                frameWidth: frame.width,
                frameHeight: frame.height
            };
        } catch (error) {
            throw new Error(`PhotoboothFrameGenerator Error: ${error}`);
        }
    }

    /**
     * Fungsi Reset untuk Manajemen Memori.
     * WAJIB dipanggil setelah proses selesai atau saat komponen di-unmount.
     */
    public reset(): void {
        // Revoke semua Object URL yang dibuat dari File untuk mengosongkan RAM
        this.objectUrls.forEach(url => URL.revokeObjectURL(url));
        this.objectUrls = [];

        // Memberi sinyal ke GC bahwa referensi bisa dihapus
        console.log("PhotoboothFrameGenerator: Memory cleared.");
    }

    private async loadImage(source: ImageSource): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            let url: string;

            if (source instanceof File) {
                url = URL.createObjectURL(source);
                this.objectUrls.push(url); // Simpan untuk di-reset nanti
            } else {
                url = source; // Base64 atau URL string
            }

            img.onload = () => resolve(img);
            img.onerror = () => reject("Failed to load image source");

            // Hindari canvas jadi "tainted" saat mengambil gambar dari URL lintas-origin.
            // Untuk data/blob URL, crossOrigin tidak relevan.
            if (!(source instanceof File) && this.config.crossOrigin !== null) {
                const isDataOrBlobUrl = url.startsWith('data:') || url.startsWith('blob:');
                if (!isDataOrBlobUrl) {
                    img.crossOrigin = this.config.crossOrigin;
                }
            }
            img.src = url;
        });
    }

    /**
     * Runs the pure detector with this instance's alphaThreshold/minSlotSize.
     * @returns raw slots (radians, floats) sorted by row band then x
     */
    private findSlotsBFS(imageData: ImageData): Slot[] {
        return detectSlotsFromImageData(imageData.data, imageData.width, imageData.height, {
            alphaThreshold: this.config.alphaThreshold,
            minSlotSize: this.config.minSlotSize,
        });
    }

    private drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, slot: Slot): void {
        const expansion = this.config.slotExpansion;
        
        const targetW = slot.width + (expansion * 2);
        const targetH = slot.height + (expansion * 2);

        const imgRatio = img.width / img.height;
        const slotRatio = targetW / targetH;
        let sw, sh, sx, sy;

        if (imgRatio > slotRatio) {
            sw = img.height * slotRatio; sh = img.height;
            sx = (img.width - sw) / 2; sy = 0;
        } else {
            sw = img.width; sh = img.width / slotRatio;
            sx = 0; sy = (img.height - sh) / 2;
        }
        
        ctx.save();
        ctx.translate(slot.cx, slot.cy);
        ctx.rotate(slot.angle);
        ctx.drawImage(img, sx, sy, sw, sh, -targetW / 2, -targetH / 2, targetW, targetH);
        ctx.restore();
    }

    private resolveSlotPhotos(
        slots: Slot[],
        assignments: SlotPhotoAssignment[],
        fallbackPhotos: ImageSource[]
    ): Array<ImageSource | undefined> {
        const resolvedPhotos: Array<ImageSource | undefined> = new Array(slots.length).fill(undefined);
        
        for (const assignment of assignments) {
            if (!Number.isInteger(assignment.slotIndex) || assignment.slotIndex < 0 || assignment.slotIndex >= slots.length) {
                throw new Error(this.getInvalidSlotIndexMessage(assignment.slotIndex, slots.length));
            }

            resolvedPhotos[assignment.slotIndex] = assignment.photo;
        }

        let sequentialIndex = 0;

        for (let i = 0; i < resolvedPhotos.length; i++) {
            if (resolvedPhotos[i]) {
                continue;
            }

            if (sequentialIndex < fallbackPhotos.length) {
                resolvedPhotos[i] = fallbackPhotos[sequentialIndex++];
                continue;
            }

            if (this.config.fillEmptySlots && fallbackPhotos.length > 0) {
                resolvedPhotos[i] = fallbackPhotos[i % fallbackPhotos.length];
            }
        }

        return resolvedPhotos;
    }

    private getInvalidSlotIndexMessage(slotIndex: number, slotCount: number): string {
        if (slotCount === 0) {
            return `Invalid slotIndex ${slotIndex}. No transparent slots were detected in the selected frame.`;
        }

        return `Invalid slotIndex ${slotIndex}. Only ${slotCount} slot(s) were detected, so the valid range is 0 to ${slotCount - 1}.`;
    }
}
