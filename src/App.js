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

  // Custom image matching function
  const compareImages = useCallback((canvas1, canvas2, threshold = 20, sampleSize = 32) => {
    const ctx1 = canvas1.getContext('2d');
    const ctx2 = canvas2.getContext('2d');
    
    // Get image data from both canvases
    const img1 = ctx1.getImageData(0, 0, canvas1.width, canvas1.height);
    const img2 = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
    
    const data1 = img1.data;
    const data2 = img2.data;

    let matchCount = 0;
    let totalChecks = 0;

    // Compare pixels at regular intervals (sampling)
    for (let y = 0; y < canvas1.height; y += sampleSize) {
      for (let x = 0; x < canvas1.width; x += sampleSize) {
        const i = (y * canvas1.width + x) * 4;
        
        // Compare RGB values with threshold
        const diffR = Math.abs(data1[i] - data2[i]);
        const diffG = Math.abs(data1[i + 1] - data2[i + 1]);
        const diffB = Math.abs(data1[i + 2] - data2[i + 2]);
        
        if (diffR < threshold && diffG < threshold && diffB < threshold) {
          matchCount++;
        }
        totalChecks++;
      }
    }

    const similarity = (matchCount / totalChecks) * 100;
    return similarity;
  }, []);

  // Process target image when loaded
  const processTargetImage = useCallback((image) => {
    if (!matchCanvasRef.current) return;
    
    const canvas = matchCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Set canvas size to match image dimensions
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    
    // Draw image to canvas
    ctx.drawImage(image, 0, 0);
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

  // Process camera frame and compare with target image
  const processCameraFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !matchCanvasRef.current || !targetImageRef.current) return;

    const context = canvasRef.current.getContext('2d');
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    
    // Draw current frame to canvas
    context.drawImage(videoRef.current, 0, 0);
    
    // Compare images
    const similarity = compareImages(canvasRef.current, matchCanvasRef.current);
    setDebugInfo(`Similarity: ${similarity.toFixed(1)}%`);

    const SIMILARITY_THRESHOLD = 60; // Adjust this value based on testing
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