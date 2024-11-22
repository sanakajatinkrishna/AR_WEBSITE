import React, { useState, useRef, useEffect, useCallback } from 'react';

const ARImageMatcher = () => {
  // ... (previous state and ref declarations remain the same)
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const matchVideoRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [showMatchVideo, setShowMatchVideo] = useState(false);
  const [matchPosition, setMatchPosition] = useState({ x: 50, y: 50 });
  const [hasUserInteraction, setHasUserInteraction] = useState(false);
  const lastMatchTime = useRef(0);
  const MATCH_TIMEOUT = 300;
  const MATCH_THRESHOLD = 70;

  const referenceImage = require('./assets/images/reference.jpg');
  const matchVideo = require('./assets/videos/match.mp4');

  // ... (previous utility functions remain the same)
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
    const blockSize = 32;
    const searchStep = 16; // Step size for searching
    const regionSize = 96; // Size of the region to compare
    
    let bestMatch = {
      score: 0,
      x: 0,
      y: 0
    };

    // Search through the image with overlapping regions
    for (let y = 0; y <= height - regionSize; y += searchStep) {
      for (let x = 0; x <= width - regionSize; x += searchStep) {
        let regionScore = 0;
        let totalPixels = 0;

        // Compare blocks within the region
        for (let by = 0; by < regionSize; by += blockSize) {
          for (let bx = 0; bx < regionSize; bx += blockSize) {
            let blockScore = 0;
            let blockPixels = 0;

            // Compare pixels within each block
            for (let py = 0; py < blockSize && (y + by + py) < height; py++) {
              for (let px = 0; px < blockSize && (x + bx + px) < width; px++) {
                const i = ((y + by + py) * width + (x + bx + px)) * 4;
                
                // Skip transparent pixels
                if (imgData1.data[i + 3] < 128 || imgData2.data[i + 3] < 128) continue;

                const r1 = imgData1.data[i];
                const g1 = imgData1.data[i + 1];
                const b1 = imgData1.data[i + 2];
                
                const r2 = imgData2.data[i];
                const g2 = imgData2.data[i + 1];
                const b2 = imgData2.data[i + 2];

                const hsv1 = rgbToHsv(r1, g1, b1);
                const hsv2 = rgbToHsv(r2, g2, b2);

                // Calculate color differences
                const hueDiff = Math.min(
                  Math.abs(hsv1[0] - hsv2[0]),
                  360 - Math.abs(hsv1[0] - hsv2[0])
                ) / 180;
                const satDiff = Math.abs(hsv1[1] - hsv2[1]) / 100;
                const valDiff = Math.abs(hsv1[2] - hsv2[2]) / 100;

                // Weight the differences
                const pixelScore = (
                  (1 - hueDiff) * 0.4 +
                  (1 - satDiff) * 0.3 +
                  (1 - valDiff) * 0.3
                );

                blockScore += pixelScore;
                blockPixels++;
              }
            }

            if (blockPixels > 0) {
              regionScore += blockScore / blockPixels;
              totalPixels++;
            }
          }
        }

        // Calculate final score for this region
        const normalizedScore = totalPixels > 0 
          ? (regionScore / totalPixels) * 100 
          : 0;

        // Update best match if this region has a better score
        if (normalizedScore > bestMatch.score) {
          bestMatch = {
            score: normalizedScore,
            x: (x + regionSize/2) / width * 100,
            y: (y + regionSize/2) / height * 100
          };
        }
      }
    }

    // Apply additional score normalization and constraints
    bestMatch.score = Math.min(100, Math.max(0, bestMatch.score));
    
    return bestMatch;
  }, []);

  // ... (rest of the component implementation remains the same)
  const playUnmutedVideo = async () => {
    if (matchVideoRef.current) {
      try {
        matchVideoRef.current.volume = 1;
        matchVideoRef.current.muted = false;
        await matchVideoRef.current.play();
      } catch (error) {
        console.error('Error playing video:', error);
        try {
          matchVideoRef.current.muted = true;
          await matchVideoRef.current.play();
          matchVideoRef.current.muted = false;
        } catch (fallbackError) {
          console.error('Fallback playback failed:', fallbackError);
        }
      }
    }
  };

  const handleUserInteraction = async () => {
    setHasUserInteraction(true);
    await startCamera();
  };

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

  const handleMatchState = useCallback((matchResult) => {
    const currentTime = Date.now();
    
    if (matchResult.score > MATCH_THRESHOLD) {
      lastMatchTime.current = currentTime;
      
      setMatchPosition({
        x: matchResult.x,
        y: matchResult.y
      });
      
      if (!showMatchVideo) {
        setShowMatchVideo(true);
        if (matchVideoRef.current) {
          matchVideoRef.current.currentTime = 0;
          playUnmutedVideo();
        }
      }
    } else if (showMatchVideo && (currentTime - lastMatchTime.current > MATCH_TIMEOUT)) {
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
      
      const matchResult = compareImages(capturedFrame, referenceData);
      setMatchScore(matchResult.score);
      handleMatchState(matchResult);
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
      
      <div style={{
        position: 'fixed',
        top: `${matchPosition.y}%`,
        left: `${matchPosition.x}%`,
        transform: 'translate(-50%, -50%)',
        width: '25%',
        aspectRatio: '16/9',
        opacity: showMatchVideo ? 1 : 0,
        visibility: showMatchVideo ? 'visible' : 'hidden',
        transition: 'all 0.3s ease-out',
        backgroundColor: 'black',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: showMatchVideo ? '0 8px 16px rgba(0, 0, 0, 0.2)' : 'none',
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
          controls={false}
          muted={false}
          autoPlay={false}
        />
      </div>

      <canvas
        ref={canvasRef}
        style={{ display: 'none' }}
      />
      
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        zIndex: 30
      }}>
        <button
          onClick={hasUserInteraction ? stopCamera : handleUserInteraction}
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
          {isStreaming ? "Stop Camera" : "Start Experience"}
        </button>
      </div>

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
          <h3 style={{ margin: 0, textAlign: 'center', fontSize: '1.2rem' }}>
            Match Score: {matchScore.toFixed(1)}%
            {matchScore > MATCH_THRESHOLD && 
              <span style={{ color: '#059669' }}> - Match Detected!</span>
            }
          </h3>
        </div>
      )}
    </div>
  );
};

export default ARImageMatcher;