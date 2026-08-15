# Automation engines

This directory no longer contains Firebase Cloud Functions and is not a Firebase deploy target.

The remaining files are CommonJS rule engines shared by the browser-side tests and by
`scripts/firebase-automation-worker.mjs`. Scheduled/background work runs through GitHub
Actions on the free automation worker, so the project does not require Firebase Blaze.
