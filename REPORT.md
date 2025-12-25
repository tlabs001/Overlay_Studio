# Overlay image load regression report

## Summary
Users can select or drop image files and see the thumbnail tiles mark as populated, but the primary overlay canvas never displays the uploaded images. Sampling the canvas pixels after an upload shows a fully transparent surface, so the render pipeline is clearing the canvas and exiting without compositing any image layers.

## Reproduction
1. Start the static server (e.g., `python -m http.server 3000`) and open the app.
2. Upload any image files for both the reference and drawing inputs.
3. Note that the placeholder disappears and the thumbnail tiles gain the `has-image` class, confirming the upload handlers ran.
4. The main canvas remains empty; reading pixel data from the center of `#overlayCanvas` returns `[0, 0, 0, 0]`, confirming nothing was drawn.

## Findings
- The upload workflow calls `handleImageUpload`, which successfully loads the file, populates thumbnails, and invokes `canvasManager.render()` after setting `referenceImage`/`drawingImage` on the manager instance.【F:src/app.js†L214-L236】
- `CanvasManager.render` clears the canvas and immediately returns if it believes no images are present (`baseImage` falsy).【F:src/components/CanvasManager.js†L2113-L2145】 Because the thumbnails update while the canvas stays transparent, the manager state seen by `render` is not retaining the uploaded images when the draw happens.
- Pixel inspection after uploads shows the canvas surface is untouched, which matches the early-return path in `render` that bails when `referenceImage`/`drawingImage` are missing. This indicates a state disconnect between the upload handlers and the canvas renderer rather than a file-read failure.

## Impact
Users cannot view the images they upload in the overlay area, preventing all overlay, alignment, and analysis tools from functioning.
