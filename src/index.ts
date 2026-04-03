import { ImageSource, Slot, PhotoboothConfig, RenderResult } from './types';

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
        };
    }

    /**
     * Fungsi utama untuk memproses frame dan foto.
     * Mendukung input berupa Base64 string atau File object.
     */
    public async create(frameSource: ImageSource, userPhotos: ImageSource[]): Promise<RenderResult> {
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
            for (let i = 0; i < slots.length; i++) {
                let photoSource = userPhotos[i];

                // Jika fillEmptySlots true dan foto yang disuplai lebih sedikit dari slot
                if (!photoSource && this.config.fillEmptySlots && userPhotos.length > 0) {
                    photoSource = userPhotos[i % userPhotos.length];
                }

                if (photoSource) {
                    const photo = await this.loadImage(photoSource);
                    this.drawCover(ctx, photo, slots[i]);
                }
            }

            // Gambar frame (Layer atas)
            ctx.drawImage(frame, 0, 0);

            return {
                dataUrl: canvas.toDataURL(this.config.outputFormat, this.config.quality),
                slotsFound: slots.length,
                width: canvas.width,
                height: canvas.height
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
            img.src = url;
        });
    }

    private findSlotsBFS(imageData: ImageData): Slot[] {
        const { width, height, data } = imageData;
        const visited = new Uint8Array(width * height);
        const slots: Slot[] = [];

        for (let i = 0; i < width * height; i++) {
            if (data[i * 4 + 3] < this.config.alphaThreshold && !visited[i]) {
                const queue: number[] = [i];
                visited[i] = 1;
                let minX = i % width, maxX = minX, minY = Math.floor(i / width), maxY = minY;

                let head = 0;
                while (head < queue.length) {
                    const curr = queue[head++];
                    const cx = curr % width, cy = Math.floor(curr / width);

                    const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
                    for (const [nx, ny] of neighbors) {
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (!visited[nIdx] && data[nIdx * 4 + 3] < this.config.alphaThreshold) {
                                visited[nIdx] = 1;
                                queue.push(nIdx);
                                if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
                                if (ny < minY) minY = ny; if (ny > maxY) maxY = ny;
                            }
                        }
                    }
                }
                if (maxX - minX > this.config.minSlotSize) {
                    slots.push({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
                }
            }
        }
        return slots.sort((a, b) => (a.y - b.y) || (a.x - b.x));
    }

    private drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, slot: Slot): void {
        const expansion = this.config.slotExpansion;
        const targetX = slot.x - expansion;
        const targetY = slot.y - expansion;
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
        ctx.drawImage(img, sx, sy, sw, sh, targetX, targetY, targetW, targetH);
    }
}