import { PhotoboothFrameGenerator } from '../src/index';

const frameInput = document.getElementById('frame-input') as HTMLInputElement;
const photosInput = document.getElementById('photos-input') as HTMLInputElement;
const generateBtn = document.getElementById('generate-btn') as HTMLButtonElement;
const resultContainer = document.getElementById('result-container') as HTMLDivElement;
const slotExpansionInput = document.getElementById('slot-expansion') as HTMLInputElement;
const alphaThresholdInput = document.getElementById('alpha-threshold') as HTMLInputElement;
const minSlotSizeInput = document.getElementById('min-slot-size') as HTMLInputElement;
const outputFormatSelect = document.getElementById('output-format') as HTMLSelectElement;
const qualityInput = document.getElementById('quality') as HTMLInputElement;
const fillEmptyInput = document.getElementById('fill-empty') as HTMLInputElement;

// Detect Slots elements
const detectFrameInput = document.getElementById('detect-frame-input') as HTMLInputElement;
const detectBtn = document.getElementById('detect-btn') as HTMLButtonElement;
const detectResult = document.getElementById('detect-result') as HTMLDivElement;

// --- Detect Slots Only ---
detectBtn.addEventListener('click', async () => {
    if (!detectFrameInput.files || detectFrameInput.files.length === 0) {
        alert('Please select a frame image first.');
        return;
    }

    const engine = new PhotoboothFrameGenerator();

    try {
        detectBtn.disabled = true;
        detectBtn.textContent = 'Detecting...';

        const result = await engine.detectSlots(detectFrameInput.files[0]);

        let html = `<p><strong>${result.slots.length} slot(s) detected</strong> — Frame size: ${result.frameWidth}x${result.frameHeight}</p>`;
        html += '<table style="border-collapse:collapse; width:100%; margin-top:10px;">';
        html += '<tr><th style="border:1px solid #ccc; padding:6px;">#</th><th style="border:1px solid #ccc; padding:6px;">Center (cx, cy)</th><th style="border:1px solid #ccc; padding:6px;">Size (w x h)</th><th style="border:1px solid #ccc; padding:6px;">Angle (deg)</th></tr>';
        for (let i = 0; i < result.slots.length; i++) {
            const s = result.slots[i];
            const angleDeg = (s.angle * 180 / Math.PI).toFixed(1);
            html += `<tr><td style="border:1px solid #ccc; padding:6px;">${i + 1}</td>`;
            html += `<td style="border:1px solid #ccc; padding:6px;">(${s.cx.toFixed(1)}, ${s.cy.toFixed(1)})</td>`;
            html += `<td style="border:1px solid #ccc; padding:6px;">${s.width.toFixed(1)} x ${s.height.toFixed(1)}</td>`;
            html += `<td style="border:1px solid #ccc; padding:6px;">${angleDeg}°</td></tr>`;
        }
        html += '</table>';

        detectResult.innerHTML = html;

    } catch (error) {
        console.error('Error detecting slots:', error);
        alert('An error occurred. Check the console for details.');
    } finally {
        detectBtn.disabled = false;
        detectBtn.textContent = 'Detect Slots';
        engine.reset();
    }
});

// --- Generate with Photos ---

generateBtn.addEventListener('click', async () => {
    // Instantiate the engine with custom config dynamically
    const engine = new PhotoboothFrameGenerator({
        alphaThreshold: parseInt(alphaThresholdInput.value, 10) || 10,
        minSlotSize: parseInt(minSlotSizeInput.value, 10) || 50,
        outputFormat: outputFormatSelect.value as 'image/png' | 'image/jpeg' | 'image/webp',
        quality: parseFloat(qualityInput.value) || 0.95,
        fillEmptySlots: fillEmptyInput.checked,
        slotExpansion: parseInt(slotExpansionInput.value, 10) || 0
    });
    if (!frameInput.files || frameInput.files.length === 0) {
        alert('Please select a frame image first.');
        return;
    }

    if (!photosInput.files || photosInput.files.length === 0) {
        alert('Please select at least one photo.');
        return;
    }

    const frameFile = frameInput.files[0];
    const photoFiles = Array.from(photosInput.files);

    try {
        generateBtn.disabled = true;
        generateBtn.textContent = 'Processing...';

        // 1. Process the combination
        const result = await engine.create(frameFile, photoFiles);
        
        // 2. Display Result
        resultContainer.innerHTML = '<h3>Result:</h3>';
        
        const info = document.createElement('p');
        info.innerHTML = `<strong>Found ${result.slotsFound} slots</strong>. Size: ${result.width}x${result.height}`;
        resultContainer.appendChild(info);

        const img = document.createElement('img');
        img.src = result.dataUrl;
        resultContainer.appendChild(img);

    } catch (error) {
        console.error('Error generating photobooth image:', error);
        alert('An error occurred. Check the console for details.');
    } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate Result';
        
        // 3. Prevent memory leaks 
        engine.reset();
    }
});
