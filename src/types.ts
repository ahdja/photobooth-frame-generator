export type ImageSource = string | File; // Bisa Base64, URL, atau File Object

export interface SlotPhotoAssignment {
    slotIndex: number;
    photo: ImageSource;
}

export interface Slot {
    cx: number;
    cy: number;
    width: number;
    height: number;
    angle: number;
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

export interface SlotDetectionResult {
    slots: Slot[];
    frameWidth: number;
    frameHeight: number;
}