import React, { useRef, useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

// Firebase Configuration
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

  // Function to convert RGB to HSV for better comparison
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

  const compareImages = useCallback((cameraCanvas, targetCanvas) => {
    const cameraCtx = cameraCanvas.getContext('2d');
    const targetCtx = targetCanvas.getContext('2d');
    
    const blockSize = 8; // Compare blocks of pixels instead of individual pixels
    const hueWeight = 0.5;
    const satWeight = 0.3;
    const valWeight = 0.2;
    const hueTolerance = 30; // Degrees
    const satTolerance = 30; // Percent
    const valTolerance = 30; // Percent
    
    let bestMatchScore = 0;

    // Scan through the camera feed in sections
    const scanSize = 50; // How many pixels to move per scan
    
    for (let scanY = 0; scanY <= cameraCanvas.height - targetCanvas.height; scanY += scanSize) {
      for (let scanX = 0; scanX <= cameraCanvas.width - targetCanvas.width; scanX += scanSize) {
        let matchCount = 0;
        let totalBlocks = 0;

        // Get the current section of camera feed
        const cameraSection = cameraCtx.getImageData(scanX, scanY, targetCanvas.width, targetCanvas.height);
        const targetSection = targetCtx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);

        // Compare blocks of pixels within this section
        for (let y = 0; y < targetCanvas.height; y += blockSize) {
          for (let x = 0; x < targetCanvas.width; x += blockSize) {
            let blockMatchSum = 0;
            let blockPixels = 0;

            // Compare pixels within each block
            for (let by = 0; by < blockSize && y + by < targetCanvas.height; by++) {
              for (let bx = 0; bx < blockSize && x + bx < targetCanvas.width; bx++) {
                const i = ((y + by) * targetCanvas.width + (x + bx)) * 4;
                
                // Get RGB values for camera image
                const r1 = cameraSection.data[i];
                const g1 = cameraSection.data[i + 1];
                const b1 = cameraSection.data[i + 2];
                
                // Get RGB values for target image
                const r2 = targetSection.data[i];
                const g2 = targetSection.data[i + 1];
                const b2 = targetSection.data[i + 2];

                // Convert both to HSV
                const hsv1 = rgbToHsv(r1, g1, b1);
                const hsv2 = rgbToHsv(r2, g2, b2);

                // Compare HSV values with weighted importance
                const hueDiff = Math.abs(hsv1[0] - hsv2[0]);
                const satDiff = Math.abs(hsv1[1] - hsv2[1]);
                const valDiff = Math.abs(hsv1[2] - hsv2[2]);

                // Calculate match score for this pixel
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

            // If block has a good average match, count it
            if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.6) {
              matchCount++;
            }
            totalBlocks++;
          }
        }

        // Calculate score for this section
        const sectionScore = (matchCount / totalBlocks) * 100;
        if (sectionScore > bestMatchScore) {
          bestMatchScore = sectionScore;
        }
      }
    }
    
    // Apply a curve to increase sensitivity in the middle range
    return Math.min(100, bestMatchScore * 1.5);
  }, []);

  const processTargetImage = useCallback((image) => {
    if (!matchCanvasRef.current) return;
    
    const canvas = matchCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set a reasonable size for processing
    const MAX_SIZE = 300;
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    
    // Scale down the image if it's too large
    if (width > height) {
      if (width > MAX_SIZE) {
        height = height * (MAX_SIZE / width);
        width = MAX_SIZE;
      }
    } else {
      if (height > MAX_SIZE) {
        width = width * (MAX_SIZE / height);
        height = MAX_SIZE;
      }
    }
    
    // Set canvas size to scaled dimensions
    canvas.width = width;
    canvas.height = height;
    
    // Draw the image
    ctx.drawImage(image, 0, 0, width, height);
    setDebugInfo('Target image processed');
  }, []);

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

  const processCameraFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !matchCanvasRef.current || !targetImageRef.current) return;

    const context = canvasRef.current.getContext('2d');
    
    // Set canvas dimensions to match video
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;
    
    if (canvasRef.current.width !== videoWidth || canvasRef.current.height !== videoHeight) {
      canvasRef.current.width = videoWidth;
      canvasRef.current.height = videoHeight;
    }
    
    // Draw current frame to canvas
    context.drawImage(videoRef.current, 0, 0);
    
    // Compare images
    const similarity = compareImages(canvasRef.current, matchCanvasRef.current);
    setDebugInfo(`Similarity: ${similarity.toFixed(1)}%`);

    const SIMILARITY_THRESHOLD = 40; // Adjusted threshold for the new matching algorithm
    const matched = similarity > SIMILARITY_THRESHOLD;
    
    if (matched && !isMatched) {
      setIsMatched(true);
      startVideo();
    } else if (!matched && isMatched) {
      setIsMatched(false);
    }
  }, [compareImages, isMatched, startVideo]);

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
        }).catch(() => {});

        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setDebugInfo('Camera ready');
          
          // Start frame processing
          frameProcessingInterval = setInterval(processCameraFrame, 500);
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
      backgroundColor: 'black'
    },
    video: {
      position: 'absolute',
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    },
    overlayVideo: {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '40vw',
      height: '40vh',
      objectFit: 'contain',
      zIndex: 20,
      opacity: isMatched ? 1 : 0,
      transition: 'opacity 0.3s ease'
    },
    canvas: {
      display: 'none'  // Hidden canvas for processing
    },
    matchCanvas: {
      display: 'none'  // Hidden canvas for target image
    },
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
    imagePreview: {
      position: 'absolute',
      bottom: 20,
      right: 20,
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: '10px',
      borderRadius: '5px',
      zIndex: 30
    },
    previewImage: {
      width: '150px',
      height: '150px',
      objectFit: 'cover',
      borderRadius: '5px'
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

      <canvas
        ref={matchCanvasRef}
        style={styles.matchCanvas}
      />

      {videoUrl && (
        <video
          ref={overlayVideoRef}
          style={styles.overlayVideo}
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
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
        <div>Image Matched: {isMatched ? 'Yes' : 'No'}</div>
      </div>

      {imageUrl && (
        <div style={styles.imagePreview}>
          <img src={imageUrl} alt="Target" style={styles.previewImage} />
        </div>
      )}
    </div>
  );
};

export default App;