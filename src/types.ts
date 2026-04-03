export type ImageSource = string | File; // Bisa Base64, URL, atau File Object

export interface Slot {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PhotoboothConfig {
    alphaThreshold?: number;
    minSlotSize?: number;
    outputFormat?: 'image/png' | 'image/jpeg' | 'image/webp';
    quality?: number;
    fillEmptySlots?: boolean;
    slotExpansion?: number;
}

export interface RenderResult {
    dataUrl: string;
    slotsFound: number;
    width: number;
    height: number;
}