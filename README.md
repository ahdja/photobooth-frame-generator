# Photobooth Frame Generator

A fast and efficient TypeScript engine to automate placing user photos into a template frame's transparent slots. It analyzes the alpha channel of the frame to dynamically find transparent "slots" and creatively paints the user's photos underneath those areas.

## Features

- **Dynamic Slot Detection**: Automatically finds empty (transparent) slots in a template frame using Breadth-First Search (BFS).
- **Slot Coordinate Detection**: Get slot positions without uploading photos — useful for previewing layouts or building custom UIs.
- **Auto Cover/Crop**: Intelligently fits your photos into the detected slots, preserving the aspect ratio (similar to `object-fit: cover`).
- **Memory Management**: Includes a `reset()` method to free memory by revoking File object URLs and hinting garbage collection.
- **Browser Ready**: Uses the HTML5 Canvas API and `ImageData` for fast, client-side processing.

## Installation

```sh
npm install @kotaksurat/photobooth-frame-generator
```

## Basic Usage

The engine supports inputs as `File` objects or `Base64` data URLs.

```typescript
import { PhotoboothFrameGenerator } from 'photobooth-frame-generator';

// 1. Initialize the engine
const engine = new PhotoboothFrameGenerator({
    outputFormat: 'image/jpeg',
    quality: 0.95
});

async function processPhotos(frameFile: File, userPhotos: File[]) {
    try {
        // 2. Generate the result
        const result = await engine.create(frameFile, userPhotos);
        
        console.log(`Generated image with ${result.slotsFound} slots!`);
        
        // Use result.dataUrl as the src for an HTML Image element
        const img = new Image();
        img.src = result.dataUrl;
        document.body.appendChild(img);
        
    } catch (error) {
        console.error('Processing failed:', error);
    } finally {
        // 3. Clean up memory to avoid blobs piling up
        engine.reset();
    }
}
```

## Detect Slots Only

Use `detectSlots()` to get slot coordinates without needing user photos. Useful for previewing slot layouts or building custom photo placement UIs.

```typescript
import { PhotoboothFrameGenerator } from 'photobooth-frame-generator';

const engine = new PhotoboothFrameGenerator();

const result = await engine.detectSlots(frameImage);

console.log(`Frame: ${result.frameWidth}x${result.frameHeight}`);
console.log(`Found ${result.slots.length} slot(s):`);

result.slots.forEach((slot, i) => {
    console.log(`  Slot ${i + 1}: center (${slot.cx.toFixed(1)}, ${slot.cy.toFixed(1)}), ` +
                `size ${slot.width.toFixed(1)}x${slot.height.toFixed(1)}, ` +
                `angle ${(slot.angle * 180 / Math.PI).toFixed(1)}°`);
});

engine.reset();
```

Each `Slot` contains:

| Property | Type | Description |
|----------|------|-------------|
| `cx` | `number` | Center X coordinate in pixels |
| `cy` | `number` | Center Y coordinate in pixels |
| `width` | `number` | Bounding box width in pixels |
| `height` | `number` | Bounding box height in pixels |
| `angle` | `number` | Rotation angle in radians |

## Configuration

When instantiating `PhotoboothFrameGenerator`, you can pass an optional configuration object:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `alphaThreshold` | `number` | `10` | The alpha channel threshold (0-255) below which a pixel is considered transparent. |
| `minSlotSize` | `number` | `50` | Minimum width/height in pixels to be considered a valid slot (avoids micro-artifacts being selected). |
| `outputFormat` | `string` | `'image/png'` | The mime type of the generated image (`image/png`, `image/jpeg`, `image/webp`). |
| `quality` | `number` | `0.92` | The image quality from `0.0` to `1.0` (applicable for jpeg/webp formats). |
| `fillEmptySlots` | `boolean` | `true` | If true, intelligently loops through provided photos to fill any remaining empty frame slots. |
| `slotExpansion` | `number` | `5` | Expansion in pixels added to each detected slot's edges to cover anti-aliased transparency gaps. |

## How It Works
1. **Load Assets:** Internally converts `File` objects to blob URLs to be drawn onto a virtual canvas.
2. **Scan Alpha:** Performs a BFS scan over the `ImageData` to locate contiguous transparent regions (alpha < `alphaThreshold`).
3. **Convex Hull & Bounding Box:** Computes the convex hull of each region's boundary, then finds the minimum rotated bounding box for accurate slot positioning.
4. **Sort Slots:** Sorts detected regions topologically (top-to-bottom, left-to-right).
5. **Draw Composition:** Draws the user photos onto the base layer positioned in the slots, and places the original frame natively as the top layer.

## Packages & Dependencies Used

This engine is lightweight and utilizes standard browser APIs internally, but relies on a few core packages for development:

- **`typescript` & `@types/node`**: Enables strict static typings and smooth transpilation from `src/` to a publishable package.
- **`vitest`**: A modern and extremely fast test runner tailored for TypeScript and built natively around Vite syntax.
- **`jsdom`**: Used alongside Vitest to seamlessly mock essential HTML5 Browser environments (like `URL` & partial native APIs) during runtime testing.

## Running the Example

We have provided a demo implementation showcasing how the package works in action globally.
You can find it under the `example/` directory. 

To serve and test the example in your browser, run:
```sh
npx vite dev example
```
1. Open the local link (e.g., `http://localhost:5173/`) in the browser.
2. **Detect Slots Only**: Upload a frame image and click "Detect Slots" to view slot coordinates in a table.
3. **Generate with Photos**: Under "Select Frame", upload a `PNG` containing transparent rectangular slots. Under "Select Photos", choose your images. Hit **Generate Result** to fetch the composed canvas snapshot.

## Running Tests

We implement unit tests focusing on robust config parsers and safe memory resetting tools using `vitest`.

To execute the entire test suite, make sure you have installed standard modules with `npm install`, then run:
```sh
npm run test
```
This will discover scripts inside the `test/` directory using the `vitest.config.ts` rules, executing assertions efficiently on the JSDOM mock environment.
