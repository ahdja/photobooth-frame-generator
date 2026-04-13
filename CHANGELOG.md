# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

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