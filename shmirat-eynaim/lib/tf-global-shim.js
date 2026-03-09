// Expose faceapi.tf as the global 'tf' so coco-ssd UMD build can find its dependencies.
// Must be loaded after face-api.min.js but before coco-ssd.min.js.
if (typeof faceapi !== "undefined" && faceapi.tf) {
  self.tf = faceapi.tf;
}
