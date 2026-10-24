# Image to wall relief

The 3D viewer's Room Finishes panel has **Create relief from your image**.
Choose a JPEG/PNG/WebP under 8 MB, set 1–25 cm maximum relief, then upload.
When depth estimation finishes, select a full wall or mark a rectangular area and confirm to save.

The backend uses the pretrained [Depth Anything V2 Small](https://huggingface.co/depth-anything/Depth-Anything-V2-Small-hf) model locally. This integrates a pretrained model; it does not train a new model. The first inference downloads model weights. Uploaded images are not sent to Hugging Face: inference is local.

Install with `.venv311/bin/python -m pip install -r apps/backend/requirements-relief.txt`, then start `.venv311/bin/python -u apps/backend/src/train_server.py`.
POST `/api/wall-relief` accepts JSON `{ "image": "data:image/png;base64,..." }` and returns a compressed colour image, grayscale relative inverse-depth map, aspect ratio and model ID. Images are resized to at most 1536 pixels; depth is 512×288 and mapped using original aspect ratio. Invalid files and images larger than 24 megapixels are rejected. Original files are not stored on the backend. Selected generated assets are embedded in the saved room JSON; normal save-quota errors preserve the prior design.

**Preserve photo colours and lighting** uses the original photographed appearance on the displaced mesh. Turn it off to use a matte material affected by room lights. Photographed shadows/highlights cannot be perfectly separated from pigment from one image. The viewer light switch cannot turn off a photographed lamp or halo. Exact light reconstruction, undercuts and hidden anatomy are not supported. Depth is an estimate and can misinterpret shadows, shiny surfaces or complex backgrounds. Crop to a front-facing artwork rather than a whole room for best results. Depth is also scaled down for very small patches to avoid excessive protrusion.

Tests: `node --test apps/frontend/tests/customWallStyles.test.js apps/frontend/tests/wallMural.test.js` and `.venv311/bin/python -m unittest discover -s apps/backend/tests -p test_wall_relief.py`.
