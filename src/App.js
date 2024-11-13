import React, { useRef, useState, useCallback, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Firebase config remains the same
const firebaseConfig = {
  apiKey: "AIzaSyCTNhBokqTimxo-oGstSA8Zw8jIXO3Nhn4",
  authDomain: "app-1238f.firebaseapp.com",
  projectId: "app-1238f",
  storageBucket: "app-1238f.appspot.com",
  messagingSenderId: "12576842624",
  appId: "1:12576842624:web:92eb40fd8c56a9fc475765",
  measurementId: "G-N5Q9K9G3JN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const MATCHING_THRESHOLD = 50; // Percentage match required
const SCAN_STEP = 20; // Pixels to move when scanning
const MIN_SCAN_SIZE = 100; // Minimum size to scan for
const MAX_SCAN_SIZE = 400; // Maximum size to scan for
const SIZE_STEP = 50; // Size increment for scanning

const App = () => {
  const contentKey = new URLSearchParams(window.location.search).get('key');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const animationFrameRef = useRef(null);
  const referenceImageRef = useRef(null);

  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [matchPercentage, setMatchPercentage] = useState(0);
  const [bestMatch, setBestMatch] = useState(null);

  const calculateImageMatch = useCallback((capturedCtx, x, y, width, height, referenceCanvas) => {
    if (!referenceCanvas) return 0;

    try {
      // Get the image data from the captured region
      const capturedData = capturedCtx.getImageData(x, y, width, height);
      
      // Scale the reference image to match the captured size
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(referenceCanvas, 0, 0, width, height);
      const referenceData = tempCtx.getImageData(0, 0, width, height);

      let matchingPixels = 0;
      const totalPixels = (width * height);
      const stride = 4; // Skip some pixels for performance

      for (let i = 0; i < capturedData.data.length; i += (4 * stride)) {
        const capturedR = capturedData.data[i];
        const capturedG = capturedData.data[i + 1];
        const capturedB = capturedData.data[i + 2];
        
        const refR = referenceData.data[i];
        const refG = referenceData.data[i + 1];
        const refB = referenceData.data[i + 2];
        
        const colorDiff = Math.sqrt(
          Math.pow(capturedR - refR, 2) +
          Math.pow(capturedG - refG, 2) +
          Math.pow(capturedB - refB, 2)
        );
        
        if (colorDiff < 100) {
          matchingPixels++;
        }
      }

      return (matchingPixels / (totalPixels / stride)) * 100;
    } catch (error) {
      console.error('Match calculation error:', error);
      return 0;
    }
  }, []);

  const scanFrame = useCallback((context, canvasWidth, canvasHeight) => {
    if (!referenceImageRef.current) return null;

    let bestMatch = {
      percentage: 0,
      position: null,
      size: null
    };

    // Scan different sizes
    for (let size = MIN_SCAN_SIZE; size <= MAX_SCAN_SIZE; size += SIZE_STEP) {
      // Maintain aspect ratio
      const refAspect = referenceImageRef.current.width / referenceImageRef.current.height;
      const scanWidth = size;
      const scanHeight = size / refAspect;

      // Scan positions
      for (let y = 0; y <= canvasHeight - scanHeight; y += SCAN_STEP) {
        for (let x = 0; x <= canvasWidth - scanWidth; x += SCAN_STEP) {
          const match = calculateImageMatch(
            context,
            x,
            y,
            scanWidth,
            scanHeight,
            referenceImageRef.current
          );

          if (match > bestMatch.percentage) {
            bestMatch = {
              percentage: match,
              position: { x, y },
              size: { width: scanWidth, height: scanHeight }
            };
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

    // Ensure canvas size matches video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    // Draw the current video frame
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

  // Load content effect
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
        
        // Load reference image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          referenceImageRef.current = canvas;
          setDebugInfo('Content loaded - Scanning for image...');
        };
        img.src = data.imageUrl;

      } catch (error) {
        console.error('Content loading error:', error);
        setDebugInfo(`Error: ${error.message}`);
      }
    };

    loadContent();
  }, [contentKey]);

  // Camera setup effect
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
            setDebugInfo('Camera ready - Scanning for image...');
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

  const styles = {
    container: {
      position: 'fixed',
      inset: 0,
      backgroundColor: 'black'
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
      transition: 'all 0.1s ease-out'
    } : {},
    debugInfo: {
      position: 'absolute',
      top: 20,
      left: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30
    },
    referenceImage: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      width: '150px',
      height: '150px',
      objectFit: 'contain',
      borderRadius: '5px',
      opacity: 0.7,
      zIndex: 30,
      backgroundColor: 'rgba(0,0,0,0.3)',
      padding: '5px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.2)'
    },
    matchIndicator: {
      position: 'absolute',
      top: 20,
      right: 20,
      backgroundColor: matchPercentage >= MATCHING_THRESHOLD ? 'rgba(0,255,0,0.7)' : 'rgba(255,0,0,0.7)',
      color: 'white',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30
    }
  };

  return (
    <div style={styles.container}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={styles.video}
      />

      <canvas
        ref={canvasRef}
        style={styles.canvas}
      />

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

      <div style={styles.debugInfo}>
        <div>Status: {debugInfo}</div>
        <div>Key: {contentKey || 'Not found'}</div>
        <div>Camera Active: {videoRef.current?.srcObject ? 'Yes' : 'No'}</div>
        <div>Scanning: Active</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
      </div>

      <div style={styles.matchIndicator}>
        Match: {matchPercentage}%
      </div>

      {imageUrl && (
        <img 
          src={imageUrl}
          alt="AR marker to scan"
          style={styles.referenceImage}
        />
      )}
    </div>
  );
};

export default App;