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
  const [lastError, setLastError] = useState(null);

  // Compare images
  const compareImages = useCallback((capturedFrame) => {
    if (!referenceData || !capturedFrame) {
      return 0;
    }

    try {
      const width = capturedFrame.width;
      const height = capturedFrame.height;
      const blockSize = 8;
      let matchCount = 0;
      let totalBlocks = 0;

      for (let y = 0; y < height; y += blockSize) {
        for (let x = 0; x < width; x += blockSize) {
          let blockMatchSum = 0;
          let blockPixels = 0;

          for (let by = 0; by < blockSize && y + by < height; by++) {
            for (let bx = 0; bx < blockSize && x + bx < width; bx++) {
              const i = ((y + by) * width + (x + bx)) * 4;
              
              const r1 = capturedFrame.data[i];
              const g1 = capturedFrame.data[i + 1];
              const b1 = capturedFrame.data[i + 2];
              
              const r2 = referenceData.data[i];
              const g2 = referenceData.data[i + 1];
              const b2 = referenceData.data[i + 2];

              const colorDiff = (
                Math.abs(r1 - r2) +
                Math.abs(g1 - g2) +
                Math.abs(b1 - b2)
              ) / 3;

              const isMatch = colorDiff < 50;
              blockMatchSum += isMatch ? 1 : 0;
              blockPixels++;
            }
          }

          if (blockPixels > 0 && (blockMatchSum / blockPixels) > 0.6) {
            matchCount++;
          }
          totalBlocks++;
        }
      }

      return (matchCount / totalBlocks) * 100;
    } catch (error) {
      console.error('Comparison error:', error);
      setLastError('Image comparison failed: ' + error.message);
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
      
      const playOnClick = async () => {
        if (overlayVideoRef.current) {
          try {
            await overlayVideoRef.current.play();
            setIsVideoPlaying(true);
            setDebugInfo('Video playing with sound');
            document.removeEventListener('click', playOnClick);
          } catch (err) {
            console.error('Click play error:', err);
            setLastError('Video play failed: ' + err.message);
          }
        }
      };
      document.addEventListener('click', playOnClick);
    }
  }, [videoUrl, isVideoPlaying]);

  // Process camera frame
  const processCameraFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !referenceData) {
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      canvas.width = 640;
      canvas.height = 480;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const capturedFrame = context.getImageData(0, 0, canvas.width, canvas.height);
      
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
      console.error('Frame processing error:', error);
      setLastError('Frame processing failed: ' + error.message);
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
        setDebugInfo('Loading content from Firebase...');
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
        
        if (!data.imageUrl) {
          setDebugInfo('No image URL in Firebase document');
          return;
        }

        if (!data.videoUrl) {
          setDebugInfo('No video URL in Firebase document');
          return;
        }

        setDebugInfo('Firebase data loaded, setting URLs...');
        
        // Set video URL first
        setVideoUrl(data.videoUrl);
        
        // Set image URL with a slight delay
        setTimeout(() => {
          setImageUrl(data.imageUrl);
        }, 100);

      } catch (error) {
        console.error('Firebase load error:', error);
        setLastError('Firebase load failed: ' + error.message);
      }
    };

    loadContent();
  }, [contentKey]);

  // Handle image loading
  useEffect(() => {
    if (!imageUrl) {
      setDebugInfo('No image URL available');
      return;
    }

    setDebugInfo('Starting image load...');

    const loadImage = async () => {
      try {
        const image = new Image();
        
        const imageLoadPromise = new Promise((resolve, reject) => {
          image.onload = () => resolve(image);
          image.onerror = (e) => reject(new Error('Failed to load image: ' + e));
        });

        image.crossOrigin = 'anonymous';
        image.src = imageUrl + '?t=' + new Date().getTime(); // Prevent caching

        const loadedImage = await imageLoadPromise;
        setDebugInfo('Image loaded successfully, creating reference...');
        
        if (!matchCanvasRef.current) {
          throw new Error('Reference canvas not available');
        }

        const canvas = matchCanvasRef.current;
        const ctx = canvas.getContext('2d');

        canvas.width = 640;
        canvas.height = 480;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(loadedImage, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setReferenceData(imageData);
        setDebugInfo('Reference image created successfully');

      } catch (error) {
        console.error('Image loading error:', error);
        setLastError('Image load failed: ' + error.message);
        setDebugInfo('Error loading image - retrying...');

        // Retry after 2 seconds
        setTimeout(loadImage, 2000);
      }
    };

    loadImage();
  }, [imageUrl]);

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
        setLastError('Camera access failed: ' + error.message);
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
      fontFamily: 'monospace',
      fontSize: '12px',
      maxWidth: '80%',
      wordWrap: 'break-word'
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
        <div>Image URL: {imageUrl ? 'Present' : 'Missing'}</div>
        <div>Reference Data: {referenceData ? `${referenceData.width}x${referenceData.height}` : 'Not loaded'}</div>
        <div>Camera Active: {videoRef.current?.srcObject ? 'Yes' : 'No'}</div>
        <div>Video Playing: {isVideoPlaying ? 'Yes' : 'No'}</div>
        <div>Image Matched: {isMatched ? 'Yes' : 'No'}</div>
        {lastError && <div style={{color: 'red'}}>Error: {lastError}</div>}
        <div>Last Update: {new Date().toLocaleTimeString()}</div>
      </div>

      {imageUrl && (
        <div style={styles.imagePreview}>
          <img 
            src={`${imageUrl}?t=${new Date().getTime()}`}
            alt="Target" 
            style={styles.previewImage}
            crossOrigin="anonymous"
            onError={(e) => {
              console.error('Preview image load error:', e);
              setLastError('Preview image load failed');
            }}
            onLoad={() => {
              console.log('Preview image loaded successfully');
            }}
          />
        </div>
      )}
    </div>
  );
};

export default App;