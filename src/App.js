import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera } from 'lucide-react';

const ARMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const [isMatched, setIsMatched] = useState(false);
  const [matchPosition, setMatchPosition] = useState({ x: 0, y: 0 });

  const rgbToHsv = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    let h = 0;
    let s = max === 0 ? 0 : diff / max;
    let v = max;

    if (diff !== 0) {
      switch (max) {
        case r: h = 60 * ((g - b) / diff + (g < b ? 6 : 0)); break;
        case g: h = 60 * ((b - r) / diff + 2); break;
        case b: h = 60 * ((r - g) / diff + 4); break;
        default : h =0; break;
      }
    }
    return [h, s * 100, v * 100];
  };

  const compareImages = useCallback((imgData1, imgData2) => {
    const width = imgData1.width;
    const height = imgData1.height;
    const blockSize = 8;
    const hueWeight = 0.5;
    const satWeight = 0.3;
    const valWeight = 0.2;
    const hueTolerance = 30;
    const satTolerance = 30;
    const valTolerance = 30;
    
    let matchCount = 0;
    let totalBlocks = 0;

    for (let y = 0; y < height; y += blockSize) {
      for (let x = 0; x < width; x += blockSize) {
        let blockMatchSum = 0;
        let blockPixels = 0;

        for (let by = 0; by < blockSize && y + by < height; by++) {
          for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
            const i = ((y + by) * width + (x + bx)) * 4;
            
            const r1 = imgData1.data[i];
            const g1 = imgData1.data[i + 1];
            const b1 = imgData1.data[i + 2];
            
            const r2 = imgData2.data[i];
            const g2 = imgData2.data[i + 1];
            const b2 = imgData2.data[i + 2];

            const hsv1 = rgbToHsv(r1, g1, b1);
            const hsv2 = rgbToHsv(r2, g2, b2);

            const hueDiff = Math.abs(hsv1[0] - hsv2[0]);
            const satDiff = Math.abs(hsv1[1] - hsv2[1]);
            const valDiff = Math.abs(hsv1[2] - hsv2[2]);

            const hueMatch = (hueDiff <= hueTolerance || hueDiff >= 360 - hueTolerance) ? 1 : 0;
            const satMatch = satDiff <= satTolerance ? 1 : 0;
            const valMatch = valDiff <= valTolerance ? 1 : 0;

            const pixelMatchScore = 
              hueMatch * hueWeight +
              satMatch * satWeight +
              valMatch * valWeight;

            blockMatchSum += pixelMatchScore;
            blockPixels++;
          }
        }

        if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.6) {
          matchCount++;
        }
        totalBlocks++;
      }
    }

    return (matchCount / totalBlocks) * 100 * 1.5;
  }, []);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    const refImg = new Image();
    refImg.src = '/assets/model/model.jpg';
    
    refImg.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(refImg, 0, 0, canvas.width, canvas.height);
      const referenceData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      const score = compareImages(capturedFrame, referenceData);
      const matched = score > 70;

      if (matched) {
        const rect = video.getBoundingClientRect();
        setMatchPosition({
          x: rect.width / 2,
          y: rect.height / 2
        });
        setIsMatched(true);
        if (overlayVideoRef.current?.paused) {
          overlayVideoRef.current.play().catch(console.error);
        }
      } else {
        setIsMatched(false);
        overlayVideoRef.current?.pause();
      }
    };

    requestAnimationFrame(processFrame);
  }, [compareImages]);

  useEffect(() => {
    let stream = null;

    const initCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          processFrame();
        }
      } catch (err) {
        console.error("Camera error:", err);
      }
    };

    initCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [processFrame]);

  return (
    <div className="relative w-full h-screen bg-black">
      <video 
        ref={videoRef}
        autoPlay 
        playsInline
        muted 
        className="absolute top-0 left-0 w-full h-full object-cover"
      />
      
      <canvas 
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none"
        width="1280"
        height="720"
      />
      
      {isMatched && (
        <div 
          className="absolute transform -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg shadow-lg"
          style={{ 
            left: `${matchPosition.x}px`, 
            top: `${matchPosition.y}px`,
            width: '80vw',
            maxWidth: '500px',
            aspectRatio: '16/9'
          }}
        >
          <video
            ref={overlayVideoRef}
            autoPlay
            loop
            playsInline
            className="w-full h-full object-cover"
            src="/assets/model/Simulator Screen Recording - iPhone 15 - 2024-11-22 at 03.36.12o.mp4"
          />
        </div>
      )}

      <div className="absolute top-4 right-4 bg-white/10 p-3 rounded-lg backdrop-blur-sm">
        <Camera className="text-white" size={28} />
      </div>

      <div className="absolute bottom-4 left-4 bg-white/10 p-2 rounded-lg backdrop-blur-sm">
        <span className="text-white text-sm">
          {isMatched ? 'Match found' : 'Scanning...'}
        </span>
      </div>
    </div>
  );
};

export default ARMatcher;