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

  const compareImages = useCallback((cameraCanvas, targetCanvas, threshold = 30) => {
    const cameraCtx = cameraCanvas.getContext('2d');
    const targetCtx = targetCanvas.getContext('2d');
    
    // Get target image data
    const targetData = targetCtx.getImageData(0, 0, targetCanvas.width, targetCanvas.height).data;
    
    // We'll scan the camera feed in sections the size of the target image
    const scanSize = 50; // How many pixels to move per scan
    let bestMatch = 0;

    for (let y = 0; y <= cameraCanvas.height - targetCanvas.height; y += scanSize) {
      for (let x = 0; x <= cameraCanvas.width - targetCanvas.width; x += scanSize) {
        // Get the current section of the camera feed
        const cameraData = cameraCtx.getImageData(x, y, targetCanvas.width, targetCanvas.height).data;
        
        let matchCount = 0;
        let totalChecks = 0;
        
        // Sample pixels at intervals
        const sampleInterval = 8; // Check every 8th pixel
        
        for (let i = 0; i < targetData.length; i += (4 * sampleInterval)) {
          const r1 = targetData[i];
          const g1 = targetData[i + 1];
          const b1 = targetData[i + 2];
          
          const r2 = cameraData[i];
          const g2 = cameraData[i + 1];
          const b2 = cameraData[i + 2];
          
          // Calculate color difference
          const colorDiff = Math.sqrt(
            Math.pow(r1 - r2, 2) +
            Math.pow(g1 - g2, 2) +
            Math.pow(b1 - b2, 2)
          );
          
          if (colorDiff < threshold) {
            matchCount++;
          }
          totalChecks++;
        }
        
        const similarity = (matchCount / totalChecks) * 100;
        if (similarity > bestMatch) {
          bestMatch = similarity;
        }
      }
    }
    
    return bestMatch;
  }, []);

  const processTargetImage = useCallback((image) => {
    if (!matchCanvasRef.current) return;
    
    const canvas = matchCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set a fixed size for processing the target image
    const MAX_SIZE = 200;
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
    
    // Draw and normalize the image
    ctx.drawImage(image, 0, 0, width, height);
    
    // Apply some preprocessing to help with matching
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    // Basic image normalization
    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale and normalize contrast
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = avg;     // R
      data[i + 1] = avg; // G
      data[i + 2] = avg; // B
    }
    
    ctx.putImageData(imageData, 0, 0);
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

    const SIMILARITY_THRESHOLD = 25; // Lower threshold since we're scanning portions
    const matched = similarity > SIMILARITY_THRESHOLD;
    
    if (matched && !isMatched) {
      setIsMatched(true);
      startVideo();
    } else if (!matched && isMatched) {
      setIsMatched(false);
    }
  }, [compareImages, isMatched, startVideo]);

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