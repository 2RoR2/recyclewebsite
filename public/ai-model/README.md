# Free Browser Waste Model

Place a TensorFlow.js image classification model here to make camera AI detect the real project classes:

- `model.json`
- model weight shard files, for example `weights.bin` or `group1-shard1of1.bin`
- `metadata.json`

Recommended free workflow:

1. Open Google Teachable Machine.
2. Create an Image Project.
3. Train four classes named exactly:
   - Paper
   - Plastic
   - Aluminium
   - General Waste
4. Export the model as TensorFlow.js.
5. Put the exported files in this folder.

When these files exist, the app uses this custom model before the generic COCO-SSD fallback.
