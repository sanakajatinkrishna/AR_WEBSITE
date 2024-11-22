import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

const MultiARImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const matchVideoRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [showMatchVideo, setShowMatchVideo] = useState(false);
  const [hasUserInteraction, setHasUserInteraction] = useState(false);
  const [currentMatch, setCurrentMatch] = useState(null);
  const lastMatchTime = useRef(0);
  const MATCH_TIMEOUT = 300;
  const MATCH_THRESHOLD = 70;

  // Move contentPairs into useMemo to prevent unnecessary recreations
  const contentPairs = useMemo(() => [
    {
      id: '1',
      referenceImage: './assets/images/reference1.jpg',
      matchVideo: './assets/videos/match1.mp4',
      title: 'Match 1'
    },
    {
      id: '2',
      referenceImage: './assets/images/reference2.jpg',
      matchVideo: './assets/videos/match2.mp4',
      title: 'Match 2'
    },
    // Add more pairs as needed
  ], []); // Empty dependency array since this data is static

  useEffect(() => {
    if (matchVideoRef.current) {
      matchVideoRef.current.load();
      matchVideoRef.current.muted = false;
      matchVideoRef.current.setAttribute('playsinline', '');
      matchVideoRef.current.setAttribute('webkit-playsinline', '');
    }
  }, [currentMatch]);

  const rgbToHsv = useCallback((r, g, b) => {
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
  }, []);

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
  }, [rgbToHsv]);

  const findBestMatch = useCallback((capturedFrame, context) => {
    let bestMatch = null;
    let bestScore = 0;

    for (const pair of contentPairs) {
      const refImg = new Image();
      refImg.src = pair.referenceImage;
      
      context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      context.drawImage(refImg, 0, 0, canvasRef.current.width, canvasRef.current.height);
      const referenceData = context.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      const score = compareImages(capturedFrame, referenceData);
      
      if (score > MATCH_THRESHOLD && score > bestScore) {
        bestScore = score;
        bestMatch = { ...pair, score };
      }
    }

    return bestMatch;
  }, [compareImages, contentPairs, MATCH_THRESHOLD]);

  const playUnmutedVideo = useCallback(async () => {
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
  }, []);

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
      setCurrentMatch(null);
      if (matchVideoRef.current) {
        matchVideoRef.current.pause();
      }
    }
  }, []);

  const handleMatchState = useCallback((matchData) => {
    const currentTime = Date.now();
    
    if (matchData) {
      console.log('Match detected:', matchData.title, 'with score:', matchData.score);
      lastMatchTime.current = currentTime;
      
      if (!showMatchVideo || currentMatch?.id !== matchData.id) {
        setCurrentMatch(matchData);
        setShowMatchVideo(true);
        if (matchVideoRef.current) {
          matchVideoRef.current.src = matchData.matchVideo;
          matchVideoRef.current.currentTime = 0;
          playUnmutedVideo();
        }
      }
    } else if (showMatchVideo && (currentTime - lastMatchTime.current > MATCH_TIMEOUT)) {
      console.log('Match lost, stopping video');
      setShowMatchVideo(false);
      setCurrentMatch(null);
      if (matchVideoRef.current) {
        matchVideoRef.current.pause();
      }
    }
  }, [showMatchVideo, currentMatch, playUnmutedVideo, MATCH_TIMEOUT]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);

    const bestMatch = findBestMatch(capturedFrame, context);
    setMatchScore(bestMatch?.score || 0);
    handleMatchState(bestMatch);
  }, [findBestMatch, handleMatchState]);

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
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '25%',
        aspectRatio: '16/9',
        opacity: showMatchVideo ? 1 : 0,
        visibility: showMatchVideo ? 'visible' : 'hidden',
        transition: 'opacity 0.3s ease-in-out, visibility 0.3s ease-in-out',
        backgroundColor: 'black',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: showMatchVideo ? '0 8px 16px rgba(0, 0, 0, 0.2)' : 'none',
        zIndex: 20
      }}>
        <video
          ref={matchVideoRef}
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

      {matchScore !== null && currentMatch && (
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
            {currentMatch.title}: {matchScore.toFixed(1)}%
            {matchScore > MATCH_THRESHOLD && 
              <span style={{ color: '#059669' }}> - Match Detected!</span>
            }
          </h3>
        </div>
      )}
    </div>
  );
};

export default MultiARImageMatcher;