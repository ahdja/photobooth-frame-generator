# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

## [1.2.0] - 2026-11-08

### Added
- `detectSlotsFromImageData(data, width, height, { alphaThreshold, minSlotSize })`: pure slot detection on RGBA bytes (no canvas, works in Node, workers and tests).
- `toCatalogSlots(slots, expansion)`: converts raw slots to the vlor catalog format (integer px, angle in degrees clockwise, `radius: 0`, `round: false`). `expansion` is total growth per axis (half per side).
- Parity tests against fixtures produced by the vlor Go detector (`test/fixtures`).

### Changed
- Detection now requires the region bbox to reach `minSlotSize` on BOTH sides (was width only, with an off-by-one), so thin strips are no longer reported as slots.
- Slot order is now row band (`top / max(1, height/20)`) then x, instead of exact rounded `cy` then `cx`, so slots on one visual row stay left to right.
- Slot width/height now cover the full pixel extent (+1 px; previously measured between pixel centres).
- `PhotoboothFrameGenerator` uses the same pure function internally; `detectSlots()` still returns raw slots (radians) so rendering is unchanged apart from the points above.

## [1.1.1] - 2026-04-14

### Added
- Added example page controls for trying explicit slot assignment rendering.
- Added a test for the no-transparent-slot validation path.

### Changed
- Improved slot assignment error messages to explain when a frame has no detected slots or when the requested index is out of range.
- Added example-side validation before rendering assigned slots so invalid slot indices fail fast with clearer feedback.

## [1.1.0] - 2026-04-14

### Added
- Added `createWithAssignments(frameSource, assignments, fallbackPhotos?)` for explicit slot-based photo placement.
- Added exported `SlotPhotoAssignment` type for assignment-based rendering.
- Added tests covering explicit slot assignment, fallback filling, and out-of-range validation.
- Added README examples and behavior notes for optional fallback photos and transparent empty slots.

### Changed
- Kept `create(frameSource, userPhotos)` focused on sequential slot filling for a clearer public API split.
- Bumped package version from `1.0.4` to `1.1.0`.

## [1.0.4] - 2026-04-14

### Added
- Existing baseline release before versioned changelog tracking.
- Core photobooth generation with dynamic transparent slot detection.
- `detectSlots()` for frame slot inspection without rendering user photos.
- Configurable output format, quality, slot expansion, and memory reset support.