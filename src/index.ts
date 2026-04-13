import { ImageSource, Slot, SlotPhotoAssignment, PhotoboothConfig, RenderResult, SlotDetectionResult } from './types';

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
            img.src = url;
        });
    }

    private convexHull(pts: {x: number, y: number}[]): {x: number, y: number}[] {
        pts.sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
        const cross = (o: {x: number, y: number}, a: {x: number, y: number}, b: {x: number, y: number}) => 
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const lower: {x: number, y: number}[] = [];
        for (let p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper: {x: number, y: number}[] = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            let p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        upper.pop();
        lower.pop();
        return lower.concat(upper);
    }

    private getMinimumBoundingBox(hull: {x: number, y: number}[]): Slot | null {
        if (hull.length === 0) return null;
        let minArea = Infinity;
        let best: Slot | null = null;

        for (let i = 0; i < hull.length; i++) {
            const p1 = hull[i];
            const p2 = hull[(i + 1) % hull.length];
            
            let edgeTheta = Math.atan2(p2.y - p1.y, p2.x - p1.x);
            
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            
            const cosT = Math.cos(-edgeTheta);
            const sinT = Math.sin(-edgeTheta);
            
            for (let p of hull) {
                let rx = p.x * cosT - p.y * sinT;
                let ry = p.x * sinT + p.y * cosT;
                if (rx < minX) minX = rx;
                if (rx > maxX) maxX = rx;
                if (ry < minY) minY = ry;
                if (ry > maxY) maxY = ry;
            }
            
            const w = maxX - minX;
            const h = maxY - minY;
            const area = w * h;
            
            if (area < minArea) {
                minArea = area;
                const cx_rot = minX + w / 2;
                const cy_rot = minY + h / 2;
                const r_cosT = Math.cos(edgeTheta);
                const r_sinT = Math.sin(edgeTheta);
                const cx = cx_rot * r_cosT - cy_rot * r_sinT;
                const cy = cx_rot * r_sinT + cy_rot * r_cosT;
                
                best = { cx, cy, width: w, height: h, angle: edgeTheta };
            }
        }
        
        if (best) {
            let { cx, cy, width, height, angle } = best;
            let deg = angle * (180 / Math.PI);
            deg = ((deg % 180) + 180) % 180; // [0, 180)
            
            if (deg > 45 && deg <= 135) {
                deg -= 90;
                const temp = width;
                width = height;
                height = temp;
            } else if (deg > 135) {
                deg -= 180;
            }
            
            best.angle = deg * (Math.PI / 180);
            best.width = width;
            best.height = height;
        }
        
        return best;
    }

    private findSlotsBFS(imageData: ImageData): Slot[] {
        const { width, height, data } = imageData;
        const visited = new Uint8Array(width * height);
        const slots: Slot[] = [];

        for (let i = 0; i < width * height; i++) {
            if (data[i * 4 + 3] < this.config.alphaThreshold && !visited[i]) {
                const queue: number[] = [i];
                visited[i] = 1;

                const boundary: {x: number, y: number}[] = [];
                let minX = i % width, maxX = minX;

                let head = 0;
                while (head < queue.length) {
                    const curr = queue[head++];
                    const cx = curr % width, cy = Math.floor(curr / width);

                    const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
                    let isBoundary = false;

                    for (const [nx, ny] of neighbors) {
                        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                            const nIdx = ny * width + nx;
                            if (data[nIdx * 4 + 3] < this.config.alphaThreshold) {
                                if (!visited[nIdx]) {
                                    visited[nIdx] = 1;
                                    queue.push(nIdx);
                                    if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
                                }
                            } else {
                                isBoundary = true;
                            }
                        } else {
                            isBoundary = true;
                        }
                    }

                    if (isBoundary) {
                        boundary.push({x: cx, y: cy});
                    }
                }
                
                if (maxX - minX > this.config.minSlotSize) {
                    const hull = this.convexHull(boundary);
                    const mbb = this.getMinimumBoundingBox(hull);
                    if (mbb) {
                        slots.push(mbb);
                    }
                }
            }
        }
        return slots.sort((a, b) => Math.round(a.cy - b.cy) || Math.round(a.cx - b.cx));
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
                throw new Error(`Invalid slotIndex ${assignment.slotIndex}. Expected a value between 0 and ${Math.max(slots.length - 1, 0)}.`);
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
}