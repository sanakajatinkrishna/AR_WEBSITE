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
  // URL Parameters
  const contentKey = new URLSearchParams(window.location.search).get('key');

  // Refs
  const videoRef = useRef(null);
  const overlayVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const matchCanvasRef = useRef(null);

  // State
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [debugInfo, setDebugInfo] = useState('Initializing...');
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isMatched, setIsMatched] = useState(false);
  const [referenceData, setReferenceData] = useState(null);

  // Create reference screenshot when image loads
  const createReferenceScreenshot = useCallback((image) => {
    try {
      if (!matchCanvasRef.current) {
        setDebugInfo('Reference canvas not ready');
        return;
      }
      
      const canvas = matchCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Set fixed dimensions for consistency
      canvas.width = 640;
      canvas.height = 480;
      
      // Clear canvas and draw new image
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      
      // Store the reference image data
      const referenceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setReferenceData(referenceImageData);
      setDebugInfo('Reference image captured');
    } catch (error) {
      console.error('Error creating reference screenshot:', error);
      setDebugInfo('Error creating reference image');
    }
  }, []);

  // Compare images
  const compareImages = useCallback((capturedFrame) => {
    if (!referenceData || !capturedFrame) return 0;

    try {
      const width = capturedFrame.width;
      const height = capturedFrame.height;
      const blockSize = 8;
      let matchCount = 0;
      let totalBlocks = 0;

      // Compare blocks of pixels
      for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
          let blockMatchSum = 0;
          let blockPixels = 0;

          // Compare pixels within each block
          for (let by = 0; by < blockSize && y + by < height; by++) {
            for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
              const i = ((y + by) * width + (x + bx)) * 4;
              
              // Get RGB values from both images
              const r1 = capturedFrame.data[i];
              const g1 = capturedFrame.data[i + 1];
              const b1 = capturedFrame.data[i + 2];
              
              const r2 = referenceData.data[i];
              const g2 = referenceData.data[i + 1];
              const b2 = referenceData.data[i + 2];

              // Calculate color difference
              const colorDiff = (
                Math.abs(r1 - r2) +
                Math.abs(g1 - g2) +
                Math.abs(b1 - b2)
              ) / 3;

              // Consider it a match if difference is small
              const isMatch = colorDiff < 50;
              blockMatchSum += isMatch ? 1 : 0;
              blockPixels++;
            }
          }

          // If block has a good match percentage, count it
          if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.6) {
            matchCount++;
          }
          totalBlocks++;
        }
      }

      // Calculate final match percentage
      return (matchCount / totalBlocks) * 100;
    } catch (error) {
      console.error('Error comparing images:', error);
      return 0;
    }
  }, [referenceData]);

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

  // Process camera frame
  const processCameraFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceData) return;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      // Match canvas dimensions with reference image
      canvas.width = 640;
      canvas.height = 480;

      // Draw current video frame
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get current frame data
      const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);
      
      // Compare with reference
      const similarity = compareImages(capturedFrame);
      setDebugInfo(`Similarity: ${similarity.toFixed(1)}%`);

      const SIMILARITY_THRESHOLD = 60;
      const matched = similarity > SIMILARITY_THRESHOLD;
      
      if (matched && !isMatched) {
        setIsMatched(true);
        startVideo();
      } else if (!matched && isMatched) {
        setIsMatched(false);
      }
    } catch (error) {
      console.error('Error processing camera frame:', error);
      setDebugInfo('Error processing camera frame');
    }
  }, [compareImages, isMatched, startVideo, referenceData]);

  // Load content from Firebase
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
          setDebugInfo('Invalid or inactive content key');
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        
        setVideoUrl(data.videoUrl);
        setImageUrl(data.imageUrl);
        setDebugInfo('Content loaded successfully');
        
      } catch (error) {
        console.error('Error loading content:', error);
        setDebugInfo('Error loading content from Firebase');
      }
    };

    loadContent();
  }, [contentKey]);

  // Handle image loading
  useEffect(() => {
    if (!imageUrl) return;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    
    image.onload = () => {
      createReferenceScreenshot(image);
    };
    
    image.onerror = (error) => {
      console.error('Error loading image:', error);
      setDebugInfo('Error loading reference image');
    };
    
    image.src = imageUrl;
  }, [imageUrl, createReferenceScreenshot]);

  // Setup camera
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
            height: { ideal: 720 }
          }
        });

        if (!isComponentMounted) return;

        currentStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setDebugInfo('Camera active');
          
          frameProcessingInterval = setInterval(processCameraFrame, 500);
        }
      } catch (error) {
        console.error('Camera error:', error);
        setDebugInfo('Error accessing camera');
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
      display: 'none'
    },
    matchCanvas: {
      display: 'none'
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
      fontFamily: 'monospace'
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
        <div>Reference Image: {referenceData ? 'Loaded' : 'Not Loaded'}</div>
        <div>Camera Active: {videoRef.current?.srcObject ? 'Yes' : 'No'}</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
        <div>Image Matched: {isMatched ? 'Yes' : 'No'}</div>
      </div>

      {imageUrl && (
        <div style={styles.imagePreview}>
          <img 
            src={imageUrl} 
            alt="Target" 
            style={styles.previewImage}
            crossOrigin="anonymous"
          />
        </div>
      )}
    </div>
  );
};

export default App;