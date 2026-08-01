# Fix receipt camera capture

## Goal
Make **Scan receipt** reliably open a usable camera flow on supported phones instead of silently doing nothing.

## Implementation
1. Replace the camera button’s reliance on the browser-dependent `capture="environment"` hint with an in-app camera view powered by the device media API.
2. Request the rear camera only after the user taps **Scan receipt**, show the live preview in the expense sheet, and provide clear **Capture**, **Retake**, and **Use photo** actions.
3. Convert the captured frame into the existing high-resolution receipt-processing pipeline so OCR quality and automatic amount/category filling continue to work.
4. Handle unavailable or denied camera access visibly instead of failing silently, with a **Choose photo instead** fallback that uses a genuine native file control.
5. Stop all camera tracks when the photo is captured, the camera is cancelled, or the expense sheet closes, preventing the camera from remaining active.

## Validation
- Verify the camera action enters the preview or shows a specific permission/unavailable message.
- Verify gallery upload still works as a fallback.
- Verify capture, retake, cancellation, sheet closure, and OCR loading/error states.
- Check the expense sheet at the current mobile viewport and confirm controls do not overlap.

## Technical note
The existing HTML `capture` attribute is only a browser hint and has limited cross-browser support. The new flow will use `navigator.mediaDevices.getUserMedia` for explicit camera access while retaining native file upload for unsupported or restricted environments.