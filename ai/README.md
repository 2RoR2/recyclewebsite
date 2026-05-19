# EcoCycle Sarawak AI Waste Detection

This folder contains the Python AI service for the waste classification sensor.

## What It Does

- Receives an image from the website camera flow.
- Runs TensorFlow image classification.
- Returns detected object label, mapped bin category, confidence score, and presence status.
- The website compares the returned category with the selected active sensor zone: `Paper`, `Plastic`, `Aluminium`, or `General Waste`.

## Install

Use normal Windows Python 3.11 or 3.12. Do not use MSYS, Git Bash, MySQL, PostgreSQL, or pgAdmin bundled Python for TensorFlow.

```powershell
powershell -ExecutionPolicy Bypass -File ai\setup_windows_ai.ps1
```

## Run AI API

```powershell
powershell -ExecutionPolicy Bypass -File ai\run_api.ps1
```

The website calls:

```text
http://127.0.0.1:8000/detect-waste
```

## Train A Custom Model

The current project dataset is already set here:

```text
ai/datasets/
  paper/
  plastic/
  aluminium/
  general_waste/
```

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File ai\train_model.ps1
```

The script saves:

```text
ai/models/waste_classifier.keras
ai/models/class_names.json
```

For the best accuracy, collect images from your actual bin environment after the prototype bin is ready: same camera angle, lighting, background, and common rubbish items.

## Automated Retraining

When the local AI API is running, the website sends the selected camera-zone crop to:

```text
http://127.0.0.1:8000/collect-sample
```

Strong correct scans are saved into `ai/datasets/<category>/` and are used for future training. Uncertain or wrong scans are saved into `ai/review_samples/` so they can be checked manually without damaging model accuracy.

Run one automatic retraining check:

```powershell
npm run ai:auto-retrain
```

Keep retraining checks running in the background:

```powershell
npm run ai:auto-retrain:watch
```

By default, retraining starts only when every category has at least 20 images and the dataset has changed since the last retrain.
