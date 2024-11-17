import React, { useRef, useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Firebase Configuration should come from environment variables
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  const videoRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const matchCanvasRef = useRef(null);
  const targetImageRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isMatched, setIsMatched] = useState(false);
  const [lastProcessedTime, setLastProcessedTime] = useState(0);
  const [matchAttempts, setMatchAttempts] = useState(0);

  // Improved RGB to HSV conversion with error handling
  const rgbToHsv = (r, g, b) => {
    try {
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
    } catch (error) {
      console.error('RGB to HSV conversion error:', error);
      return [0, 0, 0];
    }
  };

  // Improved image comparison with more lenient thresholds
  const compareImages = useCallback((imgData1, imgData2) => {
    const width = imgData1.width;
    const height = imgData1.height;
    const blockSize = 16; // Increased block size for better performance
    const hueWeight = 0.4; // Reduced hue importance
    const satWeight = 0.3;
    const valWeight = 0.3; // Increased value importance
    const hueTolerance = 45; // More lenient hue tolerance
    const satTolerance = 40; // More lenient saturation tolerance
    const valTolerance = 40; // More lenient value tolerance
    
    let matchCount = 0;
    let totalBlocks = 0;

    try {
      // Compare blocks of pixels
      for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
          let blockMatchSum = 0;
          let blockPixels = 0;

          // Compare pixels within each block
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

          // More lenient block matching threshold (0.5 instead of 0.6)
          if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.5) {
            matchCount++;
          }
          totalBlocks++;
        }
      }

      // Dynamic similarity threshold based on match attempts
      const rawPercentage = (matchCount / totalBlocks) * 100;
      const scalingFactor = Math.min(2.0 + (matchAttempts * 0.1), 3.0); // Increases with attempts but caps at 3.0
      const adjustedPercentage = Math.min(100, rawPercentage * scalingFactor);
      
      setDebugInfo(`Match: ${adjustedPercentage.toFixed(1)}% (Raw: ${rawPercentage.toFixed(1)}%)`);
      return adjustedPercentage;
      
    } catch (error) {
      console.error('Image comparison error:', error);
      setDebugInfo(`Comparison error: ${error.message}`);
      return 0;
    }
  }, [matchAttempts]);

  // Start video playback
  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;
      await overlayVideoRef.current.play();
      setIsVideoPlaying(true);
      setDebugInfo('Video playing with sound');
    } catch (error) {
      console.error('Video playback error:', error);
      setDebugInfo('Click anywhere to play video with sound');
      
      const playOnClick = () => {
        if (overlayVideoRef.current) {
          overlayVideoRef.current.play()
            .then(() => {
              setIsVideoPlaying(true);
              setDebugInfo('Video playing with sound');
              document.removeEventListener('click', playOnClick);
            })
            .catch(console.error);
        }
      };
      document.addEventListener('click', playOnClick);
    }
  }, [videoUrl, isVideoPlaying]);

  // Improved frame processing with rate limiting and match attempts tracking
  const processCameraFrame = useCallback(() => {
    const now = Date.now();
    if (now - lastProcessedTime < 200) return; // Limit to 5 FPS
    
    if (!videoRef.current || !canvasRef.current || !matchCanvasRef.current) {
      setDebugInfo('Missing video or canvas references');
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      // Ensure proper canvas dimensions
      canvas.width = matchCanvasRef.current.width;
      canvas.height = matchCanvasRef.current.height;

      // Draw and process frame
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);
      const referenceFrame = matchCanvasRef.current.getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height);
      
      const similarity = compareImages(capturedFrame, referenceFrame);
      
      // Dynamic similarity threshold that becomes more lenient over time
      const baseThreshold = 60;
      const dynamicThreshold = Math.max(30, baseThreshold - (matchAttempts * 2));
      const matched = similarity > dynamicThreshold;
      
      if (matched && !isMatched) {
        setIsMatched(true);
        startVideo();
        setMatchAttempts(0); // Reset attempts after successful match
      } else if (!matched && isMatched) {
        setIsMatched(false);
      } else if (!matched) {
        setMatchAttempts(prev => prev + 1); // Increment attempts on failed match
      }

      setLastProcessedTime(now);
      
    } catch (error) {
      console.error('Frame processing error:', error);
      setDebugInfo(`Processing error: ${error.message}`);
    }
  }, [compareImages, isMatched, startVideo, lastProcessedTime, matchAttempts]);

  // Process target image when loaded
  const processTargetImage = useCallback((image) => {
    if (!matchCanvasRef.current) return;
    
    try {
      const canvas = matchCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set optimal size for processing
      canvas.width = 320; // Reduced for better performance
      canvas.height = 240;
      
      // Draw and scale the image
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      setDebugInfo('Target image processed');
    } catch (error) {
      console.error('Target image processing error:', error);
      setDebugInfo(`Image processing error: ${error.message}`);
    }
  }, []);

  // Load content from Firebase
  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key found');
        return;
      }

      try {
        setDebugInfo('Verifying content...');
        const arContentRef = collection(db, 'arContent');
        const q = query(
          arContentRef,
          where('contentKey', '==', contentKey),
          where('isActive', '==', true)
        );

        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setDebugInfo('Invalid or inactive content');
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        
        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);
        setDebugInfo('Content loaded');
        
      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  // Handle target image loading
  useEffect(() => {
    if (!imageUrl) return;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      targetImageRef.current = image;
      processTargetImage(image);
    };
    image.onerror = (error) => {
      console.error('Image loading error:', error);
      setDebugInfo('Failed to load target image');
    };
    image.src = imageUrl;
  }, [imageUrl, processTargetImage]);

  // Camera setup with frame processing
  useEffect(() => {
    let isComponentMounted = true;
    let currentStream = null;
    let frameProcessingInterval = null;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        });

        if (!isComponentMounted) return;

        const videoTrack = stream.getVideoTracks()[0];
        await videoTrack.applyConstraints({
          advanced: [
            { exposureMode: "continuous" },
            { focusMode: "continuous" },
            { whiteBalanceMode: "continuous" }
          ]
        }).catch(console.error);

        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setDebugInfo('Camera ready');
          
          frameProcessingInterval = setInterval(processCameraFrame, 200);
        }
      } catch (error) {
        console.error('Camera error:', error);
        if (isComponentMounted) {
          setDebugInfo(`Camera error: ${error.message}`);
        }
      }
    };

    if (videoUrl) {
      startCamera();
    }

    return () => {
      isComponentMounted = false;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
      if (frameProcessingInterval) {
        clearInterval(frameProcessingInterval);
      }
    };
  }, [videoUrl, processCameraFrame]);

  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'black',
    },
    video: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    },
    overlayVideo: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '80vw', // Increased size for better visibility
      height: '80vh',
      objectFit: 'contain',
      zIndex: 20,
      opacity: isMatched ? 1 : 0,
      transition: 'opacity 0.3s ease',
    },
    canvas: {
      display: 'none',
    },
    matchCanvas: {
      display: 'none',
    },
    debugInfo: {
      position: 'absolute',
      top: 20,
      left: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30,
      fontSize: '14px',
    },
    imagePreview: {
        position: 'absolute',
        bottom: 20,
        right: 20,
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: '10px',
        borderRadius: '5px',
        zIndex: 30,
      },
      previewImage: {
        width: '150px',
        height: '150px',
        objectFit: 'cover',
        borderRadius: '5px',
      },
      matchStatus: {
        position: 'absolute',
        top: 20,
        right: 20,
        backgroundColor: isMatched ? 'rgba(0,255,0,0.7)' : 'rgba(255,0,0,0.7)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        zIndex: 30,
      },
    };

  return (
    <div style={styles.container}>
      {/* Main camera video feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={styles.video}
      />

      {/* Hidden canvases for image processing */}
      <canvas
        ref={canvasRef}
        style={styles.canvas}
      />
      <canvas
        ref={matchCanvasRef}
        style={styles.matchCanvas}
      />

      {/* Overlay video that appears when matched */}
      {videoUrl && (
        <video
          ref={overlayVideoRef}
          style={styles.overlayVideo}
          autoPlay
          playsInline
          loop
          muted={false}
          controls={false}
        />
      )}

      {/* Debug information display */}
      <div style={styles.debugInfo}>
        <div>Status: {debugInfo}</div>
        <div>Key: {contentKey || 'Not found'}</div>
        <div>Camera Active: {videoRef.current?.srcObject ? 'Yes' : 'No'}</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
        <div>Image Matched: {isMatched ? 'Yes' : 'No'}</div>
        <div>Match Attempts: {matchAttempts}</div>
      </div>

      {/* Target image preview */}
      {imageUrl && (
        <div style={styles.imagePreview}>
          <img 
            src={imageUrl} 
            alt="Target" 
            style={styles.previewImage}
            onError={(e) => {
              console.error('Image preview loading error');
              e.target.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Match status indicator */}
      <div style={styles.matchStatus}>
        {isMatched ? 'Match Found!' : 'Scanning...'}
      </div>
    </div>
  );
};

export default App;