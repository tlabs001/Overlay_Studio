export class CloudVisionClient {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async status() {
    const res = await fetch(`${this.baseUrl}/api/status`);
    if (!res.ok) {
      throw new Error('API status unavailable');
    }
    return res.json();
  }

  async setKey(apiKey) {
    const res = await fetch(`${this.baseUrl}/api/key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      throw new Error('Failed to save API key');
    }
    return res.json();
  }

  async toSmallJpegDataUrl(imgEl, maxSide = 768, quality = 0.9) {
    if (!imgEl) throw new Error('Missing image');
    const width = imgEl.naturalWidth || imgEl.width || 1;
    const height = imgEl.naturalHeight || imgEl.height || 1;
    const maxDim = Math.max(width, height) || 1;
    const scale = Math.min(1, maxSide / maxDim);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL('image/jpeg', quality);
  }

  async detectFaceKeypoints(referenceImgEl, drawingImgEl) {
    const refSmall = await this.toSmallJpegDataUrl(referenceImgEl);
    const drawSmall = await this.toSmallJpegDataUrl(drawingImgEl);
    const res = await fetch(`${this.baseUrl}/api/face-keypoints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referenceDataUrl: refSmall, drawingDataUrl: drawSmall }),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return res.json();
  }
}
