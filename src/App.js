import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Configuration constants for optimal performance
const MATCHING_THRESHOLD = 45;
const MIN_SCAN_SIZE = 60;
const MAX_SCAN_SIZE = 400;
const SCAN_STEPS = 20;
const FEATURE_POINTS_THRESHOLD = 200;

// Helper functions for image processing
const rgbToHsv = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  if (max === min) {
    h = 0;
  } else if (max === r) {
    h = 60 * ((g - b) / diff);
  } else if (max === g) {
    h = 60 * (2 + (b - r) / diff);
  } else {
    h = 60 * (4 + (r - g) / diff);
  }

  if (h < 0) h += 360;

  const s = max === 0 ? 0 : diff / max;
  const v = max;

  return { h, s, v };
};

const getImageFeatures = (imageData) => {
  const features = [];
  const width = imageData.width;

  for (let y = 1; y < imageData.height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      // Calculate gradient
      const gx = (
        imageData.data[idx + 4] - 
        imageData.data[idx - 4]
      );
      
      const gy = (
        imageData.data[idx + width * 4] -
        imageData.data[idx - width * 4]
      );
      
      const gradient = Math.sqrt(gx * gx + gy * gy);
      
      if (gradient > 30) { // Threshold for edge detection
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];
        const hsv = rgbToHsv(r, g, b);
        
        features.push({
          x,
          y,
          gradient,
          color: { h: hsv.h, s: hsv.s, v: hsv.v }
        });
      }
    }
  }

  return features;
};

const compareFeatures = (features1, features2) => {
  let matches = 0;
  const threshold = 30; // Color and position tolerance

  for (const f1 of features1) {
    for (const f2 of features2) {
      const colorDiff = Math.abs(f1.color.h - f2.color.h);
      const posDiff = Math.sqrt(
        Math.pow(f1.x - f2.x, 2) + 
        Math.pow(f1.y - f2.y, 2)
      );
      
      if (colorDiff < threshold && posDiff < threshold) {
        matches++;
        break;
      }
    }
  }

  return (matches / Math.min(features1.length, features2.length)) * 100;
};

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const animationFrameRef = useRef(null);
  const referenceImageRef = useRef(null);
  const referenceFeatures = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [matchPercentage, setMatchPercentage] = useState(0);
  const [bestMatch, setBestMatch] = useState(null);

// ... continuing from Part 1

  const calculateImageMatch = useCallback((capturedCtx, x, y, width, height) => {
    if (!referenceFeatures.current) return 0;

    try {
      // Get region from camera feed and scale it
      const capturedData = capturedCtx.getImageData(x, y, width, height);
      
      // Create temporary canvas for scaling
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      
      // Draw captured region to temp canvas
      const imageData = new ImageData(capturedData.data, width, height);
      tempCtx.putImageData(imageData, 0, 0);

      // Extract features from captured region
      const capturedFeatures = getImageFeatures(capturedData);

      // Skip if not enough features found
      if (capturedFeatures.length < FEATURE_POINTS_THRESHOLD) {
        return 0;
      }

      // Compare features
      const matchScore = compareFeatures(referenceFeatures.current, capturedFeatures);
      
      return matchScore;
    } catch (error) {
      console.error('Match calculation error:', error);
      return 0;
    }
  }, []);

  const scanFrame = useCallback((context, canvasWidth, canvasHeight) => {
    if (!referenceFeatures.current) return null;

    let bestMatch = {
      percentage: 0,
      position: null,
      size: null
    };

    // Calculate optimal scanning parameters
    const aspectRatio = referenceImageRef.current.width / referenceImageRef.current.height;
    const scanSizes = [];
    
    // Generate scan sizes maintaining aspect ratio
    for (let width = MIN_SCAN_SIZE; width <= MAX_SCAN_SIZE; width += SCAN_STEPS) {
      scanSizes.push({
        width,
        height: width / aspectRatio
      });
    }

    // Scan frame with different sizes
    for (const size of scanSizes) {
      const xSteps = Math.max(1, Math.floor((canvasWidth - size.width) / SCAN_STEPS));
      const ySteps = Math.max(1, Math.floor((canvasHeight - size.height) / SCAN_STEPS));

      for (let y = 0; y <= canvasHeight - size.height; y += ySteps) {
        for (let x = 0; x <= canvasWidth - size.width; x += xSteps) {
          const match = calculateImageMatch(
            context,
            x,
            y,
            size.width,
            size.height
          );

          if (match > bestMatch.percentage) {
            bestMatch = {
              percentage: match,
              position: { x, y },
              size: { width: size.width, height: size.height }
            };

            // Early exit if we find a very good match
            if (match > 75) {
              return bestMatch;
            }
          }
        }
      }
    }

    return bestMatch.percentage >= MATCHING_THRESHOLD ? bestMatch : null;
  }, [calculateImageMatch]);

  const startVideo = useCallback(async () => {
    if (!overlayVideoRef.current || !videoUrl || isVideoPlaying) return;

    try {
      overlayVideoRef.current.src = videoUrl;
      overlayVideoRef.current.muted = false;

      // Preload video
      await overlayVideoRef.current.load();
      
      const playPromise = overlayVideoRef.current.play();
      if (playPromise) {
        await playPromise;
        setIsVideoPlaying(true);
        setDebugInfo('Video playing with sound');
      }
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

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const context = canvas.getContext('2d', { 
      willReadFrequently: true,
      alpha: false 
    });

    // Update canvas dimensions if needed
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    // Draw current frame
    context.drawImage(video, 0, 0);
    
    // Scan for matches
    const match = scanFrame(context, canvas.width, canvas.height);
    
    if (match) {
      setMatchPercentage(Math.round(match.percentage));
      setBestMatch(match);
      
      if (!isVideoPlaying) {
        startVideo();
      }
    } else {
      setMatchPercentage(0);
      setBestMatch(null);
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [scanFrame, startVideo, isVideoPlaying]);

  useEffect(() => {
    const loadContent = async () => {
      if (!contentKey) {
        setDebugInfo('No content key found');
        return;
      }

      try {
        setDebugInfo('Loading content...');

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

        // Set URLs
        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);
        
        // Load and process reference image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          // Store reference image
          referenceImageRef.current = canvas;
          
          // Extract and store features
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          referenceFeatures.current = getImageFeatures(imageData);
          
          setDebugInfo('Content loaded - Ready to scan');
        };

        img.src = data.imageUrl;

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  useEffect(() => {
    let isComponentMounted = true;
    let currentStream = null;

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
        }).catch(() => {});

        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          
          if (isComponentMounted) {
            setDebugInfo('Camera ready - Scanning for image');
            animationFrameRef.current = requestAnimationFrame(processFrame);
          }
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
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [processFrame, videoUrl]);

// ... continuing from Part 2

  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'black',
      overflow: 'hidden'
    },
    video: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    },
    canvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      display: 'none'
    },
    overlayVideo: bestMatch ? {
      position: 'absolute',
      top: 0,
      left: 0,
      transform: `translate(${bestMatch.position.x}px, ${bestMatch.position.y}px)`,
      width: `${bestMatch.size.width}px`,
      height: `${bestMatch.size.height}px`,
      objectFit: 'fill',
      zIndex: 20,
      transition: 'all 0.1s ease-out',
      willChange: 'transform', // Optimize performance
      backfaceVisibility: 'hidden', // Optimize performance
    } : {},
    debugInfo: {
      position: 'absolute',
      top: 20,
      left: 20,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30,
      fontSize: '14px',
      fontFamily: 'monospace',
      maxWidth: '300px',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    referenceImage: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: '150px',
      height: '150px',
      objectFit: 'contain',
      borderRadius: '8px',
      opacity: 0.7,
      zIndex: 30,
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      padding: '5px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      backdropFilter: 'blur(4px)',
      transition: 'opacity 0.3s ease'
    },
    matchIndicator: {
      position: 'absolute',
      top: 20,
      right: 20,
      backgroundColor: matchPercentage >= MATCHING_THRESHOLD 
        ? 'rgba(0, 255, 0, 0.7)' 
        : 'rgba(255, 0, 0, 0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30,
      fontSize: '14px',
      fontFamily: 'monospace',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      transition: 'background-color 0.3s ease'
    },
    loadingOverlay: isVideoPlaying ? null : {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 40,
      color: 'white',
      fontSize: '18px',
      textAlign: 'center'
    }
  };

  return (
    <div style={styles.container}>
      {/* Camera Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={styles.video}
      />

      {/* Processing Canvas */}
      <canvas
        ref={canvasRef}
        style={styles.canvas}
      />

      {/* AR Video Overlay */}
      {bestMatch && matchPercentage >= MATCHING_THRESHOLD && (
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

      {/* Debug Information */}
      <div style={styles.debugInfo}>
        <div>Status: {debugInfo}</div>
        <div>Key: {contentKey || 'Not found'}</div>
        <div>Camera: {videoRef.current?.srcObject ? 'Active' : 'Inactive'}</div>
        <div>Features Found: {referenceFeatures.current?.length || 0}</div>
        <div>Video State: {isVideoPlaying ? 'Playing' : 'Waiting'}</div>
      </div>

      {/* Match Percentage Indicator */}
      <div style={styles.matchIndicator}>
        Match: {Math.round(matchPercentage)}%
      </div>

      {/* Reference Image */}
      {imageUrl && (
        <img 
          src={imageUrl}
          alt="AR marker to scan"
          style={styles.referenceImage}
          onLoad={(e) => {
            e.target.style.opacity = '1';
          }}
        />
      )}

      {/* Loading Overlay */}
      {!isVideoPlaying && bestMatch && matchPercentage >= MATCHING_THRESHOLD && (
        <div style={styles.loadingOverlay}>
          <div>
            <div>Loading Video...</div>
            <div style={{ fontSize: '14px', marginTop: '10px' }}>
              Tap anywhere to start playback
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;