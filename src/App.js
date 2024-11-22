import React, { useState, useRef, useEffect, useCallback } from 'react';

const ARImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const matchVideoRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [showMatchVideo, setShowMatchVideo] = useState(false);
  const lastMatchTime = useRef(0);
  const MATCH_TIMEOUT = 300; // Reduced timeout for faster response
  const MATCH_THRESHOLD = 80;

  const referenceImage = require('./assets/images/reference.jpg');
  const matchVideo = require('./assets/videos/match.mp4');

  // Initialize video when component mounts
  useEffect(() => {
    if (matchVideoRef.current) {
      matchVideoRef.current.load();
    }
  }, []);

  const rgbToHsv = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    let s = max === 0 ? 0 : diff / max;
    let v = max;

    if (diff !== 0) {
      switch (max) {
        case r:
          h = 60 * ((g - b) / diff + (g < b ? 6 : 0));
          break;
        case g:
          h = 60 * ((b - r) / diff + 2);
          break;
        case b:
          h = 60 * ((r - g) / diff + 4);
          break;
        default:
          break;
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

    return Math.min(100, (matchCount / totalBlocks) * 100 * 1.5);
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsStreaming(true);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
    }
  };

  const stopCamera = useCallback(() => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setIsStreaming(false);
      setShowMatchVideo(false);
      if (matchVideoRef.current) {
        matchVideoRef.current.pause();
      }
    }
  }, []);

  const handleMatchState = useCallback((score) => {
    const currentTime = Date.now();
    
    if (score > MATCH_THRESHOLD) {
      console.log('Match detected with score:', score);
      lastMatchTime.current = currentTime;
      
      if (!showMatchVideo) {
        console.log('Starting video playback');
        setShowMatchVideo(true);
        
        if (matchVideoRef.current) {
          matchVideoRef.current.currentTime = 0;
          const playPromise = matchVideoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.then(() => {
              console.log('Video playing successfully');
            }).catch(error => {
              console.error('Error playing video:', error);
            });
          }
        }
      }
    } else if (showMatchVideo && (currentTime - lastMatchTime.current > MATCH_TIMEOUT)) {
      console.log('Match lost, stopping video');
      setShowMatchVideo(false);
      if (matchVideoRef.current) {
        matchVideoRef.current.pause();
      }
    }
  }, [showMatchVideo]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    const refImg = new Image();
    refImg.src = referenceImage;
    
    refImg.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(refImg, 0, 0, canvas.width, canvas.height);
      const referenceData = context.getImageData(0, 0, canvas.width, canvas.height);
      
      const score = compareImages(capturedFrame, referenceData);
      setMatchScore(score);
      handleMatchState(score);
    };
  }, [compareImages, handleMatchState, referenceImage]);

  useEffect(() => {
    let intervalId;
    if (isStreaming) {
      intervalId = setInterval(captureFrame, 100);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isStreaming, captureFrame]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      overflow: 'hidden'
    }}>
      {/* Camera Feed */}
      <video
        ref={videoRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
        autoPlay
        playsInline
      />
      
      {/* Match Video Overlay */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '30%', // Smaller size
        aspectRatio: '16/9',
        opacity: showMatchVideo ? 1 : 0,
        transition: 'opacity 0.3s ease-in-out',
        backgroundColor: 'black',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: showMatchVideo ? '0 4px 6px rgba(0, 0, 0, 0.1)' : 'none',
        zIndex: 20
      }}>
        <video
          ref={matchVideoRef}
          src={matchVideo}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain'
          }}
          playsInline
          loop
          muted={false}
          controls={false}
          onError={(e) => console.error('Video error:', e)}
        />
      </div>

      {/* Hidden Canvas for Image Processing */}
      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />
      
      {/* Controls */}
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        zIndex: 30
      }}>
        <button
          onClick={isStreaming ? stopCamera : startCamera}
          style={{
            padding: '8px 16px',
            backgroundColor: isStreaming ? '#dc2626' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          {isStreaming ? "Stop Camera" : "Start Camera"}
        </button>
      </div>

      {/* Match Score Display */}
      {matchScore !== null && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '20px',
          right: '20px',
          padding: '16px',
          backgroundColor: 'rgba(243, 244, 246, 0.8)',
          borderRadius: '8px',
          zIndex: 30
        }}>
          <h3 style={{ margin: 0, textAlign: 'center' }}>
            Match Score: {matchScore.toFixed(1)}%
            {matchScore > MATCH_THRESHOLD && " - Match Detected!"}
          </h3>
        </div>
      )}
    </div>
  );
};

export default ARImageMatcher;