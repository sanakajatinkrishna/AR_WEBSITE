import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

const MultiARImageMatcher = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const debugCanvasRef = useRef(null);
  const matchVideoRef = useRef(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [matchScore, setMatchScore] = useState(null);
  const [showMatchVideo, setShowMatchVideo] = useState(false);
  const [hasUserInteraction, setHasUserInteraction] = useState(false);
  const [currentMatch, setCurrentMatch] = useState(null);
  const [debugMode, setDebugMode] = useState(false);
  const lastMatchTime = useRef(0);
  const MATCH_TIMEOUT = 300;
  const MATCH_THRESHOLD = 50; // Lowered threshold for easier matching

  // Define content pairs
  const contentPairs = useMemo(() => [
    {
      id: '1',
      referenceImage: '/assets/images/reference1.jpg',
      matchVideo: '/assets/videos/match1.mp4',
      title: 'Match 1'
    },
    {
      id: '2',
      referenceImage: '/assets/images/reference2.jpg',
      matchVideo: '/assets/videos/match2.mp4',
      title: 'Match 2'
    }
  ], []);

  // Simple feature extraction - average color in grid cells
  const extractFeatures = useCallback((imageData, gridSize = 8) => {
    const { width, height, data } = imageData;
    const cellWidth = Math.floor(width / gridSize);
    const cellHeight = Math.floor(height / gridSize);
    const features = [];

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        let r = 0, g = 0, b = 0, count = 0;
        
        for (let cy = y * cellHeight; cy < (y + 1) * cellHeight && cy < height; cy++) {
          for (let cx = x * cellWidth; cx < (x + 1) * cellWidth && cx < width; cx++) {
            const i = (cy * width + cx) * 4;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
          }
        }

        features.push({
          r: r / count,
          g: g / count,
          b: b / count
        });
      }
    }

    return features;
  }, []);

  // Compare features between two images
  const compareFeatures = useCallback((features1, features2) => {
    if (features1.length !== features2.length) return 0;
    
    let totalDiff = 0;
    const maxDiff = Math.sqrt(3 * 255 * 255); // Maximum possible difference per cell

    features1.forEach((f1, i) => {
      const f2 = features2[i];
      const rDiff = f1.r - f2.r;
      const gDiff = f1.g - f2.g;
      const bDiff = f1.b - f2.b;
      const diff = Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
      totalDiff += 1 - (diff / maxDiff);
    });

    return (totalDiff / features1.length) * 100;
  }, []);

  // Draw debug visualization
  const drawDebug = useCallback((capturedFeatures, referenceFeatures, context, width, height) => {
    const gridSize = 8;
    const cellWidth = Math.floor(width / gridSize);
    const cellHeight = Math.floor(height / gridSize);

    context.clearRect(0, 0, width, height);

    capturedFeatures.forEach((feature, i) => {
      const x = (i % gridSize) * cellWidth;
      const y = Math.floor(i / gridSize) * cellHeight;
      const refFeature = referenceFeatures[i];

      // Draw captured feature
      context.fillStyle = `rgb(${feature.r},${feature.g},${feature.b})`;
      context.fillRect(x, y, cellWidth/2, cellHeight);

      // Draw reference feature
      context.fillStyle = `rgb(${refFeature.r},${refFeature.g},${refFeature.b})`;
      context.fillRect(x + cellWidth/2, y, cellWidth/2, cellHeight);
    });
  }, []);

  const findBestMatch = useCallback((capturedFrame, context) => {
    let bestMatch = null;
    let bestScore = 0;

    // Extract features from captured frame
    const capturedFeatures = extractFeatures(capturedFrame);

    // Create temp canvas for processing reference images
    const tempCanvas = document.createElement('canvas');
    const tempContext = tempCanvas.getContext('2d');
    tempCanvas.width = capturedFrame.width;
    tempCanvas.height = capturedFrame.height;

    for (const pair of contentPairs) {
      const img = new Image();
      img.src = pair.referenceImage;

      tempContext.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      tempContext.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
      const referenceFrame = tempContext.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      const referenceFeatures = extractFeatures(referenceFrame);
      
      const score = compareFeatures(capturedFeatures, referenceFeatures);
      console.log(`Match score for ${pair.title}:`, score);

      if (score > MATCH_THRESHOLD && score > bestScore) {
        bestScore = score;
        bestMatch = { ...pair, score };

        // Update debug visualization if debug mode is on
        if (debugMode && debugCanvasRef.current) {
          const debugContext = debugCanvasRef.current.getContext('2d');
          drawDebug(capturedFeatures, referenceFeatures, debugContext, capturedFrame.width, capturedFrame.height);
        }
      }
    }

    return bestMatch;
  }, [extractFeatures, compareFeatures, contentPairs, MATCH_THRESHOLD, debugMode, drawDebug]);

  const playUnmutedVideo = useCallback(async () => {
    if (matchVideoRef.current) {
      try {
        matchVideoRef.current.volume = 1;
        matchVideoRef.current.muted = false;
        await matchVideoRef.current.play();
        console.log('Video started playing with sound');
      } catch (error) {
        console.error('Error playing video:', error);
        try {
          matchVideoRef.current.muted = true;
          await matchVideoRef.current.play();
          matchVideoRef.current.muted = false;
          console.log('Video playing after fallback');
        } catch (fallbackError) {
          console.error('Fallback playback failed:', fallbackError);
        }
      }
    }
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

  const handleUserInteraction = async () => {
    setHasUserInteraction(true);
    await startCamera();
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
  }, [showMatchVideo, currentMatch, playUnmutedVideo]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (debugCanvasRef.current) {
      debugCanvasRef.current.width = video.videoWidth;
      debugCanvasRef.current.height = video.videoHeight;
    }

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

      {debugMode && (
        <canvas
          ref={debugCanvasRef}
          style={{
            position: 'fixed',
            bottom: '80px',
            right: '20px',
            width: '200px',
            height: '150px',
            border: '2px solid white',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 30
          }}
        />
      )}
      
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        zIndex: 30,
        display: 'flex',
        gap: '10px'
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
        <button
          onClick={() => setDebugMode(!debugMode)}
          style={{
            padding: '8px 16px',
            backgroundColor: debugMode ? '#059669' : '#6b7280',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: '500'
          }}
        >
          Debug Mode: {debugMode ? 'ON' : 'OFF'}
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
            {currentMatch ? `${currentMatch.title}: ${matchScore.toFixed(1)}%` : `No match: ${matchScore.toFixed(1)}%`}
            {matchScore > MATCH_THRESHOLD && currentMatch && 
              <span style={{ color: '#059669' }}> - Match Detected!</span>
            }
          </h3>
        </div>
      )}
    </div>
  );
};

export default MultiARImageMatcher;